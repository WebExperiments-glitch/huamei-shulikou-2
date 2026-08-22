"""DeepSeek 官方 tokenizer 的离线 token 计量（借鉴 dsh 的 token-meter 思路）。

用官方发布的 tokenizer.json（HuggingFace tokenizers 格式）在本地估算 token 用量，
无需联网、不消耗 API 额度。用途：
  - 请求发出前预估输入 token 数，让前端展示「本次约消耗 N tokens」
  - 结合模型返回的缓存命中/未命中，按 DeepSeek 定价估算成本（命中仅约 1/10 计费）

tokenizer.json 由官方发布，路径固定于 backend/assets/deepseek_tokenizer/。
"""
from __future__ import annotations

import json
import os
import threading
from functools import lru_cache

# 官方 tokenizer 目录（相对 backend 根）
_TOKENIZER_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "assets", "deepseek_tokenizer")
_TOKENIZER_FILE = os.path.join(_TOKENIZER_DIR, "tokenizer.json")

_load_lock = threading.Lock()
_tokenizer: object | None = None  # tokenizers.Tokenizer 单例


def get_tokenizer():
    """懒加载官方 tokenizer（约 7.8MB，首次加载后缓存为模块级单例）。"""
    global _tokenizer
    if _tokenizer is None:
        with _load_lock:
            if _tokenizer is None:
                from tokenizers import Tokenizer

                _tokenizer = Tokenizer.from_file(_TOKENIZER_FILE)
    return _tokenizer


@lru_cache(maxsize=4096)
def count_tokens(text: str) -> int:
    """离线估算一段文本的 token 数（带小缓存，相同文本只算一次）。"""
    if not text:
        return 0
    try:
        return len(get_tokenizer().encode(text).ids)
    except Exception:  # noqa: BLE001  tokenizer 损坏等极端情况降级为启发式
        # 中英文混合启发式：中文约 0.6 token/字，英文约 0.25 token/字符
        cn = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
        return cn + int((len(text) - cn) * 0.3) + 1


def count_messages(messages: list[dict], tools: list[dict] | None = None) -> int:
    """按 OpenAI 消息格式估算整段请求的输入 token 数（角色名与分隔符近似计入）。

    与模型端计费不完全一致（官方可能再套一层 chat template 特殊 token），
    但作为「请求前预估」足够准：把 role、content 与必要分隔符拼成文本再编码。
    tools 传入时会把工具 schema 的序列化文本一并计入（agent 请求中 tools 会真实
    计入 prompt tokens，约占大头），使离线估算更贴近模型端的输入规模。
    """
    if not messages:
        return 0
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")
        if content is None:
            # 带工具调用的 assistant 消息：只计函数名与参数
            for tc in m.get("tool_calls") or []:
                fn = tc.get("function", {})
                parts.append(f"<|{role}|>{fn.get('name', '')}:{fn.get('arguments', '')}")
            continue
        parts.append(f"<|{role}|>{content}")
    if tools:
        parts.append("<|tools|>" + json.dumps(tools, ensure_ascii=False))
    return count_tokens("\n".join(parts))


# ---------------------------------------------------------------------------
# 成本估算：DeepSeek 官方定价（人民币 / 百万 tokens），可用环境变量覆盖
# 默认按 deepseek-chat(V3) 定价：命中 ¥0.2/M、未命中 ¥2/M；输出按 ¥3/M
# ---------------------------------------------------------------------------
_CACHE_HIT_PER_M = float(os.environ.get("DS_COST_CACHE_HIT_PER_M", "0.2"))
_CACHE_MISS_PER_M = float(os.environ.get("DS_COST_CACHE_MISS_PER_M", "2.0"))
_OUTPUT_PER_M = float(os.environ.get("DS_COST_OUTPUT_PER_M", "3.0"))


def estimate_input_cost(hit: int, miss: int) -> float:
    """估算输入 token 成本（元）：命中部分按低价、未命中部分按全价。"""
    return (hit * _CACHE_HIT_PER_M + miss * _CACHE_MISS_PER_M) / 1_000_000


def estimate_output_cost(tokens: int) -> float:
    """估算输出 token 成本（元）。"""
    return tokens * _OUTPUT_PER_M / 1_000_000


def pricing() -> dict:
    """返回当前定价配置（元/百万 tokens），供前端展示说明。"""
    return {"hit": _CACHE_HIT_PER_M, "miss": _CACHE_MISS_PER_M, "output": _OUTPUT_PER_M}
