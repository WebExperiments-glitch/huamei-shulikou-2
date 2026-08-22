"""网易云音乐 API 路由。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import netease
from app.core.ratelimit import RateLimiter

router = APIRouter(prefix="/api/netease", tags=["netease"])

# 网易云是第三方出站服务，无论本地/云端 AI 模式都应限流，
# 避免触发其风控导致 IP 被封，同时保护本机出站带宽。
netease_limiter = RateLimiter(limit=30, window=60)


def _rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    if not netease_limiter.allow(ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试（网易云限流）")


class SearchReq(BaseModel):
    keyword: str
    type: str = "song"
    limit: int = 20


class SongReq(BaseModel):
    id: int | str


class CookieReq(BaseModel):
    """完整 Cookie 串（含 MUSIC_U=...; NMTID=... 等，从 Network 面板复制）。"""
    music_u: str = ""


@router.get("/cookie")
def get_cookie():
    """读取网易云 Cookie 配置状态（本机应用，回填到设置面板）。"""
    return netease.get_cookie_status()


@router.put("/cookie", dependencies=[Depends(_rate_limit)])
def put_cookie(req: CookieReq):
    """保存/清除网易云 Cookie（MUSIC_U 段）。传空串即清除。"""
    netease.save_cookie(req.music_u)
    return netease.get_cookie_status()


@router.post("/search", dependencies=[Depends(_rate_limit)])
def search(req: SearchReq):
    if not req.keyword or not req.keyword.strip():
        raise HTTPException(status_code=400, detail="keyword 不能为空")
    return netease.search(req.keyword.strip(), req.type, req.limit)


@router.post("/song", dependencies=[Depends(_rate_limit)])
def song(req: SongReq):
    try:
        detail = netease.get_song_detail(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该歌曲（或网易云无此 id）")
    return detail


@router.post("/artist", dependencies=[Depends(_rate_limit)])
def artist(req: SongReq):
    try:
        detail = netease.get_artist_detail(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该歌手（或网易云无此 id）")
    return detail


@router.post("/album", dependencies=[Depends(_rate_limit)])
def album(req: SongReq):
    try:
        detail = netease.get_album_detail(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该专辑（或网易云无此 id）")
    return detail


@router.post("/playlist", dependencies=[Depends(_rate_limit)])
def playlist(req: SongReq):
    try:
        detail = netease.get_playlist_detail(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该歌单（或网易云无此 id）")
    return detail


@router.post("/lyric", dependencies=[Depends(_rate_limit)])
def lyric(req: SongReq):
    try:
        detail = netease.get_lyric(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None:
        raise HTTPException(status_code=404, detail="未找到该歌曲歌词（或网易云无此 id）")
    return detail


@router.post("/url", dependencies=[Depends(_rate_limit)])
def song_url(req: SongReq):
    """获取单曲播放直链（用于前端内置 <audio> 播放器）。"""
    try:
        detail = netease.get_song_url(req.id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"网易云请求失败：{exc}")
    if detail is None or not detail.get("url"):
        if not netease.get_cookie_status().get("configured"):
            raise HTTPException(
                status_code=404,
                detail="该歌曲可能为会员专享或已下架：免费歌曲无需登录可直接播放；会员/高音质需配置 Cookie 解锁",
            )
        raise HTTPException(status_code=404, detail="该歌曲无可用播放源（版权限制或已下架）")
    return detail


@router.get("/audio/{song_id}")
def audio(song_id: int | str):
    """网易云音频流代理：流式转发并补 CORS 头。

    网易云音频外链无 CORS 头，前端 <audio crossOrigin> 读不到数据；一旦被
    Web Audio 图（createMediaElementSource）接管便静音、频谱全零。本端点把
    音频流原样转发（供 <audio> 直接播放），从根上解决「可视化没声音/地图不动」。
    """
    try:
        upstream = netease.get_audio_stream(song_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    ctype = upstream.headers.get("Content-Type") or "audio/mpeg"
    length = upstream.headers.get("Content-Length")
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Length",
        "Content-Type": ctype,
        "Accept-Ranges": "bytes",
    }
    if length:
        headers["Content-Length"] = length

    def gen():
        try:
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(gen(), headers=headers, media_type=ctype)
