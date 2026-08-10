"""轻量、线程安全的内存 TTL 缓存。

用于「数据为静态」的只读接口（官方周榜/传说榜/年榜、统计、收录池等），
显著降低 SQLite 每次请求新建连接 + 重复查询的开销。

设计要点：
- 默认 TTL 由装饰器/调用处指定；命中则直接返回深拷贝的结果，避免调用方误改缓存。
- 不缓存异常（HTTPException 等会正常抛出、不入缓存）。
- 不会缓存 hot / sync / translate / ai 等动态或写接口（那些接口不要加 @cached）。
- 进程内单例 `_STORE`；提供 clear_cache() 供运维/测试使用。
"""
from __future__ import annotations

import copy
import functools
import hashlib
import json
import logging
import threading
import time
from typing import Any, Callable

logger = logging.getLogger("cache")

_STORE: dict[str, tuple[float, Any]] = {}
_LOCK = threading.RLock()


def _make_key(func: Callable, args: tuple, kwargs: dict) -> str:
    raw = func.__qualname__ + "|" + json.dumps(args, sort_keys=True, default=str)
    raw += "|" + json.dumps(kwargs, sort_keys=True, default=str)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def cached(ttl: int = 300) -> Callable:
    """装饰器：对返回可 JSON 序列化结果的函数做 TTL 缓存。

    ttl 单位秒；ttl<=0 表示不缓存（直接放行，便于开关）。
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if ttl <= 0:
                return func(*args, **kwargs)
            key = _make_key(func, args, kwargs)
            with _LOCK:
                item = _STORE.get(key)
                if item is not None:
                    exp, val = item
                    if exp > time.time():
                        return copy.deepcopy(val)
                    del _STORE[key]
            result = func(*args, **kwargs)
            with _LOCK:
                _STORE[key] = (time.time() + ttl, copy.deepcopy(result))
            return result

        wrapper.__cache_ttl__ = ttl  # 便于调试
        return wrapper

    return decorator


def cache_get_json(key: str) -> tuple[bool, Any]:
    """按显式字符串 key 取缓存（用于流式 / 非参数化场景）。返回 (命中, 值)。"""
    with _LOCK:
        item = _STORE.get(key)
        if item is not None:
            exp, val = item
            if exp > time.time():
                return True, copy.deepcopy(val)
            del _STORE[key]
    return False, None


def cache_put_json(key: str, val: Any, ttl: int) -> None:
    """按显式字符串 key 存缓存（ttl 单位秒）。"""
    with _LOCK:
        _STORE[key] = (time.time() + ttl, copy.deepcopy(val))


def clear_cache() -> int:
    """清空全部缓存，返回清除的条目数。"""
    with _LOCK:
        n = len(_STORE)
        _STORE.clear()
    logger.info("cache cleared: %d entries", n)
    return n


def cache_size() -> int:
    with _LOCK:
        return len(_STORE)
