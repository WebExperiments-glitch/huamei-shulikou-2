from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query, Body

from ..core import db
from ..services import boards as boards_svc
from ..services import songs as songs_svc
from ..services import rank as rank_svc

router = APIRouter(prefix="/api/songs", tags=["songs"])


@router.get("/search")
def search_songs(
    q: str = Query("", description="标题/中文名/bvid 关键词"),
    producer: str | None = None,
    vocalist: str | None = None,
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    sort: str = Query("pubtime", description="id|pubtime|weeks|best_rank|view|favorite|coin|like|score"),
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


@router.get("/search-bilibili")
def search_bilibili_api(
    q: str = Query("", description="曲名/关键词，用于在 B站 搜索定位 BV"),
    limit: int = Query(10, ge=1, le=20),
):
    """在 B站 搜索视频（WBI 签名），让「公式实验室」支持粘贴曲名定位 BV。

    必须声明在 /{bvid} 之前：否则会被该带正则的路由拦截（search-bilibili 不满足
    ^BV[0-9A-Za-z]+$）而返回 422。
    """
    if not q.strip():
        return {"items": []}
    items = songs_svc.search_bilibili(q.strip(), limit=limit)
    return {"items": items}


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


@router.get("/{bvid}/auto-score")
def auto_score(
    bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$"),
    board: str = Query("weekly", description="weekly|legend|annual 用于拆解的榜单"),
):
    """粘贴 BV/链接后的一键算分：自动取数 + 新旧公式拆解 + 最新一期汇总（公式实验室极简模式）。"""
    conn = db.connect_source()
    try:
        song = songs_svc.get_song(conn, bvid)
        if not song:
            raise HTTPException(404, "未找到该歌曲（可先尝试手动入库，或粘贴在榜视频链接）")
        cmp = songs_svc.formula_compare(conn, bvid, board_type=board)
        entries = cmp.get("entries", [])
        latest = entries[-1] if entries else None
        # 未上榜的歌曲：实时回源 B站 取当前统计（不入库、不依赖周榜），供「已自动抓到」展示
        live = None
        if latest is None:
            try:
                code, data = songs_svc._fetch_bili_view_subprocess(bvid)
                if code == "0" and data:
                    stat = data.get("stat") or {}
                    live = {
                        "title": data.get("title"),
                        "author": (data.get("owner") or {}).get("name"),
                        "pubtime": int(data.get("pubdate") or 0),
                        "view": int(stat.get("view") or 0),
                        "favorite": int(stat.get("favorite") or 0),
                        "like": int(stat.get("like") or 0),
                        "coin": int(stat.get("coin") or 0),
                        "share": int(stat.get("share") or 0),
                    }
            except Exception:
                live = None
        return {
            "bvid": bvid,
            "board_type": board,
            "on_board": latest is not None,
            "song": song,
            "latest": latest,
            "entries": entries,
            "live": live,
            "weights": dict(rank_svc.DEFAULT_WEIGHTS),
        }
    finally:
        conn.close()


@router.post("/ingest")
def ingest_song_api(payload: dict = Body(...)):
    """手动入库：提供 B站视频链接或 BV 号，从 B站抓取元数据写入收录池 songs_all。"""
    raw = (payload.get("url") or payload.get("bvid") or "").strip()
    bvid = songs_svc.resolve_bvid(raw)
    if not bvid:
        raise HTTPException(400, "请提供有效的 B站视频链接或 BV 号")
    try:
        result = songs_svc.ingest_song(bvid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not result.get("ok"):
        raise HTTPException(502, f"抓取 B站信息失败（{result.get('status')}），请确认视频存在且未被风控")
    return result["song"]
