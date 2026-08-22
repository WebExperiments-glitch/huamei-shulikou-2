"""进程级运行时指标（轻量、无外部依赖）。

记录自进程启动以来的请求数、累计耗时、错误数与慢请求，供
`/api/system/stats` 等管理端点与 AI 的 get_system_overview 工具使用。
全部经线程锁保护，可安全地被并发请求更新。
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict

_lock = threading.Lock()
_started_at = time.time()

_counts = {"total": 0, "errors": 0, "4xx": 0, "5xx": 0}
_total_ms = 0.0
_by_path: dict[str, dict] = defaultdict(lambda: {"hits": 0, "total_ms": 0.0, "errors": 0})
_slow: list[tuple[str, float, int]] = []  # (path, ms, status)，滚动保留最近慢请求


def record(method: str, path: str, status: int, ms: float) -> None:
    """由访问日志中间件在每次请求结束时调用。"""
    global _total_ms
    with _lock:
        _counts["total"] += 1
        _total_ms += ms
        if status >= 500:
            _counts["5xx"] += 1
            _counts["errors"] += 1
        elif status >= 400:
            _counts["4xx"] += 1
        key = f"{method} {path}"
        _by_path[key]["hits"] += 1
        _by_path[key]["total_ms"] += ms
        if status >= 500:
            _by_path[key]["errors"] += 1
        if ms >= 1000:
            _slow.append((key, round(ms, 1), status))
            if len(_slow) > 30:
                _slow.pop(0)


def uptime() -> float:
    return time.time() - _started_at


def snapshot() -> dict:
    """汇总当前指标快照（已排序、含统计口径）。"""
    with _lock:
        total = _counts["total"]
        avg_ms = round(_total_ms / total, 1) if total else 0.0
        top = sorted(
            _by_path.items(), key=lambda kv: kv[1]["total_ms"], reverse=True
        )[:15]
        return {
            "uptime_s": round(uptime(), 1),
            "started_at": _started_at,
            "requests": dict(_counts),
            "avg_ms": avg_ms,
            "slow_count": len(_slow),
            "slow_recent": list(reversed(_slow)),
            "top_by_time": [
                {"route": k, **v, "avg_ms": round(v["total_ms"] / v["hits"], 1) if v["hits"] else 0}
                for k, v in top
            ],
        }
