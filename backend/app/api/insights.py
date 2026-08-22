"""数据预警与洞察中心 API。"""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..core import db
from ..core.cache import cached
from ..services import insights as insights_svc

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/overview")
@cached(ttl=180)
def overview():
    """洞察中心聚合：新鲜度 + KPI + 里程碑冲刺 + 新曲首秀 + 排名突进。"""
    conn = db.connect_source()
    try:
        return insights_svc.overview(conn)
    finally:
        conn.close()


@router.get("/milestones")
@cached(ttl=180)
def milestones(
    tier: str | None = Query(None, description="myth/legend/hall，缺省返回全部"),
    limit: int = Query(10, ge=1, le=50),
):
    conn = db.connect_source()
    try:
        return {"items": insights_svc.milestones(conn, tier=tier, limit=limit)}
    finally:
        conn.close()


@router.get("/newcomers")
@cached(ttl=180)
def newcomers(limit: int = Query(20, ge=1, le=100)):
    conn = db.connect_source()
    try:
        return insights_svc.newcomers(conn, limit=limit)
    finally:
        conn.close()


@router.get("/surges")
@cached(ttl=180)
def surges(limit: int = Query(20, ge=1, le=100)):
    conn = db.connect_source()
    try:
        return insights_svc.surges(conn, limit=limit)
    finally:
        conn.close()
