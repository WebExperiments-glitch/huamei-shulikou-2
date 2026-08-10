from __future__ import annotations

from fastapi import APIRouter, Query

from ..core import db
from ..core.cache import cached
from ..services import songs as songs_svc

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/artists")
@cached(ttl=120)
def artist_rankings(
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    min_songs: int = Query(1, ge=1),
):
    conn = db.connect_source()
    try:
        res = songs_svc.artist_stats(conn, limit, offset, min_songs)
        return {"kind": "artist", "total": res["total"], "items": res["items"]}
    finally:
        conn.close()


@router.get("/vocalists")
@cached(ttl=120)
def vocalist_rankings(
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    conn = db.connect_source()
    try:
        res = songs_svc.vocalist_stats(conn, limit, offset)
        return {"kind": "vocalist", "total": res["total"], "items": res["items"]}
    finally:
        conn.close()