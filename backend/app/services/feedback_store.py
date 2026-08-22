"""消息反馈（Feedback）的本地 SQLite 侧车存储。

参考 dsh feedback 子系统：对单条智能体消息做 👍/👎 评价 + 可选备注，
以「侧车（sidecar）」方式独立存放——不写入会话正文，避免破坏会话消息的
字节级稳定性（KV 缓存前缀稳定），同时便于后续按 client / 评分聚合分析，
反哺提示词质量。

表结构 agent_feedback：
  - client_id + conv_id + msg_idx 定位到某条消息（与前端消息数组下标一致）
  - rating: up / down
  - note: 用户备注（可空）
  - created_at / updated_at: 毫秒时间戳
"""
from __future__ import annotations

import time
from contextlib import contextmanager

from app.core import config, db


@contextmanager
def _conn():
    """可写连接上下文：正常退出提交、任何情况关闭（同 conv_store）。"""
    conn = db.connect_write(config.AGENT_DB)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_feedback (
                client_id  TEXT NOT NULL,
                conv_id    TEXT NOT NULL,
                msg_idx    INTEGER NOT NULL,
                rating     TEXT NOT NULL,
                note       TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (client_id, conv_id, msg_idx)
            )
            """
        )


def upsert(client_id: str, conv_id: str, msg_idx: int, rating: str, note: str | None = None) -> dict:
    """写入/覆盖一条反馈。返回该条反馈视图。"""
    if rating not in ("up", "down"):
        raise ValueError("rating 必须为 up 或 down")
    now = int(time.time() * 1000)
    note = (note or "").strip() or None
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO agent_feedback (client_id, conv_id, msg_idx, rating, note, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(client_id, conv_id, msg_idx) DO UPDATE SET
                rating=excluded.rating, note=excluded.note, updated_at=excluded.updated_at
            """,
            (client_id, conv_id, int(msg_idx), rating, note, now, now),
        )
    return view(client_id, conv_id, msg_idx)


def get(client_id: str, conv_id: str, msg_idx: int) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM agent_feedback WHERE client_id=? AND conv_id=? AND msg_idx=?",
            (client_id, conv_id, int(msg_idx)),
        ).fetchone()
    return dict(row) if row else None


def delete(client_id: str, conv_id: str, msg_idx: int) -> bool:
    with _conn() as conn:
        cur = conn.execute(
            "DELETE FROM agent_feedback WHERE client_id=? AND conv_id=? AND msg_idx=?",
            (client_id, conv_id, int(msg_idx)),
        )
        return cur.rowcount > 0


def list_for_conv(client_id: str, conv_id: str) -> list[dict]:
    """某会话的全部反馈（按消息下标升序），用于前端恢复按钮状态。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM agent_feedback WHERE client_id=? AND conv_id=? ORDER BY msg_idx ASC",
            (client_id, conv_id),
        ).fetchall()
    return [dict(r) for r in rows]


def list_all(client_id: str, limit: int = 200) -> list[dict]:
    """该 client 的反馈汇总（倒序），供「查看我的反馈」/后续聚合分析。"""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM agent_feedback WHERE client_id=? ORDER BY updated_at DESC LIMIT ?",
            (client_id, max(1, min(limit, 500))),
        ).fetchall()
    return [dict(r) for r in rows]


def view(client_id: str, conv_id: str, msg_idx: int) -> dict:
    fb = get(client_id, conv_id, msg_idx)
    if fb is None:
        raise KeyError("反馈不存在")
    return fb
