from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services import crawler, rank

router = APIRouter(prefix="/api/hot", tags=["hot"])


@router.get("/status")
def status():
    return crawler.get_status()


@router.post("/refresh")
def refresh(
    scope: str = Query("recent", description="recent=最近榜单 / all=全量收录池"),
    recent_n: int = Query(10, ge=1, le=30),
):
    if scope not in ("recent", "all"):
        raise HTTPException(400, "scope 仅支持 recent / all")
    ok = crawler.start_refresh(scope, recent_n)
    if not ok:
        raise HTTPException(409, "已有爬取任务在运行")
    return {"started": True, "scope": scope, "recent_n": recent_n}


@router.get("/songs")
def songs(
    sort: str = Query("score", description="score/view/favorite/coin/like/share/pubtime"),
    q: str = Query("", description="标题 / 中文名 / UP主 / BV号（支持 B站链接，自动提取 BV）"),
    tier: str = Query("", description="空=全部 / myth(神话) / legend(传说) / hall(殿堂)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return crawler.get_rankings(sort, q, tier or None, limit, offset)


@router.get("/momentum")
def momentum(
    metric: str = Query("view", description="view/favorite/coin/like/share/score（按对应增量排序，score=涨速综合分）"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """涨速榜：对比最近两次快照，给出各曲增量与涨速综合分，按选定维度排序。"""
    return crawler.get_momentum(metric, limit, offset)


@router.get("/think/search")
def think_search(q: str = Query("", description="中文名 / 标题 / UP主 / BV号 / B站链接")):
    """术曲思考：按关键词解析候选曲（支持中文名、BV、B站链接）。"""
    return {"items": crawler.think_search(q)}


@router.get("/think/detail")
def think_detail(bvid: str = Query(..., description="BV号，如 BV1H7GN6JEHQ")):
    """术曲思考：抓取单曲实时详情（播放/点赞/投币/收藏/评论/弹幕 + 元数据）。"""
    d = crawler.think_detail(bvid)
    if d is None:
        raise HTTPException(404, "未找到该 BV：可能已被删除、风控拦截或格式有误")
    return d


@router.get("/snapshots")
def snapshots(limit: int = Query(50, ge=1, le=200)):
    """快照列表：每次爬取任务完成自动落一份全量快照。"""
    return {"items": rank.list_snapshots(limit)}
