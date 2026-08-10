"""本地大模型（llama.cpp / OpenAI 兼容）统一调用层。

设计目标：与具体页面解耦，提供一组可复用的原语，供「术曲思考」或未来任何页面调用。
- health()        探测本地模型服务状态（含双模型信息）
- chat()          一次性非流式对话（失败自动降级重试）
- stream_chat()   流式对话（失败自动降级重试），前端用 SSE 透传
- switch_model()  手动切换 4B / 2B
- build_messages_for_song()  把术曲实时数据组装成分析 prompt（术曲思考专用封装）

模型说明：默认双模型故障转移——4B（DeepSeek-V4-Pro-Qwen3.5-4B-MTP，端口 8080）为主，
2B（qwen3.5-2B-deepseek-v4，端口 8081）为备用。若 4B 加载或生成时报 OOM
（显存不足 / out of memory / Vulkan alloc 失败），自动拉起并切换到 2B。
两个模型均为蒸馏思维链模型，始终会思考，因此给足 max_tokens 预算（思考 + 正文）。
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import threading
import time
import urllib.parse
from typing import Iterator

import httpx
from bs4 import BeautifulSoup

# Agent 工具所需的数据服务（云端 tool-calling 用）。放在此处避免循环导入。
from app.core import db as _db
from app.services import boards as _boards
from app.services import crawler as _crawler
from app.services import songs as _songs
from app.services import netease as _netease
from app.services import translate as _translate
from app.services import rank as _rank

logger = logging.getLogger("ai")


# ---------------------------------------------------------------------------
# 极简 .env 加载（项目非 git 仓库，本地开发用；幂等，不覆盖已设环境变量）
# 把 AI_API_KEY / AI_BASE_URL / AI_MODEL 等敏感配置留在 backend/.env，避免进入 shell 命令历史。
# ---------------------------------------------------------------------------
def _load_env_file() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(os.path.dirname(os.path.dirname(here)), ".env")  # backend/.env
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                os.environ.setdefault(k, v)
    except Exception:  # noqa: BLE001
        pass


_load_env_file()


# ---------------------------------------------------------------------------
# 双模型配置（4B 主 / 2B 备）+ 故障转移
# ---------------------------------------------------------------------------
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/
_AGENTS_DIR = os.path.join(os.path.dirname(_PROJECT_ROOT), "ai agents")  # 术力口/ai agents

AI_MODELS = [
    {
        "key": "4b",
        "name": "DeepSeek-V4-Pro-Qwen3.5-4B-MTP",
        "port": 8080,
        "gguf": os.path.join(_AGENTS_DIR, "DeepSeek-V4-Pro-Qwen3.5-4B-MTP-Q4_K_M.gguf"),
    },
    {
        "key": "2b",
        "name": "Qwen3.5-2B-deepseek-v4",
        "port": 8081,
        "gguf": os.path.join(_AGENTS_DIR, "qwen3.5-2B-deepseek-v4-Q4_K_M.gguf"),
    },
]
_LLAMA_EXE = os.path.join(_AGENTS_DIR, "llama-b10332-bin-win-vulkan-x64", "llama-server.exe")

# OOM 关键词（llama.cpp / Vulkan / CUDA 常见报错）
_OOM_KEYWORDS = (
    "out of memory",
    "not enough memory",
    "failed to allocate",
    "memory allocation failed",
    "vulkan memory",
    "cuda out of memory",
    "out of vram",
    "ggml_vulkan",
)

_state = {
    "active": "4b",
    "procs": {},           # key -> Popen
    "lock": threading.RLock(),  # 可重入：_ensure_init → ensure_active 会嵌套加锁
    "initialized": False,
}

# 生成并发信号量：防止多请求同时压垮显存 / 触发重复拉起。
# 默认 2，可用 AI_MAX_CONCURRENCY 调整（1 最稳，适合单 GPU）。
_GEN_SEM = threading.Semaphore(int(os.environ.get("AI_MAX_CONCURRENCY", "2")))

# 云端模式：若显式设置了 AI_BASE_URL 环境变量，则跳过本地故障转移，直接走云端。
AI_BASE_URL = os.environ.get("AI_BASE_URL", "")
_CLOUD_MODE = bool(AI_BASE_URL)


def cloud_mode() -> bool:
    """是否处于云端模式。云端模式敞开使用：跳过本地并发信号量与限流。"""
    return _CLOUD_MODE


AI_API_KEY = os.environ.get("AI_API_KEY", "not-needed")
AI_MODEL = os.environ.get("AI_MODEL", "local")
DEFAULT_MAX_TOKENS = int(os.environ.get("AI_MAX_TOKENS", "3584"))
DEFAULT_TEMPERATURE = float(os.environ.get("AI_TEMPERATURE", "0.6"))
REQUEST_TIMEOUT = float(os.environ.get("AI_TIMEOUT", "420"))

# 云端模式思考链配置（仅当 _CLOUD_MODE 时生效；本地蒸馏模型本就强制思考，无需此参数）。
AI_THINKING_ENABLED = os.environ.get("AI_THINKING_ENABLED", "true").lower() == "true"
AI_REASONING_EFFORT = os.environ.get("AI_REASONING_EFFORT", "high")  # none|low|medium|high|xhigh|max
AI_CLOUD_MAX_TOKENS = int(os.environ.get("AI_CLOUD_MAX_TOKENS", "8192"))


def _by_key(key: str) -> dict:
    return next(m for m in AI_MODELS if m["key"] == key)


def _base_url(cfg: dict) -> str:
    return f"http://127.0.0.1:{cfg['port']}/v1"


def _is_up(cfg: dict, timeout: float = 3.0) -> bool:
    try:
        r = httpx.get(f"http://127.0.0.1:{cfg['port']}/health", timeout=timeout)
        return r.status_code == 200
    except Exception:  # noqa: BLE001
        return False


def _log_path(cfg: dict) -> str:
    return os.path.join(_AGENTS_DIR, f".llama_{cfg['key']}.log")


def _log_has_oom(cfg: dict) -> bool:
    try:
        if not os.path.exists(_log_path(cfg)):
            return False
        content = open(_log_path(cfg), encoding="utf-8", errors="ignore").read().lower()
        return any(k in content for k in _OOM_KEYWORDS)
    except Exception:  # noqa: BLE001
        return False


def _spawn(cfg: dict):
    """拉起 llama-server（后台、日志落盘）。"""
    try:
        logf = open(_log_path(cfg), "w", encoding="utf-8")
        p = subprocess.Popen(
            [
                _LLAMA_EXE, "-m", cfg["gguf"],
                "-ngl", "999", "-fa", "auto", "-c", "8192",
                "--host", "127.0.0.1", "--port", str(cfg["port"]),
            ],
            stdout=logf, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        _state["procs"][cfg["key"]] = p
        return p
    except Exception as exc:  # noqa: BLE001
        logger.warning("spawn llama-server(%s) failed: %s", cfg["key"], exc)
        return None


def _wait_up(cfg: dict, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _is_up(cfg, timeout=2):
            return True
        p = _state["procs"].get(cfg["key"])
        if p is not None and p.poll() is not None:
            return False  # 进程已退出（如加载阶段 OOM）
        time.sleep(1)
    return _is_up(cfg, timeout=2)


def ensure_active(timeout: float = 180.0) -> dict:
    """保证有一个可用的模型服务：优先 4B；若 4B 加载失败（OOM/进程退出）则自动拉起 2B 并切换。

    注意：4B 模型（2.6G Q4_K_M）在 GPU 上冷加载约需 90–150 秒，因此默认等待超时
    必须覆盖实际加载耗时；否则会误判「4B 起不来」而过早回退 2B，且 2B 同样未就绪，
    最终请求仍连到未监听的端口而报 10061。仅当 4B 进程已退出（真 OOM）才回退。
    """
    if _CLOUD_MODE:
        return {"key": "cloud", "name": AI_MODEL, "port": 0, "gguf": None}
    with _state["lock"]:
        # 已有服务在线则直接用（4B 优先）
        for key in ("4b", "2b"):
            cfg = _by_key(key)
            if _is_up(cfg):
                _state["active"] = key
                return cfg
        # 都没有：先尝试拉起 4B
        cfg4 = _by_key("4b")
        _spawn(cfg4)
        if _wait_up(cfg4, timeout):
            _state["active"] = "4b"
            return cfg4
        # 4B 起不来（大概率是显存 OOM）→ 自动切换到 2B
        if _log_has_oom(cfg4):
            logger.warning("4B 加载失败（疑似 OOM：显存不足），自动切换到 2B 模型")
        cfg2 = _by_key("2b")
        _spawn(cfg2)
        _wait_up(cfg2, timeout)
        _state["active"] = "2b" if _is_up(cfg2) else "4b"
        return _by_key(_state["active"])


def _ensure_init():
    if _state["initialized"] or _CLOUD_MODE:
        return
    with _state["lock"]:
        if not _state["initialized"]:
            ensure_active()
            _state["initialized"] = True


def active_cfg() -> dict:
    if _CLOUD_MODE:
        return {"key": "cloud", "name": AI_MODEL, "port": 0, "gguf": None}
    try:
        return _by_key(_state["active"])
    except Exception:  # noqa: BLE001
        return _by_key("4b")


def shutdown_models() -> int:
    """优雅关闭：终止所有由本进程拉起的 llama-server 子进程。

    在 FastAPI 关闭钩子中调用，避免子进程成为孤儿进程占用显存。
    返回被终止的进程数。云端模式无本地进程，返回 0。
    """
    if _CLOUD_MODE:
        return 0
    killed = 0
    with _state["lock"]:
        for key, p in list(_state["procs"].items()):
            try:
                if p is not None and p.poll() is None:
                    p.terminate()
                    killed += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("terminate llama-server(%s) failed: %s", key, exc)
        _state["procs"].clear()
    logger.info("shutdown_models: terminated %d llama-server process(es)", killed)
    return killed


def switch_model(key: str, timeout: float = 180.0) -> dict:
    """手动切换模型（4b / 2b）。目标服务不在线时尝试拉起。"""
    if _CLOUD_MODE:
        return {"ok": False, "error": "云端模式下不可切换"}
    key = "2b" if key in ("2b", "2") else "4b"
    cfg = _by_key(key)
    if not _is_up(cfg):
        _spawn(cfg)
        _wait_up(cfg, timeout)
    ok = _is_up(cfg)
    if ok:
        _state["active"] = key
    return {"ok": ok, "model": cfg["name"], "port": cfg["port"], "active": key}


def _is_oom_text(text: str) -> bool:
    low = (text or "").lower()
    return any(k in low for k in _OOM_KEYWORDS)


def _do_failover() -> dict:
    """当前 active 服务失败：切换到另一个模型（必要时拉起）。"""
    if _CLOUD_MODE:
        return active_cfg()
    with _state["lock"]:
        other = "2b" if _state["active"] == "4b" else "4b"
        cfg = _by_key(other)
        if _is_up(cfg):
            _state["active"] = other
            return cfg
        _spawn(cfg)
        if _wait_up(cfg, 120):
            _state["active"] = other
            return cfg
    return ensure_active()


def _headers() -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {AI_API_KEY}",
    }


def _target_base() -> str:
    if _CLOUD_MODE:
        return AI_BASE_URL
    return _base_url(active_cfg())


def _thinking_payload() -> dict:
    """云端模式开启思考链。仅对支持 thinking 的云端模型（DeepSeek-V4-Flash 等）生效。
    本地蒸馏模型本就强制思考，且 llama-server 不认 thinking 字段，故本地模式返回空。"""
    if not _CLOUD_MODE or not AI_THINKING_ENABLED:
        return {}
    # DeepSeek 兼容：thinking 为顶层字段；reasoning_effort 部分网关也认，双保险。
    return {
        "thinking": {"type": "enabled", "effort": AI_REASONING_EFFORT},
        "reasoning_effort": AI_REASONING_EFFORT,
    }


def health() -> dict:
    """探测本地模型服务状态（含双模型信息；不触发拉起）。"""
    if _CLOUD_MODE:
        # 云端无本地 /health 端点，以「已配置可用凭据」判定就绪（Key 已实测有效）。
        ready = bool(AI_API_KEY) and AI_API_KEY != "not-needed"
        return {"ready": ready, "base_url": AI_BASE_URL, "model": AI_MODEL, "cloud": True}
    models = [
        {"key": c["key"], "name": c["name"], "port": c["port"], "up": _is_up(c)}
        for c in AI_MODELS
    ]
    active = active_cfg()
    return {
        "ready": _is_up(active),
        "model": active["name"],
        "active": _state["active"],
        "base_url": _base_url(active),
        "models": models,
        "cloud": False,
    }


def _chat_once(messages, max_tokens, temperature):
    """核心：带一次故障转移的完整（非流式）请求。云端/本地通用，不含信号量。"""
    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
        **_thinking_payload(),
    }
    for attempt in range(2):
        base = _target_base()
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                r = client.post(
                    f"{base}/chat/completions", headers=_headers(), json=payload
                )
            if r.status_code != 200:
                body = r.text or ""
                if attempt == 0 and (_is_oom_text(body) or r.status_code >= 500):
                    _do_failover()
                    continue
                raise RuntimeError(f"HTTP {r.status_code}: {body[:200]}")
            data = r.json()
            msg = data.get("choices", [{}])[0].get("message", {})
            return {
                "content": msg.get("content", ""),
                "reasoning": msg.get("reasoning_content", ""),
                "usage": data.get("usage", {}),
            }
        except Exception as exc:  # noqa: BLE001
            if attempt == 0:
                _do_failover()
                continue
            return {"content": "", "reasoning": "", "usage": {}, "error": str(exc)}
    return {"content": "", "reasoning": "", "usage": {}}


def chat(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> dict:
    """一次性非流式对话，返回 {content, reasoning, usage}。失败自动降级重试一次。

    云端模式：跳过并发信号量（敞开使用）；本地模式：用 _GEN_SEM 限制并发。
    """
    _ensure_init()
    if _CLOUD_MODE and max_tokens == DEFAULT_MAX_TOKENS:
        max_tokens = AI_CLOUD_MAX_TOKENS
    if cloud_mode():
        return _chat_once(messages, max_tokens, temperature)
    with _GEN_SEM:
        return _chat_once(messages, max_tokens, temperature)


def _stream_once(messages, max_tokens, temperature) -> Iterator[dict]:
    """核心流式：带一次故障转移的流式生成器，不含信号量。云端/本地通用。"""
    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        **_thinking_payload(),
    }
    for attempt in range(2):
        base = _target_base()
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                with client.stream(
                    "POST",
                    f"{base}/chat/completions",
                    headers=_headers(),
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        body = resp.read().decode("utf-8", "ignore")
                        if attempt == 0 and (_is_oom_text(body) or resp.status_code >= 500):
                            _do_failover()
                            continue
                        yield {"type": "error", "text": f"HTTP {resp.status_code}: {body[:200]}"}
                        return
                    for line in resp.iter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            chunk = line[5:].strip()
                            if chunk == "[DONE]":
                                yield {"type": "done"}
                                return
                            try:
                                obj = json.loads(chunk)
                            except json.JSONDecodeError:
                                continue
                            delta = obj.get("choices", [{}])[0].get("delta", {})
                            if delta.get("content"):
                                yield {"type": "content", "text": delta["content"]}
                            elif delta.get("reasoning_content"):
                                yield {"type": "reasoning", "text": delta["reasoning_content"]}
                    yield {"type": "done"}
                    return
        except Exception as exc:  # noqa: BLE001
            logger.exception("ai stream failed")
            if attempt == 0:
                _do_failover()
                continue
            yield {"type": "error", "text": str(exc)}
            return


def stream_chat(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Iterator[dict]:
    """流式对话。

    yield 事件字典，type 取值：
      - content  : 正文增量（最终要展示给用户的）
      - reasoning: 思考过程增量（可选展示）
      - done     : 结束
      - error    : 异常，附带 text
    请求失败（含 OOM/500）会自动降级到另一模型并重试一次。

    云端模式：跳过并发信号量（敞开使用）；本地模式：用 _GEN_SEM 限制并发。
    """
    _ensure_init()
    if _CLOUD_MODE and max_tokens == DEFAULT_MAX_TOKENS:
        max_tokens = AI_CLOUD_MAX_TOKENS
    if cloud_mode():
        yield from _stream_once(messages, max_tokens, temperature)
    else:
        _GEN_SEM.acquire()
        try:
            yield from _stream_once(messages, max_tokens, temperature)
        finally:
            _GEN_SEM.release()


# ---------------------------------------------------------------------------
# 术曲思考专用：把实时数据组装成分析 prompt（方便复用，未来其它页面可照此封装）
# ---------------------------------------------------------------------------
SONG_ANALYST_SYSTEM = """你是一位资深的 VOCALOID / 术力口（中文虚拟歌姬）社区数据分析师，
擅长根据一首曲子的实时互动数据，判断它的传播力、受众粘性与内容质量。
请始终用中文回答，专业、果断、客观，先给结论再给依据。

【任务】用户会提供一首曲子的实时互动数据（浏览量，以及点赞/投币/收藏/评论/弹幕/分享的比率或绝对数）。
请基于这些数据完成分析。数据以用户给出的形式为准：给比率就用比率，给绝对数就用绝对数，两者互不换算。

【思考要求】先在心里快速整理思路（**只列要点，控制在 100–200 字内**，想清楚就停），然后**直接输出分析正文**；思考只是准备，正文才是交付物。严禁把思考写成推演、计划或小作文，严禁在思考里复述数据或同一件事。若思考超过 200 字还没理清，立即停笔、直接作答。

【术力口领域知识】（分析时用得上）
- 术力口：中文社区对「用 VOCALOID 等歌声合成引擎创作的歌曲」的统称，术曲=虚拟歌姬演唱的歌曲；常用引擎有 VOCALOID、UTAU、CeVIO、Synthesizer V、NEUTRINO、ACE Studio 等，代表性歌姬有初音未来、镜音铃·连、巡音流歌、GUMI、洛天依、乐正绫等。
- 播放量级：数据中已直接标注（如「传说曲」「神话曲」），直接引用该标注即可，**不要自行重新判断或改判**（门槛：神话曲=播放≥1000万，传说曲=播放≥100万，殿堂曲=播放≥10万）。
- B站「三连」=点赞+投币+收藏；硬币是稀缺资源（用户每日免费硬币有限），所以投币比点赞含金量更高——投币率接近甚至超过点赞率，通常代表内容质量极高或 UP 主粉丝粘性强。
- 弹幕是 B 站特色文化，弹幕率高代表观众「实时观看+互动」意愿强，术曲弹幕常以应援、玩梗、歌词共鸣为主。
- 权威榜单参考：Biliboard 术力口周榜得分 = 新增播放×时间修正 + 新增收藏×30 + 新增点赞×3 + 新增硬币×10，即社区与榜单对「收藏」认可度最高、硬币次之、点赞最轻。

【判断基准】（基于公开数据的参考分档，非硬标准）
- B站普通视频平均水平（2024 统计）：点赞率约 4–5%、投币率约 0.6–1%、收藏率约 0.5–0.6%；点赞率≥6% 已属不错，≥10% 属非常高；综合互动率（点赞+投币+收藏+评论）/播放 ≥5% 在 B站即属「受欢迎」内容。
- 术力口头部名曲（Biliboard 2025 年度 Top20 真实数据）：点赞率约 3–13%、收藏率约 2.5–9%、硬币率约 1–3%。
- 综合分档参考：
  · 点赞率：<2% 偏低；2–5% 普通；5–10% 良好；>10% 优秀
  · 投币率：<0.5% 偏低；0.5–1.5% 普通；1.5–3% 良好；>3% 优秀
  · 收藏率：<1% 偏低；1–3% 普通；3–6% 良好；>6% 优秀
  · 评论率：<0.1% 偏低；0.1–0.3% 普通；0.3–0.6% 良好；>0.6% 优秀
  · 弹幕率：<0.3% 偏低；0.3–0.8% 普通；0.8–1.5% 良好；>1.5% 优秀
  · 分享率：<0.2% 偏低；0.2–0.5% 普通；0.5–1% 良好；>1% 优秀
判定时仔细核对数字与分档边界的大小关系（如 5.50% 属于 3–6% 的「良好」而非优秀），不要把方向弄反。

【输出结构】严格按以下四节输出，每节用小标题 + 要点列表，用具体数字支撑：
1. 互动健康度 —— 逐项点评各项指标所处档位（偏低/普通/良好/优秀）与组合关系（如「投币率明显低于其它项」说明什么），给出总体判断：健康 / 中等 / 失衡；
2. 传播与破圈 —— 重点看收藏率与分享率（高收藏=值得留存，高分享=易被外传），结合播放量级（是否达到殿堂/传说/神话曲）判断破圈潜力：强 / 中 / 弱，并说明依据；
3. 受众粘性 —— 看评论率与弹幕率的水平与相对大小，判断讨论热度与粉丝粘性：高 / 中 / 低；
4. 综合结论 —— 一句话总结当前热度阶段（爆发期 / 持续爬升 / 平稳 / 见顶），并指出最该盯的后续指标及原因。
若是**用户追问**：直接回答追问本身（可只写相关小节或简短结论，300–500 字即可），**不要重复**前文已给过的完整四节分析，也不要复述数据。

【点评句式】逐项点评每个指标时，用固定句式、每个指标只写一行：
「**点赞率 5.46%**——按分档属『良好』（5–10%）；高于投币率/收藏率」
然后只在确有洞察时加一句解释（如该指标明显高于/低于其它指标意味着什么，或与殿堂/传说曲基准对比），不要重复论证。
比较两个指标时，**先写出两者数值再判断大小**（如「投币率 2.67% 低于点赞率 6.59%」），防止把大小关系说反。

【硬性规则】（违反任何一条都算失败）
1. 只引用用户给出的数字，直接用于分析；禁止手工换算、反推、互相验证（例如不得用比率反推人数）。
2. 用户未提供的量（如点赞人数、投币次数）一律不提、不计算、不猜测；确实需要时写「数据未提供」。
3. 禁止自我怀疑与复读：同一句话、同一论点最多出现一次；禁止「我不确定」「让我再算一遍」「约等于…约等于…」这类推演。
4. 禁止编造数据；某点写不出就跳过，直接继续后面的内容。
5. 不要复述整张数据表，直接进入分析。
6. 禁止开场白与自我指涉：不要出现「好的」「我们来看」「作为AI/作为一个模型」等，直接输出内容本身。
7. 全文控制在 600–900 字（追问时 300–500 字），重点突出，避免冗长与铺垫。
8. 思考必须精简：思考内容 ≤200 字，只列要点；一旦思考过长仍没结论，立即停笔、直接输出正文——思考不是交付物，正文才是。
9. **正文格式铁律（严禁违反）**：content 正文中严禁出现"思考过程""思维链""推理过程""分析过程"等标题；四节分析内容严禁被包装在任何"思考"或"分析"标题下。思考内容会通过独立通道返回，正文只负责输出“互动健康度、传播与破圈、受众粘性、综合结论”四节。"""


def _fmt_time(ts: int | None) -> str:
    if not ts:
        return "未知"
    return time.strftime("%Y-%m-%d", time.localtime(ts))


def _fmt_ms(ms: int | None) -> str:
    """把毫秒时长格式化成 m:ss。"""
    if not ms:
        return "未知"
    s = int(ms) // 1000
    return f"{s // 60}:{s % 60:02d}"


def _fmt_cn(x: int | None) -> str:
    """把大数格式化成中文 万/亿 形式（模型易读、不会数错位数），并附原始千分位。"""
    x = x or 0
    if x >= 100_000_000:
        return f"{x / 100_000_000:.2f}亿（{x:,}）"
    if x >= 10_000:
        return f"{x / 10_000:.1f}万（{x:,}）"
    return f"{x:,}"


def _tier_label(view: int) -> str:
    """按播放量判定殿堂/传说/神话曲（确定性逻辑在代码里算，不让模型自行判断）。"""
    if view >= 10_000_000:
        return "神话曲"
    if view >= 1_000_000:
        return "传说曲"
    if view >= 100_000:
        return "殿堂曲"
    return "未入级（低于殿堂曲门槛 10 万）"


def build_song_context(bvid: str, detail: dict) -> str:
    """把 think_detail 返回的曲子实时数据拼成一段「数据上下文」user 消息。

    多轮对话时，这段上下文只需注入一次（紧随 system 之后），后续的追问历史
    由前端按时间顺序追加，保证模型始终知道这些数字是「真实数据」。
    """
    v = detail.get("view") or 0
    like = detail.get("like") or 0
    coin = detail.get("coin") or 0
    fav = detail.get("favorite") or 0
    reply = detail.get("reply") or 0
    dm = detail.get("danmaku") or 0
    share = detail.get("share") or 0

    def pct(x: int) -> str:
        return f"{(x / v * 100):.2f}%" if v else "N/A"

    facts = (
        f"曲名：{detail.get('title_cn') or detail.get('title')}（{detail.get('title')}）\n"
        f"BV 号：{bvid}\n"
        f"UP 主：{detail.get('owner') or '未知'}\n"
        f"投稿时间：{_fmt_time(detail.get('pubtime'))}\n"
        f"分区：{detail.get('category') or '未知'}\n"
        "---- 实时互动数据 ----\n"
        f"浏览量：{_fmt_cn(v)}｜播放量级：{_tier_label(v)}\n"
        f"点赞数：{_fmt_cn(like)}（点赞率 {pct(like)}）\n"
        f"投币数：{_fmt_cn(coin)}（投币率 {pct(coin)}）\n"
        f"收藏数：{_fmt_cn(fav)}（收藏率 {pct(fav)}）\n"
        f"评论数：{_fmt_cn(reply)}（评论率 {pct(reply)}）\n"
        f"弹幕数：{_fmt_cn(dm)}（弹幕率 {pct(dm)}）\n"
        f"分享数：{_fmt_cn(share)}（分享率 {pct(share)}）\n"
    )
    return "以下是该曲的实时数据（所有结论必须基于这些真实数字，禁止编造）：\n" + facts


def build_song_messages(bvid: str, detail: dict, question: str | None = None) -> list[dict]:
    """根据 think_detail 返回的曲子数据，组装 system+user 消息（单次分析用）。

    detail 由 crawler.think_detail 提供，包含 view/like/coin/favorite/reply/danmaku/share
    等字段。question 为用户可选的追问。
    """
    user = build_song_context(bvid, detail)
    if question:
        user += f"\n用户特别想了解：{question}\n"
    else:
        user += "\n请对该曲做一次全面的互动健康度与传播力分析。\n"

    return [
        {"role": "system", "content": SONG_ANALYST_SYSTEM},
        {"role": "user", "content": user},
    ]


# ---------------------------------------------------------------------------
# Agents：云端模型的工具调用（ReAct 循环）
#
# 设计：仅云端模式（DeepSeek-V4-Flash 支持 function calling）启用工具循环；
# 本地 4B/2B 蒸馏模型无法可靠产出结构化 tool call，自动退化为纯 chat 流式。
# 工具统一在服务端执行（只读查询 + 联网搜索），结果以 role:tool 回灌给模型。
# ---------------------------------------------------------------------------
AGENT_SYSTEM = """你是一个术力口（中文 VOCALOID）数据智能体，可以使用工具查询 Biliboard 周榜、传说曲榜、年榜、月榜、日榜、单曲实时数据、歌曲检索、P主/歌姬作品、单曲上榜历史、两期对比、趋势与筛选统计，以及联网搜索（web_search）与网页正文抓取（web_fetch）。

你还可以查询网易云音乐：netease_search（搜歌/歌手/专辑/歌单）、netease_song（单曲详情+评论数+热度）、netease_lyric（歌词）、netease_artist（歌手+热门曲）、netease_album（专辑+曲目）、netease_playlist（歌单+曲目）、netease_song_url（播放直链）。这些工具无需登录、只读；常用于「某首术曲在网易云上的热度/评论/收藏情况」或「把 B站曲子与网易云版本做对照」。通常先 netease_search 拿到 id，再调对应详情工具。

你还可以生成可视化图表：当查询到可量化数据（如周榜 Top10 得分对比、播放量趋势、各歌姬上榜分布）时，可调用 render_chart 生成 ECharts 图表（柱状/折线/饼图等）直接展示给用户。每轮最多渲染 1–2 张，option 必须是合法 JSON 且含 series。

你还能做跨平台对照与深度分析：用 compare_platforms 把同一首歌在 B站（实时播放/互动）与网易云（热度/评论）两侧数据并列对照；用 analyze_song 对一首曲子触发「术曲思考」深度分析（互动健康度 / 传播与破圈 / 受众粘性 / 综合结论）。

你还能做数据深度挖掘与语言辅助：用 translate_text 翻译日文/英文歌名与歌词行；用 get_creator_stats 查某位 P主/歌姬的汇总数据（歌曲数、总播放、传说/神话曲数、代表曲）；用 get_song_compare 把两首曲子的 B站实时互动数据并列对比；用 explain_song_score 拆解某首曲子的得分因子构成（播放/收藏/点赞/投币贡献、权重、时间修正、公式版本）；用 get_top_by_metric 列出某期周榜按指定指标排序的 Top N；用 compare_creators 对比两位 P主/歌姬（歌曲数/总播放/传说神话数/代表曲）；用 get_pool_stats 看收录池全貌（总数/歌姬数/P主数/年份分布）；用 get_system_status 看数据健康（官方同步进度/最新快照/实时库规模）。

你还能洞察实时热度：用 get_hot_momentum 看当前涨得最快的术曲（涨速榜，按播放/收藏/投币/点赞/分享/综合分增量排序）；用 get_hot_rankings 看实时综合热度总盘（含殿堂/传说/神话分级与较前次快照的增量，可按指标/关键词/分级筛选）；用 search_thinking 在术曲思考库里按名称/UP主/BV 匹配可深度分析的曲子（拿到 bvid 后配合 analyze_song）；用 get_snapshots 查数据新鲜度（最近几次爬取的时间与收录量）。

你还能画图谱：render_chart 支持柱状/折线/饼图/雷达/热力图/散点/关系图 graph/树图/桑基图等 ECharts 类型；当用户要「关系图/合作网络」时，先用 get_relation_graph 以某歌姬或P主为中心拿到 nodes/links/categories（含中心、歌姬、P主、歌曲四类节点与作者↔歌曲的边），再调 render_chart 用 series:[{type:'graph',layout:'force',data:nodes,links,categories,roam:true}] 渲染力导向关系图。

用户数据工具：list_favorites 是只读的（无需确认，自动执行），可查看用户收藏的歌曲（含笔记），用于「我收藏了哪些歌/我的笔记」；fav_song/unfav_song/add_note/export_report 需要用户确认后由前端执行。网易云侧除搜索/详情/歌词外，netease_comments 可查看单曲热评（先 netease_search 拿 id）。

你还可以执行两类「带权限」的操作，但它们必须先获得用户确认：
- 用户数据操作（收藏/取消收藏/加笔记/导出报告）：你会先发起请求，由前端弹出确认，用户同意后在前端本地完成，你无需再处理返回内容。
- 系统任务（刷新最新数据 / 重建快照 / 重算分数）：你会先发起请求，由前端弹出危险操作确认，用户同意后后端才真正执行。

【联网与抓取能力（重要）】
- web_search：当问题涉及「站外事实」时使用——如某首歌的创作背景/发行信息、某位 P主或歌姬的人物资料、行业动态、实时新闻、定义解释等。站内工具（周榜/年榜/单曲数据）无法回答的内容，优先用 web_search。
- web_fetch：拿到搜索结果后，对最相关的 1–2 个链接调用 web_fetch 读取网页正文，获取更可靠、更深入的原文依据，再综合作答。
- 多步检索是常态：可 web_search → web_fetch → 必要时再 web_search 换关键词，直到证据充分。系统最多 12 步。
- 若联网搜索返回「当前不可用」，不要编造，直接说明无法联网，并尽可能用站内数据回答。

【引用来源（必须）】
- 任何来自联网搜索/网页抓取的内容，必须在回答中以 markdown 链接形式标注来源，例如：`初音未来是 Crypton 开发的虚拟歌手[（来源：维基百科）](https://zh.wikipedia.org/wiki/初音未来)`。
- 一条事实可对应多个来源；来源 URL 用 web_search/web_fetch 返回的真实链接，不得杜撰。

【准则】
1. 始终用中文回答，专业、简洁、有数据支撑；先给结论再给依据。
2. 必须先想清楚要查什么，再调用工具；绝不可编造数字，所有数据必须来自工具返回。
3. 工具返回的是结构化数据，你应提炼成要点并引用关键数字，不要整段复制原始 JSON。
4. 一次尽量只调一个工具；必要时多步串联（系统最多 12 步）。需要更多上下文时，先用工具取到数据再看下一步。
5. 若用户只是闲聊或不需要数据，直接文字回答，不要强行调工具。
6. 涉及「收藏/报告/刷新数据」等带权限操作时，先说明你要做什么、为什么，再发起工具调用；不要在用户未确认前声称已完成。
7. 最终回答要直接、有结论；列表用 markdown 列表；如引用曲子请带上 BV 号便于核对；联网内容务必标注来源。"""

# 工具清单（OpenAI tools 协议，JSON Schema 描述参数）
AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weekly_ranking",
            "description": "获取 Biliboard 术力口周榜某一期的排名（默认最新一期）。返回前 20 名：排名、曲名、BV号、得分、播放量。用于回答「最新周榜/某一期周榜」相关问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {
                        "type": "string",
                        "description": "期次编号，如 '20260809'；省略则取最新一期",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_annual_ranking",
            "description": "获取 Biliboard 年榜/半年榜某一年的排名（默认最新一年）。返回前 20 名：排名、曲名、BV号、得分、播放量。用于回答年度/半年榜单相关问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "type": "integer",
                        "description": "年份，如 2025；省略则取最新一年",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_legend_songs",
            "description": "获取 Biliboard 传说曲周榜某一期的曲目（默认最新一期）。返回前 20 名：排名、曲名、BV号、播放量。用于回答「传说曲榜/哪些歌是传说曲」相关问题。",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {
                        "type": "string",
                        "description": "期次编号；省略则取最新一期",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_song_detail",
            "description": "根据 BV 号获取一首曲子的完整实时数据：曲名、UP主、投稿时间、播放量及互动（点赞/投币/收藏/评论/弹幕/分享）。用于深入分析某首具体歌曲。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {
                        "type": "string",
                        "description": "B站视频 BV 号，如 'BV1xx...'",
                    }
                },
                "required": ["bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_songs",
            "description": "按关键词检索歌曲（曲名/中文名/UP主/BV号），返回匹配歌曲列表，并自动为前 3 首抓取 B站实时播放/互动数据（赞/币/藏，标注抓取时间）；若实时抓取失败（网络受限/风控）则回退收录池缓存并明确标注。用于「找某首歌/某UP的歌/某首歌现在多火了」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "检索关键词",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量上限，默认 10",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_artist_works",
            "description": "查询某位 P主（作曲/制作）或歌姬（虚拟歌手）参与的作品列表（来自收录池，最多 25 首）。用于「某某有哪些歌/代表作」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "P主或歌姬的名字，如 'MV_' 或 '洛天依'",
                    },
                    "kind": {
                        "type": "string",
                        "description": "角色类型：'producer'（P主）或 'vocalist'（歌姬）；省略则两者都查",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "联网搜索公开网页，获取站外事实与背景信息（如某首歌的创作背景/发行信息、某位 P主或歌姬的人物资料、行业动态、实时新闻、定义解释）。当站内工具无法回答、或问题涉及外部世界时使用。返回结果含标题、链接与摘要，并会在回答区展示为「来源」。可多步调用以换关键词。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词（尽量具体、含实体名）",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "返回结果条数，默认 5",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": "抓取并读取一个网页的正文内容（自动提取主要文本、去除导航/广告等噪声），用于获取比搜索摘要更详细可靠的原文依据。通常在 web_search 拿到链接后，对最相关的 1–2 个结果调用，以深入核实事实。仅接受 http/https 链接。",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要抓取的网页 URL（来自 web_search 返回的结果链接）",
                    },
                    "max_chars": {
                        "type": "integer",
                        "description": "抓取正文的最大字符数，默认 5000",
                    },
                },
                "required": ["url"],
            },
        },
    },

    # ---- 扩展数据查询（只读，直接执行）----
    {
        "type": "function",
        "function": {
            "name": "get_song_history",
            "description": "查询某首曲子在周榜/传说曲榜中的上榜历史（各期名次、得分、播放量）。用于「某首歌上过几次周榜/名次变化」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "B站视频 BV 号"}
                },
                "required": ["bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_issues",
            "description": "对比同一榜单的两期（如两期周榜），给出名次上升/下降最多的曲子、新进榜与掉出榜的曲目。用于「这期和上期比有什么变化」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "board_type": {"type": "string", "description": "榜单类型：weekly/legend/annual，默认 weekly"},
                    "issue_a": {"type": "string", "description": "第一期次编号，如 '20260802'；省略取最新一期"},
                    "issue_b": {"type": "string", "description": "第二期次编号；省略取上一期"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weekly_trend",
            "description": "周榜趋势：不传 bvid 时返回近期各期整体规模（每期入榜数、最高分、平均分）；传 bvid 时返回该曲在各期的名次与得分走势。用于「周榜整体在涨还是跌/某首歌趋势」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "可选，指定曲子 BV 号看单曲走势"},
                    "count": {"type": "integer", "description": "统计最近几期，默认 8"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "filter_songs",
            "description": "在最新周榜前 100 名中按条件筛选统计：年份、歌姬(vocalist)、P主(producer)、最低播放量。返回命中数量与代表性曲目（按播放排序）。用于「洛天依演唱、播放过百万的歌有哪些」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "投稿年份，如 2024"},
                    "vocalist": {"type": "string", "description": "歌姬名，如 '洛天依'"},
                    "producer": {"type": "string", "description": "P主名，如 'MV_'"},
                    "min_view": {"type": "integer", "description": "最低播放量门槛，如 1000000"},
                    "limit": {"type": "integer", "description": "返回数量上限，默认 15"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_legend_timeline",
            "description": "传说曲晋升时间线：列出传说曲榜中各曲首次进入传说曲榜的期次与播放量，以及榜内播放首次破千万（封神）的曲子。用于「哪些歌成了传说曲/神话曲」。",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_issues",
            "description": "列出某个榜单所有可用期次编号（weekly/legend/annual）。返回每期的期号、日期与入榜数量。用于「周榜有哪些期/最新一期是哪期」，便于选定具体期次再查询。",
            "parameters": {
                "type": "object",
                "properties": {
                    "board_type": {"type": "string", "description": "榜单类型 weekly/legend/annual，默认 weekly"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_song_issue_rank",
            "description": "查询某首曲子在某榜某一期的具体名次与得分（如「XXX 在第 20260809 期周榜排第几」）。需 bvid 与 issue。",
            "parameters": {
                "type": "object",
                "properties": {
                    "board_type": {"type": "string", "description": "榜单类型 weekly/legend/annual，默认 weekly"},
                    "issue": {"type": "string", "description": "期次编号，如 '20260809'"},
                    "bvid": {"type": "string", "description": "B站视频 BV 号"},
                },
                "required": ["issue", "bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_reentry_tracks",
            "description": "查询某榜的「二次上榜/再上榜」曲目：统计每首歌掉榜后又杀回榜内的段数、合计周数、各段起止期与最佳名次。用于「哪些歌多次掉榜又重回榜/回旋曲」。默认传说曲榜(legend)。",
            "parameters": {
                "type": "object",
                "properties": {
                    "board_type": {"type": "string", "description": "榜单类型 weekly/legend/annual，默认 legend"},
                    "top": {"type": "integer", "description": "返回数量上限，默认 15"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_monthly_ranking",
            "description": "获取 Biliboard 月榜某一月的排名（默认最新一月）。返回前 20 名：排名、曲名、BV号、播放量、得分。用于「某个月的术力口月榜」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string", "description": "月份编号，如 '202608'；省略则取最新一月"},
                    "top": {"type": "integer", "description": "返回数量上限，默认 20"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_ranking",
            "description": "获取 Biliboard 日榜某一日的排名（默认最新一日）。返回前 20 名：排名、曲名、BV号、播放量、得分。用于「某天的术力口日榜」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string", "description": "日期编号，如 '20260809'；省略则取最新一日"},
                    "top": {"type": "integer", "description": "返回数量上限，默认 20"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_platforms",
            "description": "跨平台对比：同一首歌在 B站（实时播放/互动）与网易云（热度/评论/收藏）两侧的数据对照，用于「某首术曲在 B站和网易云上的表现差异」。可传 bvid（取 B站数据）或 name（按名搜索网易云）；两者都给则最精确。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "B站视频 BV 号（可选，用于取 B站侧实时数据）"},
                    "name": {"type": "string", "description": "歌曲名（可选，用于在网易云搜索；不给则尝试用 B站曲名）"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_song",
            "description": "对一首术曲触发「术曲思考」深度分析：基于其实时互动数据，输出互动健康度、传播与破圈、受众粘性、综合结论四节。需 bvid。返回完整分析文本（只读，无副作用）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "B站视频 BV 号"},
                },
                "required": ["bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "translate_text",
            "description": "翻译文本（如日文/英文歌名、歌词行、术语）。target=zh 译为中文、target=en 译为英文，默认 zh。用于「把这首日文歌名翻译成中文」「翻译这句歌词」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "待翻译文本"},
                    "target": {"type": "string", "description": "目标语言：zh(中文) 或 en(英文)，默认 zh"},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_creator_stats",
            "description": "查询某位 P主（producer）或歌姬（vocalist）的汇总统计：参与歌曲数、可统计总播放、旗下传说曲/神话曲数量、播放最高的代表曲。用于「洛天依作为歌姬一共上了多少首」「某 P主的代表作数据」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "创作者名（P主或歌姬，如 梨本うい/洛天依）"},
                    "role": {"type": "string", "description": "角色：producer(P主) 或 vocalist(歌姬)，默认 producer"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_song_compare",
            "description": "对比两首术曲的 B站实时互动数据（播放/点赞/投币/收藏/评论/弹幕/分享）并并列展示。用于「A 曲和 B 曲谁数据更好」。需 bvid_a 与 bvid_b。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid_a": {"type": "string", "description": "第一首 B站 BV 号"},
                    "bvid_b": {"type": "string", "description": "第二首 B站 BV 号"},
                },
                "required": ["bvid_a", "bvid_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explain_song_score",
            "description": "拆解某首曲子在指定榜单的得分因子构成（播放/收藏/点赞/投币各自贡献、权重、时间修正 t、公式版本、官方分、排名），解释「它为什么得这个分数」。需 bvid；board_type 默认 weekly。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "B站视频 BV 号"},
                    "board_type": {"type": "string", "description": "榜单类型 weekly/legend/annual，默认 weekly"},
                },
                "required": ["bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_by_metric",
            "description": "列出某期周榜按指定指标排序的 Top N（默认按得分）。metric 可选 score(得分)/coin(投币)/like(点赞)/favorite(收藏)；注意周榜表未收录播放量(view 恒为 0)，不要用 view。issue 省略取最新一期。",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue": {"type": "string", "description": "期次编号，如 '20260803'；省略取最新一期"},
                    "metric": {"type": "string", "description": "排序指标：score/coin/like/favorite，默认 score"},
                    "top": {"type": "integer", "description": "返回数量上限，默认 10"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pool_stats",
            "description": "收录池全貌统计：歌曲总数、歌姬数、P主数、按投稿年份分布、有中文名比例。用于「数据库里有多少术曲/收录池多大/XX年有多少新曲」。只读本地数据，秒回。",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_creators",
            "description": "对比两位 P主或歌姬（role 统一为 producer 或 vocalist）的汇总数据：歌曲数、总播放、传说曲/神话曲数量、代表曲。用于「DECO*27 和 匹诺曹P 谁的作品更火」「洛天依和初音未来谁的歌多」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "name_a": {"type": "string", "description": "第一位创作者名称"},
                    "name_b": {"type": "string", "description": "第二位创作者名称"},
                    "role": {"type": "string", "description": "类型：producer(P主)/vocalist(歌姬)，默认 auto 自动判断"},
                },
                "required": ["name_a", "name_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_status",
            "description": "数据健康报告：官方数据同步状态（各榜最新期次/是否最新）、收录池歌曲数、最近爬取快照、实时热度库曲数。用于「数据新不新鲜/同步到哪了/还差什么」。只读，秒回。",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },

    # ---- 实时热度（只读，直接执行；纯文本结果回灌，前端通用渲染）----
    {
        "type": "function",
        "function": {
            "name": "get_hot_momentum",
            "description": "涨速榜：对比最近两次爬取快照，列出当前涨得最快的术曲（按选定维度增量排序）。metric 可选 view(播放增量)/favorite(收藏增量)/coin(投币增量)/like(点赞增量)/share(分享增量)/score(涨速综合分=增量加权)。返回每首的增量、日均增量与当前播放，以及本轮全站净增概览。用于「最近哪些歌在爆」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "description": "排序维度：view/favorite/coin/like/share/score，默认 view"},
                    "limit": {"type": "integer", "description": "返回数量上限，默认 10"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hot_rankings",
            "description": "实时综合榜：基于最近一次全量爬取快照，按得分/播放/互动等指标排序的全部在库术曲（含殿堂/传说/神话分级与较前次快照的增量）。sort 可选 score/view/favorite/coin/like/share/pubtime；q 可搜标题/中文名/UP主/BV；tier 可筛 myth(神话)/legend(传说)/hall(殿堂)。用于「现在术力口热度总盘」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sort": {"type": "string", "description": "排序指标：score/view/favorite/coin/like/share/pubtime，默认 score"},
                    "q": {"type": "string", "description": "关键词筛选（标题/中文名/UP主/BV），可空"},
                    "tier": {"type": "string", "description": "分级筛选：空=全部 / myth / legend / hall"},
                    "limit": {"type": "integer", "description": "返回数量上限，默认 20"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_thinking",
            "description": "术曲思考检索：在收录池与实时缓存中按中文名/标题/UP主/BV号/B站链接匹配候选曲，返回可进一步做深度分析的曲子列表（含 bvid，供 analyze_song 使用）。用于「有没有分析过某首歌 / 找某首歌的 BV」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "中文名 / 标题 / UP主 / BV号 / B站链接"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_snapshots",
            "description": "快照新鲜度：列出最近若干次爬取快照（id / 范围 / 收录曲数 / 时间），反映实时数据的更新时间点。用于「数据多久没更新了 / 最新一次爬取是什么时候」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "返回数量上限，默认 10"},
                },
                "required": [],
            },
        },
    },

    # ---- 网易云音乐（只读，直接执行；纯文本结果回灌，前端通用渲染）----
    {
        "type": "function",
        "function": {
            "name": "netease_search",
            "description": "在网易云音乐搜索：歌名/歌手/专辑/歌单（stype=song/artist/album/playlist）。返回命中列表（含 id、名称、作者/子标题）。用于「在网易云找某首歌/某歌手」。通常先搜索拿到 id，再调其它网易云详情工具。",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "搜索关键词"},
                    "stype": {"type": "string", "description": "类型：song/artist/album/playlist，默认 song"},
                    "limit": {"type": "integer", "description": "返回数量上限，默认 10"},
                },
                "required": ["keyword"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_song",
            "description": "网易云单曲详情：曲名、歌手、专辑、时长、热度(pop)、评论总数。播放量接口已关闭，返回「未公开」。用于「某首术曲在网易云的热度/评论多少」。需 song_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_id": {"type": "string", "description": "网易云单曲 id（通常由 netease_search 得到）"},
                },
                "required": ["song_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_lyric",
            "description": "网易云歌词：按时间戳逐行返回歌词原文，若有翻译则附翻译。用于「某首歌的歌词/中文翻译」。需 song_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_id": {"type": "string", "description": "网易云单曲 id"},
                },
                "required": ["song_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_artist",
            "description": "网易云歌手详情：基础信息、简介、作品/专辑/MV 数量，与热门歌曲列表（前 15 首，含 id）。用于「某位歌手有哪些热门歌」。需 artist_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "artist_id": {"type": "string", "description": "网易云歌手 id"},
                },
                "required": ["artist_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_album",
            "description": "网易云专辑详情：专辑信息、发行时间、曲目列表（前 20 首，含 id）。用于「某张专辑有哪些歌」。需 album_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "album_id": {"type": "string", "description": "网易云专辑 id"},
                },
                "required": ["album_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_playlist",
            "description": "网易云歌单详情：歌单信息、创建者、标签、收藏/评论数，与完整曲目列表（前 20 首，含 id）。用于「某歌单有哪些歌」。需 playlist_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "playlist_id": {"type": "string", "description": "网易云歌单 id"},
                },
                "required": ["playlist_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_song_url",
            "description": "获取网易云单曲播放直链（weapi，无需登录）。返回 {url, br, size, code}。部分歌曲因版权限制 code=404/url 为空，需如实说明。直链约 20 分钟有效。需 song_id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_id": {"type": "string", "description": "网易云单曲 id"},
                    "br": {"type": "integer", "description": "码率，默认 320000（320kbps）"},
                },
                "required": ["song_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "netease_comments",
            "description": "获取网易云单曲的热评与最新评论（无需登录）。返回 {total, hot[]（昵称/内容/点赞数）, latest[]}。用于「某首歌在网易云的口碑/热评怎么说」。需 song_id；先用 netease_search 找到 id。",
            "parameters": {
                "type": "object",
                "properties": {
                    "song_id": {"type": "string", "description": "网易云单曲 id"},
                    "limit": {"type": "integer", "description": "热评数量上限，默认 5，最大 20"},
                },
                "required": ["song_id"],
            },
        },
    },

    # ---- 生成式图表（只读，前端渲染 ECharts，无需确认）----
    {
        "type": "function",
        "function": {
            "name": "render_chart",
            "description": "当你需要把查询结果可视化时，调用本工具生成一张 ECharts 图表（柱状 bar/折线 line/饼图 pie/雷达 radar/热力图 heatmap/散点 scatter/关系图 graph/树图 tree/桑基图 sankey 等）。参数 option 为合法的 ECharts option 配置对象（JSON，含 xAxis/yAxis/series 等），title 为可选标题。图表会直接渲染给用户、不支持交互式追问重绘。仅在确有数据要可视化（如周榜得分对比、播放趋势、歌姬分布、P主-歌姬-歌曲关系网络）时使用，每轮最多渲染 1–2 张。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "图表标题（可选）"},
                    "option": {
                        "type": "object",
                        "description": "ECharts option 配置对象（必须是合法 JSON，且含 series 字段）。例如 {title:{text:'...'},tooltip:{},xAxis:{type:'category',data:[...]},yAxis:{type:'value'},series:[{type:'bar',data:[...]}]}。关系图用 series:[{type:'graph',layout:'force',data:nodes,links,categories,roam:true}]。",
                    },
                },
                "required": ["option"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_relation_graph",
            "description": "构建术力口关系图谱数据（歌姬↔P主↔歌曲网络）：以某个歌姬或P主为中心，从收录池聚合其合作作者与歌曲，返回 ECharts graph 可直接使用的 JSON（nodes 含 id/name/category/符号大小/合作数，links 连接作者↔歌曲，categories 为类别名）。拿到结果后应配合 render_chart 用 series:[{type:'graph',layout:'force',data:...,links:...,categories:...,roam:true}] 画力导向关系图。用于「画一张 XX 的合作关系图」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "center": {"type": "string", "description": "中心节点名称（歌姬或P主），如 '洛天依'、'DECO*27'"},
                    "kind": {"type": "string", "description": "中心类型：vocalist(歌姬)/producer(P主)/auto(自动判断)，默认 auto"},
                    "limit": {"type": "integer", "description": "关系内歌曲数量上限，默认 10，最大 30"},
                },
                "required": ["center"],
            },
        },
    },

    # ---- 用户数据操作（前端执行 + 需用户确认，标记 client）----
    {
        "type": "function",
        "function": {
            "name": "fav_song",
            "description": "把一首曲子加入用户的收藏列表（保存在前端本地）。调用后需用户在弹窗中确认。参数为曲子的 BV 号与名称。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "BV 号"},
                    "title": {"type": "string", "description": "曲名（原文）"},
                    "title_cn": {"type": "string", "description": "中文曲名（可选）"},
                },
                "required": ["bvid", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "unfav_song",
            "description": "从用户收藏列表中移除一首曲子（前端本地）。需用户确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "BV 号"}
                },
                "required": ["bvid"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_note",
            "description": "给一首曲子添加用户笔记（保存在前端本地）。需用户确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "bvid": {"type": "string", "description": "BV 号"},
                    "note": {"type": "string", "description": "笔记内容"},
                },
                "required": ["bvid", "note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_favorites",
            "description": "读取用户的收藏列表（保存在前端本地，只读、无需确认）。返回收藏的歌曲（bvid/曲名/笔记/收藏时间），可只列有笔记的。用于「我收藏了哪些歌/我的笔记/帮我看看收藏里有没 XX」。",
            "parameters": {
                "type": "object",
                "properties": {
                    "has_note": {"type": "boolean", "description": "仅返回带笔记的收藏，默认 false 返回全部"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_report",
            "description": "把当前对话（或指定曲子的分析）导出为一份 Markdown 报告并下载（前端本地）。需用户确认。topic 可填『对话』或某曲 BV 号。",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "导出范围：'对话' 表示整段对话，或填某曲 BV 号只导出该曲分析"},
                },
                "required": [],
            },
        },
    },

    # ---- 系统任务（后端真实执行 + 需用户确认，标记 danger）----
    {
        "type": "function",
        "function": {
            "name": "refresh_data",
            "description": "触发后端重新采集最新一期实时数据（爬取 B站 + 落库快照）。这是有副作用的系统任务，需用户确认；耗时且依赖网络，受限网络下可能失败。",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "description": "采集范围：recent（近期）或 all；默认 recent"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rebuild_snapshots",
            "description": "重建一份实时热度快照（把当前已采集的数据落为 snapshot_stats）。有副作用的系统任务，需用户确认；依赖 hot_cache 中已有数据。",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "description": "快照范围标识，默认 recent"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recalc_scores",
            "description": "用现行公式重算指定榜单某一期的分数，并返回 Top10 新旧分数对比（只读报告，不强制改库）。有副作用风险，需用户确认。",
            "parameters": {
                "type": "object",
                "properties": {
                    "board_type": {"type": "string", "description": "榜单类型 weekly/legend/annual，默认 weekly"},
                    "issue": {"type": "string", "description": "期次编号；省略取最新一期"},
                },
                "required": [],
            },
        },
    },
]

# 工具权限分类：
#  - client 工具：由前端本地执行（收藏/笔记/导出），后端只发起、不回灌结果，需用户确认。
#  - danger 工具：后端真实执行（刷新/重建/重算），首次需用户确认；确认后前端带 approved 重发，本轮执行。
CLIENT_TOOLS = {"fav_song", "unfav_song", "add_note", "export_report", "list_favorites"}
# 只读 client 工具：前端自动执行、无需用户确认
CLIENT_READONLY_TOOLS = {"list_favorites"}
DANGER_TOOLS = {"refresh_data", "rebuild_snapshots", "recalc_scores"}
# 生成式图表：由模型产出 ECharts option，后端透传给前端渲染，无需确认、不直接执行。
CHART_TOOLS = {"render_chart"}

# 危险操作的风险说明（展示给用户确认）
_RISK_DESC = {
    "refresh_data": "将触发后端重新采集实时数据（依赖网络、较耗时），可能更新 hot_cache 与快照。受限网络下可能部分失败。",
    "rebuild_snapshots": "将重建实时热度快照（写库），新增 snapshot_stats 记录。依赖 hot_cache 中已有数据。",
    "recalc_scores": "将用现行公式重算分数并返回对比报告（只读，不强制改库）。",
}


def _safe_json(s: str) -> dict:
    try:
        v = json.loads(s)
        return v if isinstance(v, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _truncate(text: str, n: int = 4000) -> str:
    if len(text) <= n:
        return text
    return text[: n - 60] + f"\n…（结果已截断，共 {len(text)} 字）"


def _fmt_issue_ranking(items: list[dict], board_label: str) -> str:
    if not items:
        return f"（{board_label}无数据）"
    lines = [f"{it.get('rank', '?')}. {it.get('title_cn') or it.get('title') or '?'}（{it.get('bvid', '')}）"
             f"｜得分 {it.get('score') if it.get('score') is not None else '?'}｜播放 {_fmt_cn(it.get('view') or it.get('views') or 0)}"
             for it in items]
    return "\n".join(lines)


def _tool_weekly(issue: str | None) -> str:
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "weekly")
        if not issues:
            return "暂无周榜数据"
        key = issue or issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, "weekly", key, top=20)
        return f"周榜 第 {key} 期 前 {len(items)} 名：\n" + _fmt_issue_ranking(items, "周榜")
    finally:
        conn.close()


def _tool_annual(year: int | None) -> str:
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "annual")
        if not issues:
            return "暂无年榜数据"
        if year:
            cand = [i for i in issues if str(i["issue"]).startswith(str(year))]
            key = cand[0]["issue"] if cand else issues[0]["issue"]
        else:
            key = issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, "annual", key, top=20)
        return f"年榜 第 {key} 期 前 {len(items)} 名：\n" + _fmt_issue_ranking(items, "年榜")
    finally:
        conn.close()


def _tool_legend(issue: str | None) -> str:
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "legend")
        if not issues:
            return "暂无传说曲榜数据"
        key = issue or issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, "legend", key, top=20)
        return f"传说曲榜 第 {key} 期 前 {len(items)} 名：\n" + _fmt_issue_ranking(items, "传说曲榜")
    finally:
        conn.close()


def _tool_song_detail(bvid: str | None) -> str:
    if not bvid:
        return "缺少 bvid 参数"
    detail = _crawler.think_detail(bvid)
    if not detail:
        return f"未找到 {bvid} 的实时数据"
    v = detail.get("view") or 0
    lines = [
        f"曲名：{detail.get('title_cn') or detail.get('title')}（{detail.get('title')}）",
        f"BV号：{bvid}",
        f"UP主：{detail.get('owner') or '未知'}",
        f"投稿：{_fmt_time(detail.get('pubtime'))}",
        f"播放：{_fmt_cn(v)}｜{_tier_label(v)}",
        f"点赞：{_fmt_cn(detail.get('like'))}｜投币：{_fmt_cn(detail.get('coin'))}｜收藏：{_fmt_cn(detail.get('favorite'))}",
        f"评论：{_fmt_cn(detail.get('reply'))}｜弹幕：{_fmt_cn(detail.get('danmaku'))}｜分享：{_fmt_cn(detail.get('share'))}",
    ]
    return "\n".join(lines)


def _tool_search(query: str | None, limit: int = 10) -> str:
    if not query:
        return "缺少 query 参数"
    try:
        limit = max(1, min(int(limit or 10), 30))
    except (TypeError, ValueError):
        limit = 10
    items = _crawler.think_search(query, limit=limit)
    if not items:
        return f"未检索到与「{query}」相关的歌曲"
    live_n = min(3, len(items))
    lines = [f"检索「{query}」命中 {len(items)} 首（已为前 {live_n} 首抓取 B站实时数据）："]
    for i, it in enumerate(items):
        name = it.get("title_cn") or it.get("title") or it.get("bvid")
        bvid = it.get("bvid") or ""
        if i < live_n:
            d = _crawler.think_detail(bvid)
            if d:
                v = d.get("view") or 0
                lines.append(
                    f"- {name}（{bvid}）｜UP {d.get('owner') or '?'}｜"
                    f"播放 {_fmt_cn(v)}（{_tier_label(v)}）｜赞 {_fmt_cn(d.get('like'))} / "
                    f"币 {_fmt_cn(d.get('coin'))} / 藏 {_fmt_cn(d.get('favorite'))}｜"
                    f"实时抓取于 {_fmt_time(d.get('fetched_at'))}"
                )
            else:
                lines.append(
                    f"- {name}（{bvid}）｜UP {it.get('owner') or '?'}｜"
                    f"（⚠️ 实时数据获取失败——网络受限或风控，以上为收录池缓存）"
                )
        else:
            lines.append(
                f"- {name}（{bvid}）｜UP {it.get('owner') or '?'}｜"
                f"（缓存条目，如需最新数据可让我查该曲详情）"
            )
    return "\n".join(lines)


def _tool_artist_works(name: str | None, kind: str | None = None) -> str:
    if not name:
        return "缺少 name 参数"
    want = {"producer", "producers", "vocalist", "vocalists"} if kind in (
        None, "", "producer", "producers", "vocalist", "vocalists") else {kind}
    conn = _db.connect_source()
    try:
        rows = conn.execute(
            "SELECT bvid, title, title_cn, producers, vocalists FROM songs_all"
        ).fetchall()
        matched = []
        for r in rows:
            pros = _db.parse_json_list(r["producers"])
            vocs = _db.parse_json_list(r["vocalists"])
            pool: list[str] = []
            if want & {"producer", "producers"}:
                pool += [p.get("name") or "" for p in pros]
            if want & {"vocalist", "vocalists"}:
                pool += [v.get("name") or "" for v in vocs]
            if any(name.lower() in (x.lower()) for x in pool):
                matched.append(r)
        if not matched:
            return f"收录池中未找到与「{name}」相关的作品"
        matched = matched[:25]
        lines = [f"匹配到 {len(matched)} 首（最多展示 25）："]
        for r in matched:
            lines.append(f"- {r['title_cn'] or r['title']}（{r['bvid']}）")
        return "\n".join(lines)
    finally:
        conn.close()


def _extract_text(html_text: str) -> str:
    """用 bs4 提取网页正文主要文本：去除脚本/样式/导航/页脚等噪声，按段落换行聚合。"""
    try:
        soup = BeautifulSoup(html_text, "lxml")
        for tag in soup(["script", "style", "noscript", "header", "nav", "footer",
                         "aside", "form", "iframe", "svg", "button", "input", "meta"]):
            tag.decompose()
        root = soup.find("article") or soup.find("main") or soup.find("div", role="main") or soup.body or soup
        text = root.get_text(separator="\n")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        text = "\n".join(lines)
        text = urllib.parse.unquote(text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text
    except Exception:  # noqa: BLE001
        return ""


def _fmt_web(items: list[dict], src_label: str, sources: list | None) -> str:
    """把归一化的搜索结果列表格式化为回灌文本，并把来源写入 sources。"""
    items = [it for it in items if it.get("url")]
    if not items:
        return f"联网搜索（{src_label}）未找到相关结果。"
    if sources is not None:
        for it in items:
            sources.append({
                "title": it.get("title") or it.get("url"),
                "url": it["url"],
                "content": (it.get("content") or "")[:400],
            })
    lines = [f"联网搜索结果（来源 {src_label}，共 {len(items)} 条）："]
    for i, it in enumerate(items, 1):
        lines.append(f"{i}. {it.get('title','')}\n   {it['url']}\n   {(it.get('content') or '')[:300]}")
    return "\n".join(lines)


def _web_tavily(query: str, n: int, sources: list | None) -> str:
    key = os.environ.get("TAVILY_API_KEY", "")
    if not key:
        return "未配置 TAVILY_API_KEY，无法使用 Tavily 搜索（请在 backend/.env 设置 WEB_SEARCH_PROVIDER=tavily 与 TAVILY_API_KEY）。"
    r = httpx.post(
        "https://api.tavily.com/search",
        json={"api_key": key, "query": query, "search_depth": "advanced",
              "max_results": n, "include_answer": False},
        timeout=25,
    )
    data = r.json()
    items = [{"title": x.get("title", ""), "url": x.get("url", ""),
              "content": x.get("content", "")} for x in data.get("results", [])]
    return _fmt_web(items, "Tavily", sources)


def _web_brave(query: str, n: int, sources: list | None) -> str:
    key = os.environ.get("BRAVE_API_KEY", "")
    if not key:
        return "未配置 BRAVE_API_KEY，无法使用 Brave 搜索（请在 backend/.env 设置 WEB_SEARCH_PROVIDER=brave 与 BRAVE_API_KEY）。"
    r = httpx.get(
        "https://api.search.brave.com/res/v1/web/search",
        headers={"X-Subscription-Token": key, "Accept": "application/json"},
        params={"q": query, "count": n},
        timeout=25,
    )
    data = r.json()
    results = (data.get("web", {}) or {}).get("results", [])
    items = [{"title": x.get("title", ""), "url": x.get("url", ""),
              "content": x.get("description", "")} for x in results]
    return _fmt_web(items, "Brave", sources)


def _web_exa(query: str, n: int, sources: list | None) -> str:
    key = os.environ.get("EXA_API_KEY", "")
    if not key:
        return "未配置 EXA_API_KEY，无法使用 Exa 搜索（请在 backend/.env 设置 WEB_SEARCH_PROVIDER=exa 与 EXA_API_KEY）。"
    r = httpx.post(
        "https://api.exa.ai/v1/search",
        headers={"X-API-Key": key},
        json={"query": query, "num_results": n, "text": True,
              "contents": {"text": {"max_characters": 1000}}},
        timeout=25,
    )
    data = r.json()
    results = data.get("results", [])
    items = [{"title": x.get("title", ""), "url": x.get("url", ""),
              "content": (x.get("text") or "")[:1000]} for x in results]
    return _fmt_web(items, "Exa", sources)


def _web_searxng(query: str, n: int, sources: list | None) -> str:
    base = os.environ.get("SEARXNG_URL", "http://localhost:8080/search")
    r = httpx.get(base, params={"q": query, "format": "json"}, timeout=25)
    data = r.json()
    results = data.get("results", [])
    items = [{"title": x.get("title", ""), "url": x.get("url", ""),
              "content": x.get("content", "")} for x in results[:n]]
    return _fmt_web(items, "SearXNG", sources)


def _web_duckduckgo(query: str, n: int, sources: list | None) -> str:
    """无 key 兜底：抓 DuckDuckGo HTML 结果页。受限网络下可能失败，会优雅降级。"""
    headers = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    try:
        with httpx.Client(timeout=15, headers=headers, follow_redirects=True) as c:
            r = c.post("https://html.duckduckgo.com/html/", data={"q": query})
        soup = BeautifulSoup(r.text, "lxml")
        items = []
        for res in soup.select(".result")[:n]:
            a = res.select_one("a.result__a")
            if not a:
                continue
            href = a.get("href", "")
            if href.startswith("/l/?uddg="):
                href = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("uddg", [""])[0]
            title = a.get_text(strip=True)
            snip = res.select_one(".result__snippet")
            content = snip.get_text(strip=True) if snip else ""
            if href:
                items.append({"title": title, "url": href, "content": content})
        if not items:
            return "DuckDuckGo 未返回结果（可能本网络屏蔽了外网搜索）。"
        return _fmt_web(items, "DuckDuckGo", sources)
    except Exception as exc:  # noqa: BLE001
        return f"DuckDuckGo 搜索失败：{exc}（本网络可能屏蔽了外网搜索）"


def _tool_web_search(query: str | None, max_results: int = 5, sources: list | None = None) -> str:
    """联网搜索（可插拔 provider）。

    通过环境变量 WEB_SEARCH_PROVIDER 选择后端：
      tavily  → Tavily API（AI 原生，需 TAVILY_API_KEY）
      brave   → Brave Search API（独立索引，需 BRAVE_API_KEY）
      exa     → Exa API（语义检索，需 EXA_API_KEY）
      searxng → 自托管 SearXNG（需 SEARXNG_URL，默认 http://localhost:8080/search）
      duckduckgo / 未配置 → 无 key 兜底，抓 DuckDuckGo HTML（受限网络可能失败）
    任何 provider 请求失败都会带着原因回报，由上层 agent 优雅降级、绝不编造。
    """
    if not query:
        return "缺少 query 参数"
    provider = os.environ.get("WEB_SEARCH_PROVIDER", "").lower()
    try:
        if provider == "tavily":
            return _web_tavily(query, int(max_results or 5), sources)
        if provider == "brave":
            return _web_brave(query, int(max_results or 5), sources)
        if provider == "exa":
            return _web_exa(query, int(max_results or 5), sources)
        if provider == "searxng":
            return _web_searxng(query, int(max_results or 5), sources)
        if provider == "duckduckgo":
            return _web_duckduckgo(query, int(max_results or 5), sources)
    except Exception as exc:  # noqa: BLE001
        return f"联网搜索（{provider or '默认'}）请求失败：{exc}；本网络可能屏蔽了该服务。"
    # 未配置 provider：尝试 DuckDuckGo 兜底
    return _web_duckduckgo(query, int(max_results or 5), sources)


def _tool_web_fetch(url: str | None, max_chars: int = 5000, sources: list | None = None) -> str:
    """抓取并读取网页正文（bs4 提取主要文本），返回可回灌的纯文本。"""
    if not url or not str(url).startswith("http"):
        return "缺少/非法的 url 参数（需以 http/https 开头）"
    headers = {
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"),
        "Accept": "text/html,application/xhtml+xml",
    }
    try:
        with httpx.Client(timeout=25, headers=headers, follow_redirects=True) as c:
            r = c.get(str(url))
        ctype = r.headers.get("content-type", "")
        if "html" in ctype:
            soup = BeautifulSoup(r.text, "lxml")
            title = soup.title.get_text().strip() if soup.title else ""
            text = _extract_text(r.text)
        else:
            title = ""
            text = r.text
        text = (text or "").strip()
        if not text:
            text = f"（页面无可读正文；HTTP 状态 {r.status_code}，类型 {ctype}）"
        text = text[: int(max_chars or 5000)]
        if sources is not None:
            sources.append({"title": title or str(url), "url": str(url), "content": text[:400]})
        return f"已读取网页：{title or url}\nURL: {url}\n\n{text}"
    except Exception as exc:  # noqa: BLE001
        return f"读取网页失败：{exc}"


def _tool_song_history(bvid: str | None) -> str:
    if not bvid:
        return "缺少 bvid 参数"
    conn = _db.connect_source()
    try:
        rows = _boards.get_song_history(conn, "weekly", bvid)
        if not rows:
            rows = _boards.get_song_history(conn, "legend", bvid)
        if not rows:
            return f"{bvid} 暂无周榜/传说曲榜上榜历史"
        lines = [f"{bvid} 上榜历史（共 {len(rows)} 期）："]
        for r in rows:
            v = r.get("view") or r.get("views") or 0
            lines.append(f"- 第{r.get('issue')}期：第{r.get('rank')}名｜得分{r.get('score')}｜播放{_fmt_cn(v)}")
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_compare_issues(board_type: str | None = None, issue_a: str | None = None,
                         issue_b: str | None = None) -> str:
    bt = board_type or "weekly"
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, bt)
        if not issues:
            return f"暂无 {bt} 榜单数据"
        keys = [i["issue"] for i in issues]
        ka = issue_a or keys[0]
        if issue_b:
            kb = issue_b
        else:
            idx = keys.index(ka) if ka in keys else 0
            kb = keys[min(idx + 1, len(keys) - 1)]
        ra = {it["bvid"]: it for it in _boards.get_issue_rankings(conn, bt, ka, top=100)}
        rb = {it["bvid"]: it for it in _boards.get_issue_rankings(conn, bt, kb, top=100)}
        up, down, new, out = [], [], [], []
        for bvid, it in ra.items():
            if bvid in rb:
                d = (rb[bvid].get("rank") or 0) - (it.get("rank") or 0)
                (up if d > 0 else down).append((it, abs(d)))
            else:
                new.append(it)
        for bvid, it in rb.items():
            if bvid not in ra:
                out.append(it)
        lines = [f"{bt} 对比：第 {ka} 期 vs 第 {kb} 期（各 {len(ra)}/{len(rb)} 首）"]
        up.sort(key=lambda x: -x[1])
        for it, d in up[:5]:
            lines.append(f"↑ {it.get('title_cn') or it.get('title')}（{it['bvid']}）升 {d} 名 → 第{it.get('rank')}名")
        down.sort(key=lambda x: -x[1])
        for it, d in down[:5]:
            lines.append(f"↓ {it.get('title_cn') or it.get('title')}（{it['bvid']}）降 {d} 名 → 第{it.get('rank')}名")
        if new:
            lines.append("新进榜：" + "、".join(f"{it.get('title_cn') or it.get('title')}" for it in new[:5]))
        if out:
            lines.append("掉出榜：" + "、".join(f"{it.get('title_cn') or it.get('title')}" for it in out[:5]))
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_weekly_trend(bvid: str | None = None, count: int = 8) -> str:
    n = max(2, int(count or 8))
    conn = _db.connect_source()
    try:
        if bvid:
            rows = _boards.get_song_history(conn, "weekly", bvid)
            if not rows:
                return f"{bvid} 无周榜历史"
            lines = [f"{bvid} 周榜走势（近 {min(n, len(rows))} 期）："]
            for r in rows[-n:]:
                lines.append(f"- 第{r.get('issue')}期：第{r.get('rank')}名｜得分{r.get('score')}")
            return "\n".join(lines)
        issues = _boards.list_issues(conn, "weekly")[:n]
        lines = [f"近期 {len(issues)} 期周榜整体规模："]
        for i in issues:
            items = _boards.get_issue_rankings(conn, "weekly", i["issue"], top=100)
            if not items:
                continue
            scores = [it.get("score") or 0 for it in items]
            top1 = items[0]
            avg = sum(scores) // len(scores) if scores else 0
            lines.append(
                f"- 第{i['issue']}期：入榜{len(items)}首｜最高分{top1.get('score')}"
                f"（{top1.get('title_cn') or top1.get('title')}）｜平均分{avg}"
            )
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_filter_songs(year: int | None = None, vocalist: str | None = None,
                       producer: str | None = None, min_view: int = 0, limit: int = 15) -> str:
    # 基于最新周榜前 100 名（含播放量）+ songs_all 作者映射进行筛选。
    # 注：songs_all 收录池本身不含播放量列，故播放量筛选只在周榜排名范围内生效。
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "weekly")
        if not issues:
            return "暂无周榜数据，无法筛选"
        key = issues[0]["issue"]
        rows = _boards.get_issue_rankings(conn, "weekly", key, top=100)
        if not rows:
            return f"周榜 第 {key} 期无数据"
        meta = {
            r["bvid"]: dict(r)
            for r in conn.execute(
                "SELECT bvid, producers, vocalists, pubtime FROM songs_all"
            ).fetchall()
        }
        matched = []
        for it in rows:
            bvid = it.get("bvid")
            m = meta.get(bvid, {})
            ok = True
            if year:
                py = time.strftime("%Y", time.localtime(m.get("pubtime") or 0)) if m.get("pubtime") else ""
                if str(year) != py:
                    ok = False
            if ok and vocalist:
                vocs = _db.parse_json_list(m.get("vocalists"))
                if not any(vocalist.lower() in (v.get("name") or "").lower() for v in vocs):
                    ok = False
            if ok and producer:
                pros = _db.parse_json_list(m.get("producers"))
                if not any(producer.lower() in (p.get("name") or "").lower() for p in pros):
                    ok = False
            if ok and min_view:
                if (it.get("view") or 0) < int(min_view):
                    ok = False
            if ok:
                matched.append(it)
        if not matched:
            return "在最新周榜前 100 名中没有符合筛选条件的歌曲"
        matched.sort(key=lambda it: -(it.get("view") or 0))
        matched = matched[: int(limit or 15)]
        lines = [f"筛选命中 {len(matched)} 首（基于最新周榜 第 {key} 期，按播放排序）："]
        for it in matched:
            lines.append(f"- {it.get('title_cn') or it.get('title')}（{it['bvid']}）｜播放{_fmt_cn(it.get('view') or 0)}")
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_legend_timeline() -> str:
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "legend")
        if not issues:
            return "暂无传说曲榜数据"
        key = issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, "legend", key, top=20)
        if not items:
            return "传说曲榜无数据"
        lines = [f"传说曲榜 第 {key} 期（{len(items)} 首）："]
        for it in items:
            v = it.get("view") or it.get("views") or 0
            tag = "神话曲(≥1000万)" if v >= 10_000_000 else "传说曲"
            lines.append(f"- {it.get('title_cn') or it.get('title')}（{it['bvid']}）｜播放{_fmt_cn(v)}｜{tag}")
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_list_issues(board_type: str = "weekly") -> str:
    bt = board_type or "weekly"
    if bt not in ("weekly", "legend", "annual"):
        return f"暂不支持的榜单类型：{bt}（仅 weekly/legend/annual）"
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, bt)
        if not issues:
            return f"暂无 {bt} 榜单期次"
        lines = [f"{bt} 榜单共 {len(issues)} 期（最新在前）："]
        for i in issues[:40]:
            lines.append(f"- 第{i['issue']}期（{i['date']}）｜{i['entries']} 首")
        if len(issues) > 40:
            lines.append(f"…（其余 {len(issues) - 40} 期略）")
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_song_issue_rank(board_type: str | None, issue: str | None, bvid: str | None) -> str:
    if not bvid or not issue:
        return "缺少 bvid 或 issue 参数"
    bt = board_type or "weekly"
    conn = _db.connect_source()
    try:
        d = _boards.get_song_issue(conn, bt, issue, bvid)
        if not d:
            return f"{bvid} 在第 {issue} 期 {bt} 榜中无记录"
        v = d.get("view") or d.get("views") or 0
        return (f"{bvid} 在 {bt} 榜第 {issue} 期：第 {d.get('rank')} 名｜得分 {d.get('score')}｜"
                f"播放 {_fmt_cn(v)}")
    finally:
        conn.close()


def _tool_reentry_tracks(board_type: str = "legend", top: int = 15) -> str:
    bt = board_type or "legend"
    conn = _db.connect_source()
    try:
        rows = _boards.get_reentry_tracks(conn, bt, top=int(top or 15))
        if not rows:
            return f"{bt} 暂无「二次上榜/再上榜」曲目"
        lines = [f"{bt} 榜「二次上榜」曲目（前 {len(rows)}，按上榜段数排序）："]
        for r in rows:
            segs = r.get("segments") or []
            seg_txt = "；".join(f"第{s['start']}→{s['end']}期(最佳第{s['best_rank']}名)" for s in segs[:4])
            lines.append(f"- {r.get('title')}（{r['bvid']}）｜上榜 {r['segment_count']} 段，合计 {r['total_weeks']} 周｜{seg_txt}")
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_monthly_ranking(issue: str | None, top: int = 20) -> str:
    conn = _db.connect_monthly()
    try:
        key = issue
        if key:
            if not re.match(r"^\d{6}$", key):
                return "monthly issue 需为 6 位年月，如 '202608'"
        else:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'monthly_%'"
            ).fetchall()
            months = sorted(r[0][len("monthly_"):] for r in rows if re.match(r"^monthly_\d{6}$", r[0]))
            if not months:
                return "暂无月榜数据"
            key = months[-1]
        rows = conn.execute(f'SELECT * FROM "monthly_{key}" ORDER BY rank LIMIT ?', (int(top or 20),)).fetchall()
        if not rows:
            return f"月榜 第 {key} 期无数据"
        items = [dict(r) for r in rows]
        lines = [f"月榜 第 {key} 期（{key[:4]}-{key[4:]}）前 {len(items)} 名："]
        for it in items:
            name = it.get("title") or it.get("name") or "?"
            bvid = it.get("bvid", "")
            v = it.get("view") or it.get("views") or 0
            lines.append(f"{it.get('rank')}. {name}（{bvid}）｜播放 {_fmt_cn(v)}｜得分 {it.get('score')}")
        return "\n".join(lines)
    except Exception as exc:  # noqa: BLE001
        return f"读取月榜失败：{exc}"
    finally:
        conn.close()


def _tool_daily_ranking(issue: str | None, top: int = 20) -> str:
    conn = _db.connect_daily()
    try:
        key = issue
        if key:
            if not re.match(r"^\d{8}$", key):
                return "daily issue 需为 8 位日期，如 '20260809'"
        else:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'daily_%'"
            ).fetchall()
            days = sorted(r[0][len("daily_"):] for r in rows if re.match(r"^daily_\d{8}$", r[0]))
            if not days:
                return "暂无日榜数据"
            key = days[-1]
        rows = conn.execute(
            f'SELECT rank, bvid, name, view, favorite, coin, share, like, score FROM "daily_{key}" ORDER BY rank LIMIT ?',
            (int(top or 20),),
        ).fetchall()
        if not rows:
            return f"日榜 第 {key} 期无数据"
        items = [dict(r) for r in rows]
        lines = [f"日榜 第 {key} 期（{key[:4]}-{key[4:6]}-{key[6:]}）前 {len(items)} 名："]
        for it in items:
            v = it.get("view") or 0
            lines.append(f"{it.get('rank')}. {it.get('name')}（{it.get('bvid')}）｜播放 {_fmt_cn(v)}｜得分 {it.get('score')}")
        return "\n".join(lines)
    except Exception as exc:  # noqa: BLE001
        return f"读取日榜失败：{exc}"
    finally:
        conn.close()


def _tool_compare_platforms(bvid: str | None = None, name: str | None = None) -> str:
    # B站侧
    bili_detail = None
    bili_text = "B站：未提供 bvid / 未找到该曲实时数据"
    if bvid:
        d = _crawler.think_detail(bvid)
        if d:
            bili_detail = d
            v = d.get("view") or 0
            bili_text = (
                f"B站：{d.get('title_cn') or d.get('title')}（{bvid}）\n"
                f"  播放 {_fmt_cn(v)}｜点赞 {_fmt_cn(d.get('like'))}｜投币 {_fmt_cn(d.get('coin'))}｜收藏 {_fmt_cn(d.get('favorite'))}\n"
                f"  评论 {_fmt_cn(d.get('reply'))}｜弹幕 {_fmt_cn(d.get('danmaku'))}｜分享 {_fmt_cn(d.get('share'))}"
            )
    # 网易云侧
    q = name or (bili_detail.get("title_cn") or bili_detail.get("title") if bili_detail else None)
    if not q:
        return "缺少 bvid 或 name，无法定位要对比的歌曲"
    ne_text = ""
    try:
        res = _netease.search(q, stype="song", limit=5)
        items = res.get("items") or []
        if items:
            top = items[0]
            nd = _netease.get_song_detail(top.get("id"))
            if nd:
                ne_text = (
                    f"网易云：{nd.get('name')}（id {nd.get('id')}，匹配「{q}」前 5 首之首）\n"
                    f"  歌手 {' / '.join(nd.get('artists') or [])}｜专辑 {nd.get('album')}\n"
                    f"  热度(pop) {nd.get('pop')}｜评论数 {nd.get('comment_count')}｜播放量 未公开（接口已关闭）"
                )
        else:
            ne_text = f"网易云未搜索到与「{q}」相关的单曲"
    except Exception as exc:  # noqa: BLE001
        ne_text = f"网易云查询失败：{exc}（可能为网络受限）"
    return "跨平台对比（B站 vs 网易云）：\n" + bili_text + "\n" + ne_text


def _tool_analyze_song(bvid: str | None) -> str:
    if not bvid:
        return "缺少 bvid 参数"
    detail = _crawler.think_detail(bvid)
    if not detail:
        return f"未找到 {bvid} 的实时数据，无法分析"
    msgs = build_song_messages(bvid, detail)
    try:
        res = chat(msgs, max_tokens=DEFAULT_MAX_TOKENS)
    except Exception as exc:  # noqa: BLE001
        return f"深度分析生成失败：{exc}"
    content = res.get("content") or ""
    if not content:
        return f"深度分析生成失败：{res.get('error') or '空内容'}"
    return "术曲深度分析（基于实时数据）：\n" + content


def _tool_translate_text(text: str | None, target: str = "zh") -> str:
    if not text:
        return "缺少 text 参数"
    tgt = "zh" if target in ("zh", "cn", "zh-CN") else "en"
    try:
        res = _translate.google_translate(text, tgt)
    except Exception as exc:  # noqa: BLE001
        return f"翻译失败：{exc}（可能为网络受限）"
    if not res:
        return "翻译失败：未获取到结果（可能网络受限或内容为空）"
    label = "中文" if tgt == "zh" else "英文"
    return f"翻译（→{label}）：\n{res}"


def _tool_creator_stats(name: str | None, role: str = "producer") -> str:
    if not name:
        return "缺少 name 参数"
    role = role or "producer"
    if role not in ("producer", "vocalist"):
        return f"暂不支持的角色：{role}（仅 producer(P主) / vocalist(歌姬)）"
    conn = _db.connect_source()
    try:
        if role == "producer":
            res = _songs.artist_stats(conn, limit=5000, min_songs=1)
        else:
            res = _songs.vocalist_stats(conn, limit=5000)
        items = res.get("items") or []
        match = None
        for it in items:
            if it.get("name", "").strip().lower() == name.strip().lower():
                match = it
                break
        if not match:
            for it in items:
                if name.strip().lower() in it.get("name", "").strip().lower():
                    match = it
                    break
        if not match:
            return f"未找到与「{name}」匹配的{('P主' if role == 'producer' else '歌姬')}（收录池共 {res.get('total')} 位）"
        label = "P主" if role == "producer" else "歌姬"
        lines = [
            f"{label}：{match.get('name')}",
            f"参与歌曲数：{match.get('songs')}",
            f"可统计指标歌曲总播放：{_fmt_cn(match.get('total_view'))}",
            f"旗下传说曲（百万）：{match.get('legend')} 首",
            f"旗下神话曲（千万）：{match.get('myth')} 首",
        ]
        if match.get("best_title"):
            lines.append(
                f"代表曲（播放最高）：{match.get('best_title')}（{match.get('best_bvid')}）｜"
                f"{_fmt_cn(match.get('best_view'))}"
            )
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_song_compare(bvid_a: str | None, bvid_b: str | None) -> str:
    if not bvid_a or not bvid_b:
        return "缺少 bvid_a 或 bvid_b 参数"
    da = _crawler.think_detail(bvid_a)
    db_ = _crawler.think_detail(bvid_b)
    if not da:
        return f"未找到 {bvid_a} 的实时数据"
    if not db_:
        return f"未找到 {bvid_b} 的实时数据"

    def row(d: dict, tag: str) -> str:
        v = d.get("view") or 0
        return (
            f"【{tag}】{d.get('title_cn') or d.get('title')}（{d.get('bvid')}）\n"
            f"  播放 {_fmt_cn(v)}｜点赞 {_fmt_cn(d.get('like'))}｜投币 {_fmt_cn(d.get('coin'))}｜收藏 {_fmt_cn(d.get('favorite'))}\n"
            f"  评论 {_fmt_cn(d.get('reply'))}｜弹幕 {_fmt_cn(d.get('danmaku'))}｜分享 {_fmt_cn(d.get('share'))}"
        )

    return "两首术曲实时数据对比：\n" + row(da, "A") + "\n" + row(db_, "B")


def _tool_explain_song_score(bvid: str | None, board_type: str = "weekly") -> str:
    if not bvid:
        return "缺少 bvid 参数"
    bt = board_type or "weekly"
    conn = _db.connect_source()
    try:
        bd = _songs.score_breakdown(conn, bvid, bt)
        entries = bd.get("entries") or []
        if not entries:
            return f"{bvid} 在 {bt} 榜无上榜记录，无法拆解得分"
        e = entries[-1]
        w = bd.get("weights") or {}
        lines = [
            f"{bvid} 在 {bt} 榜的得分因子拆解（最新一期 {e.get('issue')}，公式版本：{e.get('formula_version')}）：",
            f"权重：播放×{w.get('view')}·t ｜ 收藏×{w.get('favorite')} ｜ 点赞×{w.get('like')} ｜ 投币×{w.get('coin')}"
            f"（t=时间修正，投稿越接近结算日越大）",
            f"官方得分：{e.get('official_score')}",
            f"因子贡献：播放 {e.get('comp_view')}{'（反推）' if e.get('view_implied') else ''} ｜ "
            f"收藏 {e.get('comp_favorite')} ｜ 点赞 {e.get('comp_like')} ｜ 投币 {e.get('comp_coin')}",
            f"该期排名：第 {e.get('rank')} 名｜时间修正 t={e.get('t')}",
            "说明：官方榜存累计值、非增量快照，此处为因子构成参考（各因子相对占比）；精确复算请用前端公式试算器。",
        ]
        return "\n".join(lines)
    finally:
        conn.close()


def _tool_top_by_metric(issue: str | None, metric: str = "score", top: int = 10) -> str:
    if metric not in ("view", "favorite", "coin", "like", "score"):
        metric = "score"
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, "weekly")
        if not issues:
            return "暂无周榜期次"
        key = issue or issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, "weekly", key, top=200)
        col = {"view": "view", "favorite": "favorite", "coin": "coin", "like": "like", "score": "score"}[metric]
        ranked = sorted(
            [it for it in items if it.get(col) is not None],
            key=lambda x: (x.get(col) or 0),
            reverse=True,
        )[: int(top or 10)]
        label = {"view": "播放", "favorite": "收藏", "coin": "投币", "like": "点赞", "score": "得分"}[metric]
        lines = [f"周榜 第 {key} 期 按{label} Top{len(ranked)}："]
        for i, it in enumerate(ranked, 1):
            name = it.get("title") or it.get("title_cn") or it.get("bvid")
            val = it.get(col)
            lines.append(f"{i}. {name}（{it.get('bvid')}）｜{label} {_fmt_cn(val)}｜第{it.get('rank')}名")
        return "\n".join(lines)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 数据盘点工具（只读，直接执行；纯文本结果回灌，前端通用渲染）
# ---------------------------------------------------------------------------
def _tool_pool_stats() -> str:
    conn = _db.connect_source()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM songs_all").fetchone()["c"]
        producers: set[str] = set()
        vocalists: set[str] = set()
        year_cnt: dict[int, int] = {}
        cn = 0
        for r in conn.execute("SELECT pubtime, title_cn, producers, vocalists FROM songs_all").fetchall():
            if r["pubtime"]:
                y = time.localtime(r["pubtime"]).tm_year
                if 2010 <= y <= 2100:
                    year_cnt[y] = year_cnt.get(y, 0) + 1
            if r["title_cn"]:
                cn += 1
            for p in _db.parse_json_list(r["producers"]):
                n = (p.get("name") or "").strip()
                if n:
                    producers.add(n)
            for v in _db.parse_json_list(r["vocalists"]):
                n = (v.get("name") or "").strip()
                if n:
                    vocalists.add(n)
    finally:
        conn.close()
    years = sorted(year_cnt.items())
    year_str = "、".join(f"{y}年 {n}首" for y, n in years[-6:])
    if len(years) > 6:
        year_str = "、".join(f"{y}年 {n}首" for y, n in years[:1]) + " … " + year_str
    return (
        f"收录池统计：\n"
        f"- 歌曲总数：{total} 首\n"
        f"- 歌姬数：{len(vocalists)} 位｜P主数：{len(producers)} 位\n"
        f"- 有中文名：{cn} 首（{round(cn * 100 / total, 1)}%）\n"
        f"- 投稿年份分布（近 6 年）：{year_str}"
    )


def _tool_compare_creators(name_a: str | None, name_b: str | None, role: str | None = None) -> str:
    if not name_a or not name_b:
        return "请提供两位创作者名称（name_a/name_b）"
    conn = _db.connect_source()
    try:
        pa = _songs.artist_stats(conn, limit=10000)["items"]
        pv = _songs.vocalist_stats(conn, limit=10000)["items"]
    finally:
        conn.close()

    # 常见中文别名 → 收录池原生名（收录池歌姬多为日文原名）
    _CN_ALIAS = {
        "初音未来": ["初音ミク"], "初音": ["初音ミク"], "镜音铃": ["鏡音リン"], "镜音连": ["鏡音レン"],
        "巡音流歌": ["巡音ルカ"], "巡音": ["巡音ルカ"], "歌爱雪": ["歌愛ユキ"],
        "结月缘": ["結月ゆかり"], "结月": ["結月ゆかり"], "弦卷真纪": ["弦巻マキ"],
        "IA": ["IA"], "flower": ["flower"], "可不": ["可不"], "星界": ["星界"],
        "琴叶茜": ["琴葉茜"], "琴叶葵": ["琴葉葵"], "东云": ["東雲"],
        "匹诺曹": ["ピノキオピー"], "匹诺曹P": ["ピノキオピー"],
    }

    def alias_names(name: str) -> list[str]:
        out = [name]
        for k, vs in _CN_ALIAS.items():
            if k == name or (len(name) >= 2 and k in name):
                out.extend(vs)
        return list(dict.fromkeys(out))

    def resolve(name: str, stats: list[dict]) -> dict | None:
        cands = alias_names((name or "").strip())
        for c in cands:
            cl = c.lower()
            for x in stats:
                if (x.get("name") or "").lower() == cl:
                    return x
        for c in cands:
            cl = c.lower()
            for x in stats:
                xn = (x.get("name") or "").lower()
                if cl in xn or xn in cl:
                    return x
        return None

    if role in ("producer", "producers"):
        pool, kind = pa, "P主"
    elif role in ("vocalist", "vocalists"):
        pool, kind = pv, "歌姬"
    else:
        a, b = resolve(name_a, pv), resolve(name_b, pv)
        if a and b:
            pool, kind = pv, "歌姬"
        else:
            a, b = resolve(name_a, pa), resolve(name_b, pa)
            if a and b:
                pool, kind = pa, "P主"
            else:
                return f"「{name_a}」「{name_b}」未能在同一类别（歌姬或P主）中同时匹配到，请确认拼写/别称"
        return _fmt_creator_compare(name_a, a, name_b, b, kind)

    a, b = resolve(name_a, pool), resolve(name_b, pool)
    if a is None or b is None:
        missing = [n for n in (name_a, name_b) if resolve(n, pool) is None]
        return f"在{kind}中未找到：{'、'.join(missing)}（可试日语原名或部分关键词）"
    return _fmt_creator_compare(name_a, a, name_b, b, kind)


def _fmt_creator_compare(name_a: str, a: dict, name_b: str, b: dict, kind: str) -> str:
    def fmt(x: dict) -> str:
        best = x.get("best_title") or x.get("best_bvid") or "无"
        return (
            f"歌曲 {x.get('songs')} 首｜总播放 {_fmt_cn(x.get('total_view', 0))}｜"
            f"传说 {x.get('legend', 0)} / 神话 {x.get('myth', 0)}｜代表曲《{best}》"
        )
    return (
        f"{kind}对比「{name_a}」（库内名 {a.get('name')}）vs「{name_b}」（库内名 {b.get('name')}）：\n"
        f"- {a.get('name')}：{fmt(a)}\n- {b.get('name')}：{fmt(b)}"
    )


def _tool_system_status() -> str:
    from app.services import sync_runner as _sync
    st = _sync.get_status()
    lines = ["数据健康报告："]
    summary = st.get("summary") or {}
    if st.get("running"):
        lines.append("- 官方数据同步：⏳ 进行中…")
    else:
        boards = summary.get("boards") or {}
        if not boards:
            lines.append("- 官方数据同步：无历史同步记录")
        else:
            for k, v in boards.items():
                mark = "✅" if v.get("up_to_date") else "⚠️ 有更新"
                lines.append(f"- 官方榜[{k}]：最新 {v.get('local_latest')}（远端 {v.get('remote_latest') or '?'}）{mark}")
    conn = _db.connect_source()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM songs_all").fetchone()["c"]
    finally:
        conn.close()
    lines.append(f"- 收录池：{total} 首")
    snaps = _rank.list_snapshots(3)
    if snaps:
        latest = snaps[0]
        lines.append(f"- 最近快照：#{latest.get('id')}（{latest.get('count')} 首，{_fmt_time(latest.get('created_at'))}）")
    else:
        lines.append("- 最近快照：无")
    hot_total = _crawler.get_rankings("score", "", None, 1)["summary"].get("total", 0)
    lines.append(f"- 实时热度库：{hot_total} 首（殿堂/传说/神话分级中）")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 实时热度工具（只读，直接执行；纯文本结果回灌，前端通用渲染）
# ---------------------------------------------------------------------------
def _tool_hot_momentum(metric: str = "view", limit: int = 10) -> str:
    if metric not in ("view", "favorite", "coin", "like", "share", "score"):
        metric = "view"
    data = _crawler.get_momentum(metric, int(limit or 10))
    if not data.get("has_baseline"):
        return "暂无涨速榜基线（需至少两次快照）。请先在「实时热度」页点刷新，或稍后再试。"
    summary = data.get("summary", {})
    items = data.get("items", [])
    label = {
        "view": "播放增量", "favorite": "收藏增量", "coin": "投币增量",
        "like": "点赞增量", "share": "分享增量", "score": "涨速综合分",
    }[metric]
    lines = [f"涨速榜（按{label}，近 {summary.get('window_days', 0)} 天，追踪 {summary.get('tracked', 0)} 首）："]
    lines.append(
        "本轮净增：播放 {pv} / 收藏 {pf} / 投币 {pc} / 点赞 {pl} / 分享 {ps}".format(
            pv=_fmt_cn(summary.get("net_view", 0)),
            pf=_fmt_cn(summary.get("net_favorite", 0)),
            pc=_fmt_cn(summary.get("net_coin", 0)),
            pl=_fmt_cn(summary.get("net_like", 0)),
            ps=_fmt_cn(summary.get("net_share", 0)),
        )
    )
    if not items:
        lines.append("（无数据）")
    key = {
        "view": "dv", "favorite": "df", "coin": "dc", "like": "dl", "share": "ds", "score": "dscore",
    }[metric]
    for i, it in enumerate(items, 1):
        name = it.get("title_cn") or it.get("title") or it.get("bvid")
        v = it.get(key, 0)
        lines.append(
            f"{i}. {name}（{it.get('bvid')}）｜{label} +{_fmt_cn(v)}"
            f"｜日增≈{_fmt_cn(it.get('day_view', 0))}｜当前播放 {_fmt_cn(it.get('view', 0))}"
        )
    return "\n".join(lines)


def _tool_hot_rankings(sort: str = "score", q: str = "", tier: str = "", limit: int = 20) -> str:
    if sort not in ("score", "view", "favorite", "coin", "like", "share", "pubtime"):
        sort = "score"
    data = _crawler.get_rankings(sort, q or "", tier or None, int(limit or 20))
    items = data.get("items", [])
    summary = data.get("summary", {})
    sort_label = {
        "score": "得分", "view": "播放", "favorite": "收藏", "coin": "投币",
        "like": "点赞", "share": "分享", "pubtime": "投稿时间",
    }[sort]
    lines = [
        f"实时综合榜（按{sort_label} Top{len(items)}；全库 {summary.get('total', 0)} 首："
        f"神话 {summary.get('myth', 0)} / 传说 {summary.get('legend', 0)} / 殿堂 {summary.get('hall', 0)}）："
    ]
    if not items:
        lines.append("（无数据）")
    for i, it in enumerate(items, 1):
        name = it.get("title_cn") or it.get("title") or it.get("bvid")
        dv = it.get("dv")
        delta = ""
        if dv is not None:
            delta = (
                f" ｜ 较前次 +播放{_fmt_cn(it.get('dv', 0))}"
                f"/+收藏{_fmt_cn(it.get('df', 0))}/+投币{_fmt_cn(it.get('dc', 0))}/+赞{_fmt_cn(it.get('dl', 0))}"
            )
        lines.append(f"{i}. {name}（{it.get('bvid')}）｜播放 {_fmt_cn(it.get('view', 0))}{delta}")
    return "\n".join(lines)


def _tool_search_thinking(query: str) -> str:
    if not query:
        return "请提供关键词（中文名 / 标题 / UP主 / BV号 / B站链接）"
    items = _crawler.think_search(query, limit=10)
    if not items:
        return f"术曲思考库未匹配到「{query}」。可先在主站「术曲思考」页检索，或换关键词。"
    lines = [f"术曲思考匹配（{len(items)} 首）："]
    for it in items:
        name = it.get("title_cn") or it.get("title") or it.get("bvid")
        lines.append(f"- {name}（{it.get('bvid')}）｜UP {it.get('owner', '')}｜来源 {it.get('matched', '')}")
    return "\n".join(lines)


def _tool_snapshots(limit: int = 10) -> str:
    items = _rank.list_snapshots(int(limit or 10))
    if not items:
        return "暂无快照记录。"
    lines = [f"最近 {len(items)} 次爬取快照："]
    for it in items:
        lines.append(
            f"- 快照#{it.get('id')} ｜ {it.get('scope')} ｜ {it.get('count')} 首 ｜ {it.get('created_at')}"
        )
    return "\n".join(lines)


def _tool_relation_graph(center: str | None, kind: str = "auto", limit: int = 10) -> str:
    """构建歌姬↔P主↔歌曲关系图谱数据（ECharts graph 可直接用）。"""
    center = (center or "").strip()
    if not center:
        return "请提供中心节点名称（歌姬或P主）"
    try:
        limit = max(1, min(int(limit or 10), 30))
    except (TypeError, ValueError):
        limit = 10
    conn = _db.connect_source()
    try:
        rows = conn.execute(
            "SELECT bvid, title, title_cn, first_recorded_at, producers, vocalists FROM songs_all"
        ).fetchall()
    finally:
        conn.close()
    # 索引：作者名 -> 歌曲 bvid 列表；bvid -> 歌曲元数据
    prod_songs: dict[str, list[str]] = {}
    vocal_songs: dict[str, list[str]] = {}
    meta: dict[str, dict] = {}
    for r in rows:
        bvid = r["bvid"]
        title = r["title_cn"] or r["title"] or bvid
        prods = {p.get("name", "").strip() for p in _db.parse_json_list(r["producers"]) if p.get("name", "").strip()}
        vocs = {v.get("name", "").strip() for v in _db.parse_json_list(r["vocalists"]) if v.get("name", "").strip()}
        meta[bvid] = {
            "title": title, "first": r["first_recorded_at"] or 0,
            "producers": prods, "vocalists": vocs,
        }
        for p in prods:
            prod_songs.setdefault(p, []).append(bvid)
        for v in vocs:
            vocal_songs.setdefault(v, []).append(bvid)
    # 判定中心类型
    is_vocal = center in vocal_songs
    is_prod = center in prod_songs
    if kind == "vocalist":
        role = "vocalist"
    elif kind == "producer":
        role = "producer"
    elif is_vocal and not is_prod:
        role = "vocalist"
    elif is_prod and not is_vocal:
        role = "producer"
    elif is_vocal:
        role = "vocalist"
    else:
        return f"未在收录池中找到「{center}」（既非歌姬也非P主），可换一个名字试试。"
    # 中心相关歌曲：按首次收录时间倒序取前 limit 首
    songs = (vocal_songs if role == "vocalist" else prod_songs).get(center, [])
    if not songs:
        return f"「{center}」在收录池中暂无关联歌曲。"
    songs.sort(key=lambda b: meta[b]["first"], reverse=True)
    songs = songs[:limit]

    # 构建图：nodes/links
    nodes: list[dict] = []
    links: list[dict] = []
    seen: set[str] = set()

    def add(nid: str, name: str, category: int, symbol: int, value: int) -> None:
        if nid in seen:
            return
        seen.add(nid)
        nodes.append({"id": nid, "name": name, "category": category, "symbolSize": symbol, "value": value})

    def link(src: str, dst: str) -> None:
        links.append({"source": src, "target": dst, "value": 1})

    cid = f"c:{center}"
    add(cid, center, 0, 48, len(songs))
    for bvid in songs:
        sid = f"s:{bvid}"
        add(sid, meta[bvid]["title"], 3, 16, 1)
        link(cid, sid)
        if role == "vocalist":
            for p in sorted(meta[bvid]["producers"]):
                pid = f"p:{p}"
                add(pid, p, 2, 24, len(prod_songs.get(p, [])))
                link(pid, sid)
        else:
            for v in sorted(meta[bvid]["vocalists"]):
                vid = f"v:{v}"
                add(vid, v, 1, 24, len(vocal_songs.get(v, [])))
                link(vid, sid)
    payload = {
        "nodes": nodes,
        "links": links,
        "categories": [{"name": "中心"}, {"name": "歌姬"}, {"name": "P主"}, {"name": "歌曲"}],
        "center": center,
        "role": "歌姬" if role == "vocalist" else "P主",
        "song_count": len(songs),
    }
    head = (
        f"「{center}」关系图谱：{len(songs)} 首歌，{len(nodes)} 个节点，{len(links)} 条边。"
        "请用 render_chart 渲染力导向关系图：series:[{type:'graph',layout:'force',data:nodes,links,categories,roam:true,force:{repulsion:300}}]。"
    )
    return head + "\n" + json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 网易云音乐工具（只读，直接执行；纯文本结果回灌，前端通用渲染）
# ---------------------------------------------------------------------------
def _fmt_netease_list(items: list[dict]) -> str:
    if not items:
        return "（无结果）"
    out = []
    for it in items:
        line = f"- [{it.get('id')}] {it.get('name')}"
        if it.get("sub"):
            line += f" ｜ {it.get('sub')}"
        if it.get("pop") is not None:
            line += f" ｜ 热度 {it.get('pop')}"
        out.append(line)
    return "\n".join(out)


def _tool_netease_search(keyword: str | None, stype: str = "song", limit: int = 10) -> str:
    if not keyword:
        return "缺少 keyword 参数"
    try:
        res = _netease.search(keyword, stype=stype or "song", limit=min(int(limit or 10), 30))
    except Exception as exc:  # noqa: BLE001
        return f"网易云搜索失败：{exc}（可能为网络受限）"
    items = res.get("items") or []
    if not items:
        return f"网易云未搜索到与「{keyword}」相关的{stype or 'song'}"
    head = f"网易云搜索「{keyword}」（{stype or 'song'}，命中 {len(items)} 条）："
    return head + "\n" + _fmt_netease_list(items)


def _tool_netease_song(song_id: str | None) -> str:
    if not song_id:
        return "缺少 song_id 参数"
    try:
        d = _netease.get_song_detail(song_id)
    except Exception as exc:  # noqa: BLE001
        return f"网易云单曲详情获取失败：{exc}（可能为网络受限）"
    if not d:
        return f"网易云未找到 id={song_id} 的单曲"
    alias = ("（" + "/".join(d.get("alias") or []) + "）") if d.get("alias") else ""
    lines = [
        f"网易云单曲：{d.get('name')}{alias}（id {d.get('id')}）",
        f"歌手：{' / '.join(d.get('artists') or [])}",
        f"专辑：{d.get('album')}",
        f"时长：{_fmt_ms(d.get('duration_ms'))}",
        f"热度(pop)：{d.get('pop')}",
        f"评论数：{d.get('comment_count')}",
        "播放量：未公开（网易云已关闭公开播放量接口）",
    ]
    return "\n".join(lines)


def _tool_netease_lyric(song_id: str | None) -> str:
    if not song_id:
        return "缺少 song_id 参数"
    try:
        d = _netease.get_lyric(song_id)
    except Exception as exc:  # noqa: BLE001
        return f"网易云歌词获取失败：{exc}（可能为网络受限）"
    if not d:
        return f"网易云未找到 id={song_id} 的歌词"
    lines = d.get("lines") or []
    if not lines:
        return f"该曲（id={song_id}）暂无歌词文本"
    head = f"歌词（id={song_id}，{('含翻译' if d.get('has_translation') else '无翻译')}，列前 60 行）："
    body = []
    for ln in lines[:60]:
        if ln.get("tl"):
            body.append(f"{ln.get('text')}  /  {ln.get('tl')}")
        else:
            body.append(ln.get("text"))
    return head + "\n" + "\n".join(body)


def _tool_netease_artist(artist_id: str | None) -> str:
    if not artist_id:
        return "缺少 artist_id 参数"
    try:
        d = _netease.get_artist_detail(artist_id)
    except Exception as exc:  # noqa: BLE001
        return f"网易云歌手详情获取失败：{exc}（可能为网络受限）"
    if not d:
        return f"网易云未找到 id={artist_id} 的歌手"
    lines = [
        f"网易云歌手：{d.get('name')}（id {d.get('id')}）",
        f"简介：{(d.get('brief_desc') or '无')[:200]}",
        f"作品数 {d.get('music_size')} ｜ 专辑 {d.get('album_size')} ｜ MV {d.get('mv_size')}",
        "热门歌曲（前 15）：",
    ]
    for s in (d.get("hot_songs") or [])[:15]:
        lines.append(f"- [{s.get('id')}] {s.get('name')} ｜ {' / '.join(s.get('artists') or [])}")
    return "\n".join(lines)


def _tool_netease_album(album_id: str | None) -> str:
    if not album_id:
        return "缺少 album_id 参数"
    try:
        d = _netease.get_album_detail(album_id)
    except Exception as exc:  # noqa: BLE001
        return f"网易云专辑详情获取失败：{exc}（可能为网络受限）"
    if not d:
        return f"网易云未找到 id={album_id} 的专辑"
    pt = d.get("publish_time")
    ptime = _fmt_time(int(pt) // 1000) if pt else "未知"
    lines = [
        f"网易云专辑：{d.get('name')}（id {d.get('id')}）",
        f"歌手：{d.get('artist')}｜发行：{ptime}｜曲目数 {d.get('size')}",
    ]
    if d.get("description"):
        lines.append(f"简介：{str(d.get('description'))[:200]}")
    songs = d.get("songs") or []
    if songs:
        lines.append(f"曲目（{len(songs)} 首，列前 20）：")
        for s in songs[:20]:
            lines.append(f"- [{s.get('id')}] {s.get('name')}")
    return "\n".join(lines)


def _tool_netease_playlist(playlist_id: str | None) -> str:
    if not playlist_id:
        return "缺少 playlist_id 参数"
    try:
        d = _netease.get_playlist_detail(playlist_id)
    except Exception as exc:  # noqa: BLE001
        return f"网易云歌单详情获取失败：{exc}（可能为网络受限）"
    if not d:
        return f"网易云未找到 id={playlist_id} 的歌单"
    lines = [
        f"网易云歌单：{d.get('name')}（id {d.get('id')}）",
        f"创建者：{d.get('creator')}｜收藏 {d.get('subscribed_count')}｜评论 {d.get('comment_count')}",
        f"标签：{'、'.join(d.get('tags') or []) or '无'}｜曲目数 {d.get('track_count')}",
    ]
    if d.get("description"):
        lines.append(f"简介：{str(d.get('description'))[:200]}")
    tracks = d.get("tracks") or []
    if tracks:
        lines.append(f"曲目（{len(tracks)} 首，列前 20）：")
        for s in tracks[:20]:
            lines.append(f"- [{s.get('id')}] {s.get('name')} ｜ {' / '.join(s.get('artists') or [])}")
    return "\n".join(lines)


def _tool_netease_song_url(song_id: str | None, br: int = 320000) -> str:
    if not song_id:
        return "缺少 song_id 参数"
    try:
        d = _netease.get_song_url(song_id, br=int(br or 320000))
    except Exception as exc:  # noqa: BLE001
        return f"网易云播放直链获取失败：{exc}（可能为网络受限）"
    if not d or not d.get("url"):
        code = d.get("code") if d else None
        return f"网易云未返回 id={song_id} 的播放直链（code={code}，可能因版权限制）"
    return (
        f"网易云单曲 id={song_id} 播放直链：\n{d.get('url')}\n"
        f"（码率 {d.get('br')}，大小 {d.get('size')} 字节，直链约 20 分钟有效，过期需重新获取）"
    )


def _tool_netease_comments(song_id: str | None, limit: int = 5) -> str:
    if not song_id:
        return "缺少 song_id 参数（可先用 netease_search 搜索拿到 id）"
    try:
        d = _netease.get_song_comments(song_id, int(limit or 5))
    except Exception as exc:  # noqa: BLE001
        return f"网易云评论获取失败：{exc}（可能为网络受限）"
    if not d:
        return "网易云评论获取失败（网络受限或该曲无评论）"
    lines = [f"网易云单曲 {d.get('id')}：共 {d.get('total', 0)} 条评论，热评 Top{len(d.get('hot', []))}："]
    if not d.get("hot"):
        lines.append("（无热评）")
    for i, c in enumerate(d.get("hot", []), 1):
        content = (c.get("content") or "").replace("\n", " ")
        lines.append(f"{i}. {c.get('nickname')}：{content[:80]}（👍{c.get('liked')}）")
    return "\n".join(lines)


def _tool_refresh_data(scope: str | None = None) -> str:
    try:
        ok = _crawler.start_refresh(scope or "recent", 10)
        if not ok:
            return "已有刷新任务正在进行中，请稍后再试"
        return ("已触发后台数据刷新任务（采集近期曲子实时数据）。该任务依赖网络，"
                "受限环境下可能部分失败；完成后可重新查询周榜查看最新数据。")
    except Exception as exc:  # noqa: BLE001
        return f"触发刷新失败：{exc}"


def _tool_rebuild_snapshots(scope: str | None = None) -> str:
    try:
        conn = _crawler.connect_hot(readonly=False)
        try:
            sid = _crawler._save_snapshot(conn, scope or "recent")
        finally:
            conn.close()
        return f"已重建快照 #{sid}（来自 hot_cache 当前数据）。"
    except Exception as exc:  # noqa: BLE001
        return f"重建快照失败：{exc}（可能 hot_cache 暂无数据，请先执行 refresh_data）"


def _tool_recalc_scores(board_type: str | None = None, issue: str | None = None) -> str:
    bt = board_type or "weekly"
    conn = _db.connect_source()
    try:
        issues = _boards.list_issues(conn, bt)
        if not issues:
            return f"暂无 {bt} 榜单"
        key = issue or issues[0]["issue"]
        items = _boards.get_issue_rankings(conn, bt, key, top=10)
        if not items:
            return f"{bt} 第 {key} 期无数据"
        recalced = _boards._recalc(items, bt, key)
        lines = [f"{bt} 第 {key} 期 Top10 新旧分数对比（现行公式）："]
        for old, new in zip(items, recalced):
            lines.append(f"- {old.get('title_cn') or old.get('title')}：原 {old.get('score')} → 新 {new.get('score')}")
        lines.append("（此为只读报告，未改动数据库）")
        return "\n".join(lines)
    finally:
        conn.close()


def _execute_tool(name: str, args_str: str, sources: list | None = None) -> str:
    """按工具名执行 handler，返回字符串结果（已截断，便于回灌模型）。
    注意：client 工具（收藏/笔记/导出）与 danger 工具（刷新/重建/重算）不在此处执行，
    由 run_agent 分流处理（前者前端执行、后者需用户确认后执行）。
    sources：联网类工具（web_search/web_fetch）会把来源写入该列表，供上层回传前端展示。"""
    try:
        args = json.loads(args_str) if args_str else {}
        if not isinstance(args, dict):
            args = {}
    except json.JSONDecodeError:
        args = {}
    try:
        if name == "get_weekly_ranking":
            return _truncate(_tool_weekly(args.get("issue")))
        if name == "get_annual_ranking":
            return _truncate(_tool_annual(args.get("year")))
        if name == "get_legend_songs":
            return _truncate(_tool_legend(args.get("issue")))
        if name == "get_song_detail":
            return _truncate(_tool_song_detail(args.get("bvid")))
        if name == "search_songs":
            return _truncate(_tool_search(args.get("query"), args.get("limit") or 10))
        if name == "get_artist_works":
            return _truncate(_tool_artist_works(args.get("name"), args.get("kind")))
        if name == "web_search":
            return _truncate(_tool_web_search(args.get("query"), args.get("max_results") or 5, sources))
        if name == "web_fetch":
            return _truncate(_tool_web_fetch(args.get("url"), args.get("max_chars") or 5000, sources))
        # 扩展只读工具
        if name == "get_song_history":
            return _truncate(_tool_song_history(args.get("bvid")))
        if name == "compare_issues":
            return _truncate(_tool_compare_issues(args.get("board_type"), args.get("issue_a"), args.get("issue_b")))
        if name == "get_weekly_trend":
            return _truncate(_tool_weekly_trend(args.get("bvid"), args.get("count")))
        if name == "filter_songs":
            return _truncate(_tool_filter_songs(
                args.get("year"), args.get("vocalist"), args.get("producer"),
                args.get("min_view") or 0, args.get("limit") or 15))
        if name == "get_legend_timeline":
            return _truncate(_tool_legend_timeline())
        # 更多 B 站榜单查询（只读，直接执行）
        if name == "list_issues":
            return _truncate(_tool_list_issues(args.get("board_type")))
        if name == "get_song_issue_rank":
            return _truncate(_tool_song_issue_rank(args.get("board_type"), args.get("issue"), args.get("bvid")))
        if name == "get_reentry_tracks":
            return _truncate(_tool_reentry_tracks(args.get("board_type"), args.get("top")))
        if name == "get_monthly_ranking":
            return _truncate(_tool_monthly_ranking(args.get("issue"), args.get("top")))
        if name == "get_daily_ranking":
            return _truncate(_tool_daily_ranking(args.get("issue"), args.get("top")))
        # 跨平台对比 + 触发深度分析（只读，直接执行）
        if name == "compare_platforms":
            return _truncate(_tool_compare_platforms(args.get("bvid"), args.get("name")))
        if name == "analyze_song":
            return _truncate(_tool_analyze_song(args.get("bvid")))
        # 更多数据深度工具（只读，直接执行）
        if name == "translate_text":
            return _truncate(_tool_translate_text(args.get("text"), args.get("target")))
        if name == "get_creator_stats":
            return _truncate(_tool_creator_stats(args.get("name"), args.get("role")))
        if name == "get_song_compare":
            return _truncate(_tool_song_compare(args.get("bvid_a"), args.get("bvid_b")))
        if name == "explain_song_score":
            return _truncate(_tool_explain_song_score(args.get("bvid"), args.get("board_type")))
        if name == "get_top_by_metric":
            return _truncate(_tool_top_by_metric(args.get("issue"), args.get("metric"), args.get("top")))
        # 数据盘点（只读，直接执行）
        if name == "get_pool_stats":
            return _truncate(_tool_pool_stats())
        if name == "compare_creators":
            return _truncate(_tool_compare_creators(args.get("name_a"), args.get("name_b"), args.get("role")))
        if name == "get_system_status":
            return _truncate(_tool_system_status())
        # 实时热度（只读，直接执行）
        if name == "get_hot_momentum":
            return _truncate(_tool_hot_momentum(args.get("metric"), args.get("limit")))
        if name == "get_hot_rankings":
            return _truncate(_tool_hot_rankings(args.get("sort"), args.get("q"), args.get("tier"), args.get("limit")))
        if name == "search_thinking":
            return _truncate(_tool_search_thinking(args.get("query")))
        if name == "get_snapshots":
            return _truncate(_tool_snapshots(args.get("limit")))
        if name == "get_relation_graph":
            return _truncate(_tool_relation_graph(args.get("center"), args.get("kind"), args.get("limit")), 16000)
        # 网易云音乐（只读，直接执行）
        if name == "netease_search":
            return _truncate(_tool_netease_search(args.get("keyword"), args.get("stype"), args.get("limit")))
        if name == "netease_song":
            return _truncate(_tool_netease_song(args.get("song_id")))
        if name == "netease_lyric":
            return _truncate(_tool_netease_lyric(args.get("song_id")))
        if name == "netease_artist":
            return _truncate(_tool_netease_artist(args.get("artist_id")))
        if name == "netease_album":
            return _truncate(_tool_netease_album(args.get("album_id")))
        if name == "netease_playlist":
            return _truncate(_tool_netease_playlist(args.get("playlist_id")))
        if name == "netease_song_url":
            return _truncate(_tool_netease_song_url(args.get("song_id"), args.get("br")))
        if name == "netease_comments":
            return _truncate(_tool_netease_comments(args.get("song_id"), args.get("limit")))
        # 系统任务（danger，通常需先确认；此处为已确认后的真实执行分支）
        if name == "refresh_data":
            return _truncate(_tool_refresh_data(args.get("scope")))
        if name == "rebuild_snapshots":
            return _truncate(_tool_rebuild_snapshots(args.get("scope")))
        if name == "recalc_scores":
            return _truncate(_tool_recalc_scores(args.get("board_type"), args.get("issue")))
        return f"未知工具：{name}"
    except Exception as exc:  # noqa: BLE001
        logger.exception("tool %s failed", name)
        return f"工具执行出错：{exc}"


def run_agent(messages: list[dict], max_steps: int = 6, max_tokens: int | None = None,
              temperature: float = DEFAULT_TEMPERATURE, approved: list[dict] | None = None) -> Iterator[dict]:
    """云端 ReAct 工具循环（流式 SSE 事件生成器）。

    yield 事件类型：
      - reasoning        : 模型思考过程增量
      - content          : 最终正文增量
      - tool_call        : 即将执行某个工具 {id,name,arguments,client?}
      - tool_result      : 工具执行结果 {id,name,content}
      - chart            : 生成式图表 {id,title,option}（前端渲染 ECharts，无需确认）
      - client_action    : 需前端本地执行的带权限操作 {id,name,arguments,action,payload,need_confirm}
      - confirm_required : 需用户确认的危险操作 {id,name,arguments,risk}
      - done             : 结束（paused 字段标记是否因等待确认而暂停）
      - error            : 异常 {text}

    本地模式（无 AI_BASE_URL）：4B/2B 蒸馏模型无法可靠 tool-calling，直接退化为纯 chat 流式。
    """
    if not _CLOUD_MODE:
        yield from stream_chat(messages, max_tokens or DEFAULT_MAX_TOKENS, temperature)
        return

    _ensure_init()
    msgs = [{"role": "system", "content": AGENT_SYSTEM}] + list(messages)
    steps = max(1, min(int(os.environ.get("AI_AGENT_MAX_STEPS", str(max_steps))), 12))
    mt = max_tokens or AI_CLOUD_MAX_TOKENS
    sources: list[dict] = []  # 联网来源累积（web_search / web_fetch 写入）

    # approved：前端确认后回传的已授权操作列表 [{name, arguments}]
    approved_set: set[tuple] = set()
    for a in (approved or []):
        try:
            approved_set.add((a.get("name"), json.dumps(json.loads(a.get("arguments", "{}")), ensure_ascii=False, sort_keys=True)))
        except Exception:  # noqa: BLE001
            approved_set.add((a.get("name"), a.get("arguments", "")))

    for step in range(steps):
        payload = {
            "model": AI_MODEL,
            "messages": msgs,
            "max_tokens": mt,
            "temperature": temperature,
            "stream": True,
            "tools": AGENT_TOOLS,
            "tool_choice": "auto",
            **_thinking_payload(),
        }
        tool_calls: dict[int, dict] = {}
        saw_tool = False
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                with client.stream(
                    "POST",
                    f"{_target_base()}/chat/completions",
                    headers=_headers(),
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        body = resp.read().decode("utf-8", "ignore")
                        yield {"type": "error", "text": f"HTTP {resp.status_code}: {body[:200]}"}
                        return
                    for line in resp.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        chunk = line[5:].strip()
                        if chunk == "[DONE]":
                            continue
                        try:
                            obj = json.loads(chunk)
                        except json.JSONDecodeError:
                            continue
                        for ch in obj.get("choices", [{}]):
                            delta = ch.get("delta", {})
                            if delta.get("reasoning_content"):
                                yield {"type": "reasoning", "text": delta["reasoning_content"]}
                            if delta.get("content"):
                                yield {"type": "content", "text": delta["content"]}
                            for tc in (delta.get("tool_calls") or []):
                                saw_tool = True
                                idx = tc.get("index", 0)
                                slot = tool_calls.setdefault(idx, {"id": "", "name": "", "args": ""})
                                if tc.get("id"):
                                    slot["id"] = tc["id"]
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    slot["name"] += fn["name"]
                                if fn.get("arguments"):
                                    slot["args"] += fn["arguments"]
        except Exception as exc:  # noqa: BLE001
            logger.exception("agent stream failed")
            yield {"type": "error", "text": str(exc)}
            return

        if not saw_tool:
            yield {"type": "done"}
            return

        # 本步工具调用收尾：分配稳定 id，写入 assistant(tool_calls) 与 tool 结果
        ordered: list[dict] = []
        for idx in sorted(tool_calls):
            t = tool_calls[idx]
            t["tid"] = t["id"] or f"call_{step}_{idx}"
            ordered.append(t)
        msgs.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {"id": t["tid"], "type": "function",
                 "function": {"name": t["name"], "arguments": t["args"]}}
                for t in ordered
            ],
        })
        for t in ordered:
            name = t["name"]
            args_str = t["args"] or "{}"
            try:
                norm = (name, json.dumps(json.loads(args_str), ensure_ascii=False, sort_keys=True))
            except Exception:  # noqa: BLE001
                norm = (name, args_str)

            # 1) 用户数据操作（client）：前端本地执行，后端只发起并暂停；
            #    只读工具（list_favorites 等）标记 need_confirm=false，前端自动执行后继续
            if name in CLIENT_TOOLS:
                need_confirm = name not in CLIENT_READONLY_TOOLS
                yield {"type": "tool_call", "id": t["tid"], "name": name, "arguments": args_str, "client": True}
                yield {
                    "type": "client_action",
                    "id": t["tid"],
                    "name": name,
                    "arguments": args_str,
                    "action": name,
                    "payload": _safe_json(args_str),
                    "need_confirm": need_confirm,
                }
                yield {"type": "done", "paused": "client_action"}
                return

            # 2) 系统任务（danger）：未确认则暂停等待前端确认，已确认则本轮执行
            if name in DANGER_TOOLS:
                if norm not in approved_set:
                    yield {"type": "tool_call", "id": t["tid"], "name": name, "arguments": args_str}
                    yield {
                        "type": "confirm_required",
                        "id": t["tid"],
                        "name": name,
                        "arguments": args_str,
                        "risk": _RISK_DESC.get(name, "该操作有副作用，请确认。"),
                    }
                    yield {"type": "done", "paused": "confirm_required"}
                    return
                yield {"type": "tool_call", "id": t["tid"], "name": name, "arguments": args_str}
                before = len(sources)
                result_text = _execute_tool(name, args_str, sources=sources)
                yield {"type": "tool_result", "id": t["tid"], "name": name, "content": result_text}
                msgs.append({"role": "tool", "tool_call_id": t["tid"], "content": result_text})
                if len(sources) > before:
                    yield {"type": "sources", "items": sources[before:]}
                continue

            # 3) 生成式图表：模型产出 ECharts option，透传给前端渲染（不回灌为文本工具结果）
            if name in CHART_TOOLS:
                try:
                    cargs = json.loads(args_str)
                except Exception:  # noqa: BLE001
                    cargs = {}
                option = cargs.get("option") if isinstance(cargs, dict) else None
                title = (cargs.get("title") or "") if isinstance(cargs, dict) else ""
                yield {"type": "tool_call", "id": t["tid"], "name": name, "arguments": args_str}
                if not isinstance(option, dict) or "series" not in option:
                    msg = "图表 option 无效（需为含 series 字段的对象）"
                    yield {"type": "tool_result", "id": t["tid"], "name": name, "content": msg}
                    msgs.append({"role": "tool", "tool_call_id": t["tid"], "content": msg})
                    continue
                yield {"type": "chart", "id": t["tid"], "title": title, "option": option}
                yield {"type": "tool_result", "id": t["tid"], "name": name,
                       "content": f"已生成图表：{title or '(无标题)'}"}
                msgs.append({"role": "tool", "tool_call_id": t["tid"], "content": f"已渲染图表：{title}"})
                continue

            # 4) 普通只读工具：直接执行并回灌
            yield {"type": "tool_call", "id": t["tid"], "name": name, "arguments": args_str}
            before = len(sources)
            result_text = _execute_tool(name, args_str, sources=sources)
            yield {"type": "tool_result", "id": t["tid"], "name": name, "content": result_text}
            msgs.append({"role": "tool", "tool_call_id": t["tid"], "content": result_text})
            if len(sources) > before:
                yield {"type": "sources", "items": sources[before:]}

    yield {"type": "error", "text": f"已达到最大工具调用步数（{steps}），仍未给出最终结论。"}
    yield {"type": "done"}
