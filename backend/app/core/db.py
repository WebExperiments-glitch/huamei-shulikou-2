import json
import sqlite3
import threading
from pathlib import Path

from . import config

# 线程级只读连接复用：每个线程复用同一只读连接，避免每请求新建连接
# （高频 API 下省去频繁 open/close）。连接仅本线程使用，check_same_thread 安全。
_ro_local = threading.local()


def connect(path) -> sqlite3.Connection:
    resolved = Path(path).resolve()
    cache = getattr(_ro_local, "ro_conns", None)
    if cache is None:
        cache = {}
        _ro_local.ro_conns = cache
    key = str(resolved)
    conn = cache.get(key)
    if conn is None:
        uri = resolved.as_uri() + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        cache[key] = conn
    return conn


def connect_write(path) -> sqlite3.Connection:
    """可写连接（connect() 是只读 mode=ro）。用于需要写入的库（如 agent 会话）。"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    return conn


def connect_source() -> sqlite3.Connection:
    return connect(config.SOURCE_DB)


def connect_daily() -> sqlite3.Connection:
    config.ensure_dirs()
    return connect(config.DAILY_DB)


def connect_monthly() -> sqlite3.Connection:
    config.ensure_dirs()
    return connect(config.MONTHLY_DB)


def fetch_all(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def fetch_one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> dict | None:
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row else None


def parse_json_list(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []