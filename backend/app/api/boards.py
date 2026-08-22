from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

from ..core import db
from ..core.cache import cached
from ..services import boards as boards_svc

router = APIRouter(prefix="/api", tags=["boards"])


@router.get("/boards")
@cached(ttl=300)
def list_boards():
    conn = db.connect_source()
    try:
        out = []
        for bt, label in boards_svc.BOARD_LABELS.items():
            issues = boards_svc.list_issues(conn, bt)
            out.append({
                "type": bt,
                "label": label,
                "issue_count": len(issues),
                "latest": issues[0] if issues else None,
                "range": {"start": issues[-1]["issue"] if issues else None,
                          "end": issues[0]["issue"] if issues else None},
            })
        return {"boards": out}
    finally:
        conn.close()


@router.get("/boards/{board_type}/issues")
@cached(ttl=300)
def list_board_issues(board_type: str):
    if board_type not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        return {"board_type": board_type, "issues": boards_svc.list_issues(conn, board_type)}
    finally:
        conn.close()


@router.get("/boards/{board_type}/issues/{issue}/rankings")
@cached(ttl=300)
def get_rankings(board_type: str, issue: str,
                 top: int = Query(100, ge=1, le=500),
                 offset: int = Query(0, ge=0)):
    if board_type not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        items = boards_svc.get_issue_rankings(conn, board_type, issue, top, offset)
        if not items:
            raise HTTPException(404, "该期不存在或无数据")
        # 官方排名/得分为主字段（rank/score），自算公式结果（self_rank/self_score）保留为对照。
        # 注意：不要再把 self_rank/self_score 覆盖到 rank/score，否则前端第一名会与官方互换。
        for d in items:
            d["official_rank"] = d.get("rank")
            d["official_score"] = d.get("score")
        return {
            "board_type": board_type,
            "issue": issue,
            "date": f"{issue[:4]}-{issue[4:6]}-{issue[6:]}",
            "items": items,
        }
    finally:
        conn.close()


@router.get("/boards/{board_type}/reentries")
@cached(ttl=600)
def reentries(board_type: str = "legend", top: int = Query(200, ge=1, le=1000)):
    """历史二次上榜追踪（默认传说曲周榜）。"""
    if board_type not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        return {
            "board_type": board_type,
            "items": boards_svc.get_reentry_tracks(conn, board_type, top),
        }
    finally:
        conn.close()


@router.get("/boards/{board_type}/song/{bvid}/history")
@cached(ttl=600)
def song_history(board_type: str, bvid: str = Path(..., pattern="^BV[0-9A-Za-z]+$")):
    if board_type not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        return {"board_type": board_type, "bvid": bvid,
                "history": boards_svc.get_song_history(conn, board_type, bvid)}
    finally:
        conn.close()


@router.get("/boards/{board_type}/issues/{issue}/sparklines")
@cached(ttl=300)
def issue_sparklines(board_type: str, issue: str,
                     count: int = Query(10, ge=1, le=30)):
    """批量返回某期内每首歌最近 count 期的排名序列，供前端表格行内 sparkline 使用。"""
    if board_type not in boards_svc.BOARD_LABELS:
        raise HTTPException(404, "未知榜单类型")
    conn = db.connect_source()
    try:
        data = boards_svc.get_issue_sparklines(conn, board_type, issue, count)
        return {"board_type": board_type, "issue": issue, "count": count, "sparklines": data}
    finally:
        conn.close()