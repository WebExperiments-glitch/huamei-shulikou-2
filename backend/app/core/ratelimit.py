"""极简内存滑动窗口限流器（按 key，通常为客户端 IP）。

用于保护重量级接口（本地大模型推理会拉起 GPU 子进程），
防止脚本/误用造成并发风暴或显存耗尽。进程内单例，重启即清空（本地工具足够）。
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, limit: int = 20, window: int = 60):
        self.limit = limit
        self.window = window
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            ts = self._hits[key]
            # 修剪窗口外的时间戳
            self._hits[key] = [t for t in ts if now - t < self.window]
            if len(self._hits[key]) >= self.limit:
                return False
            self._hits[key].append(now)
            return True

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


# AI 接口默认限流：每 IP 每分钟上限（可用环境变量 AI_RATE_PER_MIN 覆盖）
_ai_limit = int(os.environ.get("AI_RATE_PER_MIN", "20"))
ai_limiter = RateLimiter(limit=_ai_limit, window=60)
