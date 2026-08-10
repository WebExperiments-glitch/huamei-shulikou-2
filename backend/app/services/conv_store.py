"""Agent 会话的本地 SQLite 持久化（服务端备份）。

设计：按匿名 client_id 隔离（前端生成的设备标识，存 localStorage）。
不引入账号体系——这是「保存到本地（后端）」方案，对话存到后端 SQLite，
不怕清浏览器缓存、可服务端备份与迁移；换设备需导出/导入或共享 client_id 才同步。
"""
from __future__ import annotations

import json
import time

from app.core import config, db


def _conn():
    return db.connect_write(config.AGENT_DB)


def init() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_conversations (
                client_id  TEXT NOT NULL,
                conv_id    TEXT NOT NULL,
                title      TEXT NOT NULL,
                pinned     INTEGER NOT NULL DEFAULT 0,
                messages   TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (client_id, conv_id)
            )
            """
        )


def list_conversations(client_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT conv_id, title, pinned, messages, created_at, updated_at "
            "FROM agent_conversations WHERE client_id=? ORDER BY updated_at DESC",
            (client_id,),
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["conv_id"],
                "title": r["title"],
                "pinned": bool(r["pinned"]),
                "messages": db.parse_json_list(r["messages"]),
                "createdAt": r["created_at"],
                "updatedAt": r["updated_at"],
            }
        )
    return out


def upsert(client_id: str, conv: dict) -> None:
    now = int(time.time() * 1000)
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO agent_conversations
                (client_id, conv_id, title, pinned, messages, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(client_id, conv_id) DO UPDATE SET
                title=excluded.title,
                pinned=excluded.pinned,
                messages=excluded.messages,
                updated_at=excluded.updated_at
            """,
            (
                client_id,
                conv.get("id"),
                conv.get("title") or "新对话",
                int(bool(conv.get("pinned"))),
                json.dumps(conv.get("messages", []), ensure_ascii=False),
                int(conv.get("createdAt") or now),
                int(conv.get("updatedAt") or now),
            ),
        )


def delete(client_id: str, conv_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            "DELETE FROM agent_conversations WHERE client_id=? AND conv_id=?",
            (client_id, conv_id),
        )
