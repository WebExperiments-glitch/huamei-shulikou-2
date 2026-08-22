"""AI 分析接口。

预留的可复用接口：
- GET  /api/ai/health       模型是否就绪
- POST /api/ai/stream       通用流式分析（任意 system+prompt）— 其它页面直接调这个
- POST /api/ai/stream-song  术曲思考专用：传 bvid（+可选追问），后端组装实时数据后流式分析

所有流式接口返回 text/event-stream（SSE），每个事件为 JSON：
  {"type":"content","text":"..."}  | {"type":"reasoning","text":"..."}
  | {"type":"done"} | {"type":"error","text":"..."}
  | {"type":"cache","hit":true}   # 命中缓存时先发，用于前端展示「⚡命中缓存」
"""
from __future__ import annotations

import hashlib
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.cache import cache_get_json, cache_put_json
from app.core.ratelimit import ai_limiter
from app.services import ai as ai_service
from app.services import crawler

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _rate_limit(request: Request):
    """按客户端 IP 对重量级 AI 流式接口做滑动窗口限流，防并发风暴。

    云端模式敞开使用：跳过限流（云端按用量计费、无需护显存）；仅本地模式限流。
    这样云端 / 本地两个模型使用各自独立的限制策略，不会互相挤占同一个配额。
    """
    if ai_service.cloud_mode():
        return
    ip = request.client.host if request.client else "anon"
    if not ai_limiter.allow(ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")


# AI 流式响应缓存 TTL（秒），可用环境变量 AI_CACHE_TTL 覆盖；0 表示关闭缓存。
AI_CACHE_TTL = int(os.environ.get("AI_CACHE_TTL", "600"))


def _stream_cached(messages: list[dict], key_raw: str, max_tokens: int, temperature: float,
                   thinking: bool | None = None):
    """带缓存的流式包装。

    - 命中：先发 {"type":"cache","hit":True} 事件，再回放缓存中的事件序列（秒回）。
    - 未命中：真实请求，边 yield 边收集，仅当最终为 done 才落缓存（避免缓存失败响应）。

    key_raw 由「稳定字段」组成（如 bvid + 对话历史 + 参数），刻意不含实时互动数据；
    这样同一曲、同一追问（或重开分析），即使两次抓取到的实时数字有微小漂移，也能稳定命中缓存。
    thinking 也会进入缓存 key：开/关思考的产物（是否含 reasoning）不同，避免串用。
    """
    if AI_CACHE_TTL <= 0:
        yield from ai_service.stream_chat(messages, max_tokens, temperature, thinking)
        return
    key = "ai-stream|" + hashlib.md5((key_raw + f"|think:{thinking}").encode("utf-8")).hexdigest()
    hit, events = cache_get_json(key)
    if hit and events:
        yield {"type": "cache", "hit": True}
        for ev in events:
            yield ev
        return
    collected: list[dict] = []
    for ev in ai_service.stream_chat(messages, max_tokens, temperature, thinking):
        collected.append(ev)
        yield ev
    if collected and collected[-1].get("type") == "done":
        cache_put_json(key, collected, AI_CACHE_TTL)


class StreamReq(BaseModel):
    system: str | None = None
    prompt: str
    max_tokens: int = 1024
    temperature: float = 0.6
    thinking: bool | None = None  # None=跟随 env 默认；True 开思考；False 关思考（省钱）


class SongStreamReq(BaseModel):
    bvid: str
    # 完整对话历史（按时间顺序，含最新一条用户消息）：
    #   [{"role": "user"|"assistant", "content": str}, ...]
    # 后端会在 system 之后注入一次真实数据上下文，再追加该历史，支持多轮追问。
    history: list[dict] = []
    max_tokens: int = 2560
    temperature: float = 0.6
    thinking: bool | None = None


class AgentGoal(BaseModel):
    """目标圆次预算（借鉴 dsh goal 的 maxGoalRounds）：限制工具调用轮次防失控。
    max_rounds 到达后仍未给出结论，后端发 goal_exhausted 并停止继续调工具。"""
    objective: str = ""  # 目标描述（仅展示用）
    max_rounds: int = 3  # 工具调用圆次上限（1~8，内部再钳制到 max_steps）


class AgentReq(BaseModel):
    # 多轮对话历史：[{role:"user"|"assistant", content:str}, ...]
    # 后端会在 system 之后注入这些消息并重跑工具循环（无服务端会话存储，前端负责维护上下文）。
    messages: list[dict] = []
    max_steps: int = 6  # 工具循环最大步数（1~8）
    approved: list[dict] = []  # 用户已确认的危险操作 [{name, arguments}]，用于二次执行
    thinking: bool | None = None  # None=跟随 env 默认；True 开思考；False 关思考（省钱）
    goal: AgentGoal | None = None  # 目标圆次预算；设置后以 min(max_rounds, max_steps) 为循环上限


class SwitchReq(BaseModel):
    model: str = "2b"  # 4b / 2b


@router.get("/health")
def health():
    return ai_service.health()


@router.post("/switch")
def switch(req: SwitchReq):
    """手动切换模型（4b / 2b）。目标服务不在线时自动拉起。"""
    return ai_service.switch_model(req.model)


@router.post("/stream", dependencies=[Depends(_rate_limit)])
def stream(req: StreamReq):
    messages: list[dict] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.append({"role": "user", "content": req.prompt})

    key_raw = (
        json.dumps(messages, ensure_ascii=False, sort_keys=True)
        + f"|{req.max_tokens}|{req.temperature}"
    )

    def gen():
        for ev in _stream_cached(messages, key_raw, req.max_tokens, req.temperature, req.thinking):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/stream-song", dependencies=[Depends(_rate_limit)])
def stream_song(req: SongStreamReq):
    detail = crawler.think_detail(req.bvid)
    if not detail:
        def err():
            yield "data: " + json.dumps(
                {"type": "error", "text": f"未找到曲子 {req.bvid} 的实时数据"}
            ) + "\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    # system + 一次性注入真实数据上下文 + 完整对话历史（多轮追问）
    messages: list[dict] = [
        {"role": "system", "content": ai_service.SONG_ANALYST_SYSTEM},
        {"role": "user", "content": ai_service.build_song_context(req.bvid, detail)},
    ]
    for turn in req.history:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        messages.append({"role": role, "content": content})

    key_raw = (
        req.bvid
        + "|"
        + json.dumps(req.history, ensure_ascii=False, sort_keys=True)
        + f"|{req.max_tokens}|{req.temperature}"
    )

    def gen():
        for ev in _stream_cached(messages, key_raw, req.max_tokens, req.temperature, req.thinking):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/agent", dependencies=[Depends(_rate_limit)])
def agent(req: AgentReq):
    """Agents 接口（SSE 流式）。

    - 云端模式：启用工具循环（ReAct），模型可调用周榜/年榜/传说曲/单曲详情/检索/作者作品/联网搜索。
    - 本地模式：4B/2B 蒸馏模型无法可靠 tool-calling，自动退化为纯 chat 流式。

    事件格式同 /stream：content / reasoning / tool_call / tool_result / done / error。
    """
    clean = []
    for m in req.messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            clean.append({"role": role, "content": content})
    if not clean:
        def err():
            yield "data: " + json.dumps({"type": "error", "text": "消息为空"}) + "\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    steps = max(1, min(int(req.max_steps), 8))

    def gen():
        goal_payload = req.goal.model_dump() if req.goal else None
        for ev in ai_service.run_agent(clean, max_steps=steps, approved=req.approved,
                                       thinking=req.thinking, goal=goal_payload):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/chat/completions")
async def proxy_chat_completions(request: Request):
    """OpenAI 兼容流式透传代理：供 AI 伴侣等前端直连受限的第三方端点经本后端中转，
    绕开浏览器 CORS 拦截。文本/流式通用，上游 SSE 原样转发。
    """
    body = await request.body()

    def gen():
        yield from ai_service.openai_chat_completions_passthrough(body)

    return StreamingResponse(gen(), media_type="text/event-stream")
