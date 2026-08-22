"""消息反馈接口（Feedback，参考 dsh feedback 子系统）。

- GET    /api/feedback?client_id=xxx&conv_id=xxx  列出会话的全部反馈
- POST   /api/feedback                             提交/更新一条反馈（body: client_id, conv_id, msg_idx, rating, note?）
- DELETE /api/feedback?client_id=xxx&conv_id=xxx&msg_idx=N  删除一条反馈
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import feedback_store

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackReq(BaseModel):
    client_id: str
    conv_id: str
    msg_idx: int
    rating: str  # "up" | "down"
    note: str | None = None


@router.get("")
def list_feedback(client_id: str = "", conv_id: str = ""):
    if not client_id or not conv_id:
        raise HTTPException(status_code=400, detail="缺少 client_id 或 conv_id")
    return {"feedback": feedback_store.list_for_conv(client_id, conv_id)}


@router.post("")
def submit_feedback(req: FeedbackReq):
    if not req.client_id or not req.conv_id:
        raise HTTPException(status_code=400, detail="缺少 client_id 或 conv_id")
    if req.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating 必须为 up 或 down")
    try:
        fb = feedback_store.upsert(req.client_id, req.conv_id, req.msg_idx, req.rating, req.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"feedback": fb}


@router.delete("")
def delete_feedback(client_id: str = "", conv_id: str = "", msg_idx: int = 0):
    if not client_id or not conv_id:
        raise HTTPException(status_code=400, detail="缺少 client_id 或 conv_id")
    ok = feedback_store.delete(client_id, conv_id, msg_idx)
    if not ok:
        raise HTTPException(status_code=404, detail="反馈不存在")
    return {"ok": True}