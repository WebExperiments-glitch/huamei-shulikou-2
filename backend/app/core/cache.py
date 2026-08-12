"""进程级持久化 TTL 缓存，后端为 SQLite（data/cache.sqlite）。

替代原进程内内存 dict，使缓存：
- **重启不丢**（落盘到 cache.sqlite）；
- 按 TTL 自动过期；
- 可后台查询 / 清理（prune_expired / clear_cache / 管理端点）。

设计要点：
- 表 `cache_entries(key TEXT PK, value TEXT(JSON), exp REAL, created REAL)`。
- 所有访问经单一连接 + RLock 串行化（sqlite3 连接非线程安全）。
- 命中返回 deepcopy，避免调用方误改缓存。
- 不缓存异常（HTTPException 等会正常抛出、不入缓存）。
- 不会缓存 hot / sync / translate / ai 等动态或写接口（那些接口不要加 @cached）。
- AI 流式用 cache_get_json / cache_put_json 显式 key。
"""
from __future__ import annotations

import copy
import functools
import hashlib
import json
import logging
import sqlite3
import threading
import time
from typing import Any, Callable

from . import config

logger = logging.getLogger("cache")

_LOCK = threading.RLock()
_CONN: "sqlite3.Connection | None" = None
_PRUNE_MOD = 0  # 简单计数器，周期性清理过期行

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cache_entries(
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL,
    exp     REAL NOT NULL,
    created REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_exp ON cache_entries(exp);
"""


def _conn() -> sqlite3.Connection:
    """懒加载单例连接（线程安全由调用方持 _LOCK 保证）。"""
    global _CONN
    if _CONN is None:
        p = config.CACHE_DB
        p.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(p), check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.executescript(_SCHEMA)
        try:
            c.execute("PRAGMA journal_mode=WAL")
        except sqlite3.Error:
            pass
        c.commit()
        _CONN = c
    return _CONN


def _make_key(func: Callable, args: tuple, kwargs: dict) -> str:
    raw = func.__qualname__ + "|" + json.dumps(args, sort_keys=True, default=str)
    raw += "|" + json.dumps(kwargs, sort_keys=True, default=str)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _get(key: str) -> Any | None:
    with _LOCK:
        c = _conn()
        row = c.execute(
            "SELECT value, exp FROM cache_entries WHERE key=?", (key,)
        ).fetchone()
        if row is None:
            return None
        if row["exp"] and row["exp"] <= time.time():
            c.execute("DELETE FROM cache_entries WHERE key=?", (key,))
            c.commit()
            return None
        try:
            return json.loads(row["value"])
        except (json.JSONDecodeError, TypeError):
            c.execute("DELETE FROM cache_entries WHERE key=?", (key,))
            c.commit()
            return None


def _put(key: str, val: Any, ttl: int) -> None:
    global _PRUNE_MOD
    blob = json.dumps(val, ensure_ascii=False)
    exp = time.time() + max(ttl, 1)
    with _LOCK:
        c = _conn()
        c.execute(
            "INSERT INTO cache_entries(key, value, exp, created) VALUES(?,?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
            "exp=excluded.exp, created=excluded.created",
            (key, blob, exp, time.time()),
        )
        c.commit()
        # 每 64 次写入顺手清理一次过期行，防止表无限膨胀
        _PRUNE_MOD = (_PRUNE_MOD + 1) % 64
        if _PRUNE_MOD == 0:
            c.execute("DELETE FROM cache_entries WHERE exp <= ?", (time.time(),))
            c.commit()


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
            cached_val = _get(key)
            if cached_val is not None:
                return copy.deepcopy(cached_val)
            result = func(*args, **kwargs)
            try:
                _put(key, result, ttl)
            except Exception as e:  # 缓存失败不应影响主流程
                logger.warning("cache put failed (%s): %s", key[:16], e)
            return result

        wrapper.__cache_ttl__ = ttl  # 便于调试
        return wrapper

    return decorator


def cache_get_json(key: str) -> tuple[bool, Any]:
    """按显式字符串 key 取缓存（用于流式 / 非参数化场景）。返回 (命中, 值)。"""
    v = _get(key)
    if v is None:
        return False, None
    return True, copy.deepcopy(v)


def cache_put_json(key: str, val: Any, ttl: int) -> None:
    """按显式字符串 key 存缓存（ttl 单位秒）。"""
    try:
        _put(key, val, ttl)
    except Exception as e:
        logger.warning("cache put failed (%s): %s", key[:16], e)


def clear_cache() -> int:
    """清空全部缓存，返回清除的条目数。"""
    with _LOCK:
        c = _conn()
        n = c.execute("SELECT COUNT(*) AS n FROM cache_entries").fetchone()["n"]
        c.execute("DELETE FROM cache_entries")
        c.commit()
    logger.info("cache cleared: %d entries", n)
    return n


def cache_clear_prefix(prefix: str) -> int:
    """删除 key 以指定前缀开头的缓存条目（如 "songs:"），返回删除数量。"""
    with _LOCK:
        c = _conn()
        n = c.execute(
            "SELECT COUNT(*) AS n FROM cache_entries WHERE key LIKE ?", (prefix + "%",)
        ).fetchone()["n"]
        c.execute("DELETE FROM cache_entries WHERE key LIKE ?", (prefix + "%",))
        c.commit()
    logger.info("cache cleared prefix=%s: %d entries", prefix, n)
    return n


def cache_size() -> int:
    with _LOCK:
        c = _conn()
        return c.execute("SELECT COUNT(*) AS n FROM cache_entries").fetchone()["n"]


def prune_expired() -> int:
    """删除所有已过期条目，返回删除数量。"""
    with _LOCK:
        c = _conn()
        n = c.execute(
            "SELECT COUNT(*) AS n FROM cache_entries WHERE exp <= ?", (time.time(),)
        ).fetchone()["n"]
        c.execute("DELETE FROM cache_entries WHERE exp <= ?", (time.time(),))
        c.commit()
    return n


def cache_stats() -> dict:
    """返回缓存概况，供管理端点使用。"""
    with _LOCK:
        c = _conn()
        total = c.execute("SELECT COUNT(*) AS n FROM cache_entries").fetchone()["n"]
        expired = c.execute(
            "SELECT COUNT(*) AS n FROM cache_entries WHERE exp <= ?", (time.time(),)
        ).fetchone()["n"]
        sample = c.execute(
            "SELECT key, exp FROM cache_entries ORDER BY created DESC LIMIT 10"
        ).fetchall()
    return {
        "total": total,
        "expired": expired,
        "live": total - expired,
        "db": str(config.CACHE_DB),
        "sample_keys": [r["key"] for r in sample],
    }
