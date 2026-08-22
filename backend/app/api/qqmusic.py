"""QQ 音乐 API 路由（免登录 / 免绿钻试听）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.services import qqmusic
from app.core.ratelimit import RateLimiter

router = APIRouter(prefix="/api/qqmusic", tags=["qqmusic"])

# QQ 音乐是第三方出站服务，限流避免触发其风控导致 IP 被封
qqmusic_limiter = RateLimiter(limit=30, window=60)


def _rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    if not qqmusic_limiter.allow(ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试（QQ 音乐限流）")


class SearchReq(BaseModel):
    keyword: str
    limit: int = 20


class UrlReq(BaseModel):
    id: str
    mid: str | None = None


@router.post("/search", dependencies=[Depends(_rate_limit)])
def search(req: SearchReq):
    if not req.keyword or not req.keyword.strip():
        raise HTTPException(status_code=400, detail="keyword 不能为空")
    try:
        return qqmusic.search(req.keyword.strip(), req.limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"QQ 音乐请求失败：{exc}")


@router.post("/url", dependencies=[Depends(_rate_limit)])
def song_url(req: UrlReq):
    """获取单曲播放直链（免费歌曲免绿钻可播，绿钻专属返回 404 提示）。"""
    try:
        detail = qqmusic.get_song_url(req.id, req.mid)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"QQ 音乐请求失败：{exc}")
    if not detail.get("url"):
        raise HTTPException(status_code=404, detail="该歌曲为绿钻专属或已下架，需会员才能播放")
    return detail
