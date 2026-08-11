from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..core import db
from ..core.cache import cached
from ..services import boards as boards_svc
from ..services import predict as predict_svc

router = APIRouter(prefix="/api/predict", tags=["predict"])


@router.get("/next-week")
def next_week(
    baseline: str = Query("auto", description="基线快照：auto / prev / 具体 snapshot id"),
    decay: float = Query(1.0, ge=0.3, le=1.5, description="热度衰减系数（1.0 为默认模型）"),
    limit: int = Query(60, ge=1, le=300),
    board: str = Query("weekly", description="榜种，目前仅周榜有稳定入榜线"),
):
    """下期冲榜预测：基于快照增量外推 7 日，套用现行公式并与历史入榜线比较。"""
    if board not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        return predict_svc.next_week(
            conn, baseline=baseline, decay_k=decay, limit=limit, board_type=board
        )
    finally:
        conn.close()


@router.get("/cutlines")
@cached(ttl=300)
def cutlines(
    board: str = Query("weekly"),
    lookback: int = Query(12, ge=2, le=40),
):
    """历史入榜线（各期末位得分），供前端画门槛趋势。"""
    if board not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        return predict_svc.cutlines(conn, board, lookback)
    finally:
        conn.close()
