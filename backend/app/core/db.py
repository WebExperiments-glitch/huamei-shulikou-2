import json
import sqlite3
import threading
from pathlib import Path

from . import config

# 线程级只读连接复用：每个线程复用同一只读连接，避免每请求新建连接
# （高频 API 下省去频繁 open/close）。连接仅本线程使用，check_same_thread 安全。
#
# ⚠️ 关键修正：API 层普遍在请求结束时调用 conn.close()（见 api/*.py 各 finally）。
# 若直接复用裸 sqlite3.Connection，close 之后同线程再次 connect() 会拿到「已关闭的
# 连接」→ "Cannot operate on a closed database" (500)。故用 _ROConn 包装：close() 改为
# no-op，底层真实连接跨请求保持打开、可安全复用。
_ro_local = threading.local()


class _ROConn:
    """只读连接包装：复用底层连接，抑制 close() 以免破坏线程级复用。"""

    __slots__ = ("_real",)

    def __init__(self, real: sqlite3.Connection):
        object.__setattr__(self, "_real", real)

    def close(self):  # 复用型连接不真正关闭，由进程退出时 OS 回收
        return None

    def __getattr__(self, name):
        return getattr(object.__getattribute__(self, "_real"), name)

    def __setattr__(self, name, value):
        setattr(object.__getattribute__(self, "_real"), name, value)

    def __enter__(self):
        return self  # with 进入返回代理自身，避免拿到裸连接被关闭

    def __exit__(self, *exc):
        return None  # 复用连接不在 with 退出时关闭

    def __repr__(self):
        return f"<_ROConn {object.__getattribute__(self, '_real')!r}>"


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
        real = sqlite3.connect(uri, uri=True)
        real.row_factory = sqlite3.Row
        conn = _ROConn(real)
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