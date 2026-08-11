from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

from ..core import db
from ..services import boards as boards_svc
from ..services import songs as songs_svc

router = APIRouter(prefix="/api/songs", tags=["songs"])


@router.get("/search")
def search_songs(
    q: str = Query("", description="标题/中文名/bvid 关键词"),
    producer: str | None = None,
    vocalist: str | None = None,
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    sort: str = Query("id", description="id|pubtime|weeks|best_rank|view|favorite|coin|like|score"),
    order: str = Query("desc", description="asc|desc"),
    board: str | None = Query(None, description="weekly|legend|annual 上榜筛选"),
    min_weeks: int = Query(0, ge=0, description="上榜周数下限"),
    tier: str | None = Query(None, description="hall|legend|myth|has|none 里程碑筛选"),
    min_view: int | None = Query(None, ge=0, description="播放量下限"),
    max_view: int | None = Query(None, ge=0, description="播放量上限"),
    pub_from: int | None = Query(None, description="投稿时间下限（unix 秒）"),
    pub_to: int | None = Query(None, description="投稿时间上限（unix 秒）"),
):
    conn = db.connect_source()
    try:
        return songs_svc.search_songs(
            conn,
            q=q,
            producer=producer,
            vocalist=vocalist,
            limit=limit,
            offset=offset,
            sort=sort,
            order=order,
            board=board,
            min_weeks=min_weeks,
            tier=tier,
            min_view=min_view,
            max_view=max_view,
            pub_from=pub_from,
            pub_to=pub_to,
        )
    finally:
        conn.close()


@router.get("/facets")
def song_facets():
    """歌曲库筛选面：tier 分布与指标覆盖情况。"""
    conn = db.connect_source()
    try:
        return songs_svc.get_facets(conn)
    finally:
        conn.close()


@router.get("/suggest")
def song_suggest(q: str = Query("", description="曲名/bvid 关键词"), limit: int = Query(8, ge=1, le=20)):
    """曲名/bvid 输入联想（轻量，前缀优先）。"""
    conn = db.connect_source()
    try:
        return {"items": songs_svc.suggest(conn, q, limit)}
    finally:
        conn.close()


@router.get("/suggest-names")
def name_suggest(
    role: str = Query("producers", description="producers|vocalists"),
    q: str = Query("", description="名称关键词"),
    limit: int = Query(8, ge=1, le=20),
):
    """P主/歌姬名称输入联想（带参与歌曲数，前缀优先）。"""
    conn = db.connect_source()
    try:
        return {"items": songs_svc.suggest_names(conn, role, q, limit)}
    finally:
        conn.close()


@router.get("/{bvid}")
def get_song(bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$")):
    conn = db.connect_source()
    try:
        song = songs_svc.get_song(conn, bvid)
        if not song:
            raise HTTPException(404, "未找到该歌曲")
        return song
    finally:
        conn.close()


@router.get("/{bvid}/all-history")
def all_history(bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$")):
    """单曲在周榜/传说榜/年榜的全部上榜历史。"""
    conn = db.connect_source()
    try:
        song = songs_svc.get_song(conn, bvid)
        if not song:
            raise HTTPException(404, "未找到该歌曲")
        histories = {}
        for bt in ("weekly", "legend", "annual"):
            h = boards_svc.get_song_history(conn, bt, bvid)
            if h:
                histories[bt] = h
        return {"song": song, "histories": histories}
    finally:
        conn.close()


@router.get("/{bvid}/score-breakdown")
def score_breakdown(
    bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$"),
    board: str = Query("weekly", description="weekly|legend|annual 拆解所用榜单"),
):
    """单曲得分因子拆解（公式透明 / 构成参考）。"""
    conn = db.connect_source()
    try:
        song = songs_svc.get_song(conn, bvid)
        if not song:
            raise HTTPException(404, "未找到该歌曲")
        return songs_svc.score_breakdown(conn, bvid, board_type=board)
    finally:
        conn.close()


@router.get("/{bvid}/formula-compare")
def formula_compare(
    bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$"),
    board: str = Query("weekly", description="weekly|legend|annual 对比所用榜单"),
):
    """单曲在新/旧两代公式下的得分对比（公式可视化实验室）。"""
    conn = db.connect_source()
    try:
        song = songs_svc.get_song(conn, bvid)
        if not song:
            raise HTTPException(404, "未找到该歌曲")
        return songs_svc.formula_compare(conn, bvid, board_type=board)
    finally:
        conn.close()
