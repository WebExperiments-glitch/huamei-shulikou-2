"""QQ 音乐集成服务（免登录 / 免绿钻试听）。

链路（2026-08-16 实测打通，与 yt-dlp 主仓库 yt_dlp/extractor/qqmusic.py 同款）：
  1. 搜索：client_search_cp 返回 songmid / media_mid / 专辑封面 / pay.payplay（0=免费播放，1=绿钻专属）
  2. 播放：POST musicu.fcg 的 vkey.GetVkeyServer / CgiGetVkey，免登录（uin=0, loginflag=1, platform=20）
     → 免费歌曲直接返回 purl（含 vkey），拼 base 域名即可播放；
     → 绿钻专属歌曲返回空 purl（result=104003），服务端拒绝下发 vkey。
  本模块只做公开免费试听，不实现任何绿钻绕过。

注意：接口对请求头（UA/Referer）与参数格式敏感，改动前请先用 backend/probe_qqmusic.py 验证。
"""
from __future__ import annotations

import json
import logging
import random
import time

import requests

from app.core import robots as robots_mod

logger = logging.getLogger("qqmusic")

_QQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Referer": "https://y.qq.com/",
}
_TIMEOUT = 15

# 试听音质（与 yt-dlp _FORMATS 一致）：M800=320k mp3 / M500=128k mp3 / C400=96k aac / C200=48k aac
_FORMATS = [
    {"prefix": "M800", "ext": "mp3", "name": "320mp3"},
    {"prefix": "M500", "ext": "mp3", "name": "128mp3"},
    {"prefix": "C400", "ext": "m4a", "name": "96aac"},
    {"prefix": "C200", "ext": "m4a", "name": "48aac"},
]
_STREAM_HOST = "https://dl.stream.qqmusic.qq.com/"

_ROBOTS_LOGGED = False


def _log_robots_once() -> None:
    global _ROBOTS_LOGGED
    if _ROBOTS_LOGGED:
        return
    _ROBOTS_LOGGED = True
    try:
        logger.info("robots: y.qq.com=%s", robots_mod.summary("y.qq.com"))
    except Exception:  # noqa: BLE001
        pass


def _pic_url(album_mid: str | None) -> str | None:
    if not album_mid:
        return None
    return f"https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg"


def search(keyword: str, n: int = 20) -> dict:
    """按歌名/歌手/专辑搜索，返回 {keyword, count, items}。

    items 字段与前端 QQMusicItem 对齐：
      id=songmid / name / singer / album / pic / duration_ms / vip / mid=media_mid
    """
    _log_robots_once()
    url = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp"
    params = {
        "w": keyword, "format": "json", "p": 1, "n": max(1, min(n, 50)),
        "platform": "yqq", "needNewCode": 0,
    }
    r = requests.get(url, params=params, headers=_QQ_HEADERS, timeout=_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    song_list = (data.get("data") or {}).get("song") or {}
    items_raw = song_list.get("list") or []
    items = []
    for s in items_raw:
        singer = " / ".join(a.get("name", "") for a in (s.get("singer") or []) if a.get("name"))
        pay = s.get("pay") or {}
        items.append({
            "id": s.get("songmid") or "",
            "mid": (s.get("file") or {}).get("media_mid") or s.get("media_mid") or s.get("songmid") or "",
            "name": s.get("songname") or "",
            "singer": singer,
            "album": s.get("albumname") or "",
            "pic": _pic_url(s.get("albummid")),
            "duration_ms": (s.get("interval") or 0) * 1000,
            "vip": int(pay.get("payplay") or 0) == 1,
        })
    return {"keyword": keyword, "count": len(items), "items": items}


def _m_r_get_ruin() -> int:
    # 与 yt-dlp 相同的 m_r_GetRUin() 实现（top_player.js），生成随机 guid
    cur_ms = int(time.time() * 1000) % 1000
    return int(round(random.random() * 2147483647) * cur_ms % 1e10)


def get_song_url(songmid: str, media_mid: str | None = None) -> dict:
    """获取单曲播放直链。返回 { url, br, free, vip, formats }。

    免费歌曲：url 非空且 free=True（免绿钻可播）。
    绿钻专属：url 为 None（服务端不下发 vkey，不做绕过）。
    """
    mid = media_mid or songmid
    filenames = [f"{f['prefix']}{mid}.{f['ext']}" for f in _FORMATS]
    body = {
        "comm": {"cv": 0, "ct": 24, "format": "json", "uin": 0},
        "req_1": {
            "module": "vkey.GetVkeyServer",
            "method": "CgiGetVkey",
            "param": {
                "guid": str(_m_r_get_ruin()),
                "songmid": [songmid] * len(_FORMATS),
                "songtype": [0] * len(_FORMATS),
                "uin": "0",
                "loginflag": 1,
                "platform": "20",
                "filename": filenames,
            },
        },
    }
    url = "https://u.y.qq.com/cgi-bin/musicu.fcg"
    r = requests.post(
        url, headers=_QQ_HEADERS,
        data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        timeout=_TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    req = data.get("req_1") or {}
    mid_info = ((req.get("data") or {}).get("midurlinfo")) or []
    formats = []
    playable: list[str] = []
    for i, it in enumerate(mid_info):
        purl = it.get("purl") or ""
        fmt = _FORMATS[i] if i < len(_FORMATS) else {"prefix": "", "ext": "", "name": "?"}
        formats.append({"name": fmt["name"], "purl": purl})
        if purl:
            playable.append(purl)
    if not playable:
        return {"url": None, "br": 0, "free": False, "vip": True, "formats": formats}
    # 优先最高音质（_FORMATS 顺序即从高到低），拼 base 域名
    best = _STREAM_HOST + playable[0]
    return {"url": best, "br": _FORMATS[0]["prefix"] == "M800" and 320 or 128,
            "free": True, "vip": False, "formats": formats}
