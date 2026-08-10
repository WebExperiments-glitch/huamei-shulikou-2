from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services import translate as tr_svc

router = APIRouter(prefix="/api/translate", tags=["translate"])


@router.get("")
def translate(
    bvid: str,
    title: str = "",
    target: str = Query("en", pattern="^(en|zh)$"),
):
    """单曲译名：target=en 生成/取英文译名，target=zh 补全中文译名（机翻）。结果落库缓存。"""
    if not bvid:
        raise HTTPException(400, "bvid 不能为空")
    conn = tr_svc.connect_translate()
    try:
        return tr_svc.get_or_translate(conn, bvid, title, target)
    finally:
        conn.close()
