"""Agent 会话持久化接口（服务端备份）。

- GET  /api/conversations?client_id=xxx   列出该 client 的全部会话
- POST /api/conversations                  批量 upsert（body: {client_id, conversations:[...]}）
- DELETE /api/conversations/{conv_id}?client_id=xxx  删除单个会话

按匿名 client_id 隔离，无账号体系。前端在读写后调用这些接口做后端备份。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import conv_store

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class ConvItem(BaseModel):
    id: str
    title: str = "新对话"
    pinned: bool = False
    messages: list = []
    createdAt: int = 0
    updatedAt: int = 0


class UpsertReq(BaseModel):
    client_id: str
    conversations: list[ConvItem] = []


@router.get("")
def list_conv(client_id: str = ""):
    if not client_id:
        raise HTTPException(status_code=400, detail="缺少 client_id")
    return {"conversations": conv_store.list_conversations(client_id)}


@router.post("")
def upsert_conv(req: UpsertReq):
    if not req.client_id:
        raise HTTPException(status_code=400, detail="缺少 client_id")
    for c in req.conversations:
        conv_store.upsert(req.client_id, c.model_dump())
    return {"ok": True, "count": len(req.conversations)}


@router.delete("/{conv_id}")
def delete_conv(conv_id: str, client_id: str = ""):
    if not client_id:
        raise HTTPException(status_code=400, detail="缺少 client_id")
    conv_store.delete(client_id, conv_id)
    return {"ok": True}
