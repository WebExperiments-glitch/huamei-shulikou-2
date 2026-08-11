"""网易云音乐集成服务。

底层 weapi 加密由项目自带的 `app/vendor/weencrypt.py` 完成（MIT，自实现，
与旧版 netease SDK（AGPLv3，已弃用）/ pyncm（Apache-2.0）的 WeapiEncrypt 输出一致），
通过网易云 weapi 接口抓取数据，无需登录。

可稳定获取：
  - 搜索列表（歌名/歌手/专辑/封面/id/热度）
  - 单曲基础信息 + 热度(pop) + 评论总数(comment total)

注意：网易云已关闭公开播放量接口（weapi/song/playcount 返回 404），
因此 play_count 字段恒为 None。
"""
from __future__ import annotations

import logging
import re

import requests

from app.vendor.weencrypt import weapi_encrypt

logger = logging.getLogger("netease")

# robots.txt 透明校验：music.163.com 对 /weapi 为 Allow（仅禁 /prime/m/gift-receive 与训练爬虫）。
# 首次调用时记录一次策略，确保合规可见、可审计。
from app.core import robots as robots_mod  # noqa: E402

_ROBOTS_LOGGED = False


def _log_robots_once() -> None:
    global _ROBOTS_LOGGED
    if _ROBOTS_LOGGED:
        return
    _ROBOTS_LOGGED = True
    try:
        logger.info("robots: music.163.com=%s", robots_mod.summary("music.163.com"))
    except Exception:  # noqa: BLE001
        pass

# 固定为常见电脑 Chrome 浏览器的 headers，避免被网易云风控拦截
_WEAPI_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    ),
    "Referer": "https://music.163.com/",
}

_TYPE_MAP = {
    "song": 1,
    "album": 10,
    "artist": 100,
    "playlist": 1000,
    "user": 1002,
    "lyric": 1006,
    "mv": 1004,
}

_BASE = "https://music.163.com"


def _weapi_post(url: str, data: dict) -> dict:
    """对 data 做 weapi 加密后 POST，返回解析后的 JSON 字典。"""
    payload = weapi_encrypt(data)
    resp = requests.post(url, data=payload, headers=_WEAPI_HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.json()


def search(keyword: str, stype: str = "song", limit: int = 20, offset: int = 0) -> dict:
    """搜索网易云。stype: song/album/artist/playlist/lyric/mv/user。

    返回统一 items 结构：{kind, id, name, sub, pic, [duration_ms, pop]}。
    - song   : 单曲（含时长/热度）
    - artist : 歌手
    - album  : 专辑
    - playlist: 歌单
    """
    _log_robots_once()
    t = _TYPE_MAP.get(stype, 1)
    resp = _weapi_post(
        f"{_BASE}/weapi/search/get",
        {"s": keyword, "type": t, "limit": limit, "offset": offset},
    )
    data = resp.json()
    result = data.get("result", {}) or {}
    items = []
    if stype == "artist":
        for a in result.get("artists") or []:
            items.append({
                "kind": "artist",
                "id": a.get("id"),
                "name": a.get("name"),
                "sub": f"歌手 · {a.get('musicSize', 0)} 首作品",
                "pic": a.get("picUrl") or a.get("img1v1Url"),
                "music_size": a.get("musicSize"),
                "album_size": a.get("albumSize"),
            })
    elif stype == "album":
        for al in result.get("albums") or []:
            artists = " / ".join(x.get("name", "") for x in (al.get("artists") or []))
            items.append({
                "kind": "album",
                "id": al.get("id"),
                "name": al.get("name"),
                "sub": f"专辑 · {artists}",
                "pic": al.get("picUrl"),
                "artist": artists,
                "size": al.get("size"),
                "publish_time": al.get("publishTime"),
            })
    elif stype == "playlist":
        for pl in result.get("playlists") or []:
            creator = (pl.get("creator") or {}).get("nickname", "")
            items.append({
                "kind": "playlist",
                "id": pl.get("id"),
                "name": pl.get("name"),
                "sub": f"歌单 · by {creator}",
                "pic": pl.get("coverImgUrl"),
                "creator": creator,
                "track_count": pl.get("trackCount"),
                "play_count": pl.get("playCount"),
            })
    else:  # song（默认）
        for s in result.get("songs") or []:
            ar = s.get("artists") or s.get("ar") or []
            al = s.get("album") or s.get("al") or {}
            artists = " / ".join(a.get("name", "") for a in ar)
            alias = s.get("alias") or s.get("alia") or []
            items.append({
                "kind": "song",
                "id": s.get("id"),
                "name": s.get("name"),
                "alias": alias,
                "sub": artists,
                "album": al.get("name"),
                "album_id": al.get("id"),
                "pic": al.get("picUrl"),
                "duration_ms": s.get("duration") or s.get("dt"),
                "pop": s.get("score") or s.get("pop"),
                "mv_id": s.get("mv"),
            })
    return {"keyword": keyword, "type": stype, "count": len(items), "items": items}


def get_song_detail(song_id) -> dict | None:
    """单曲详情：基础信息 + 热度(pop) + 评论总数。播放量接口已关闭 -> play_count=None。"""
    s_id = int(song_id)
    resp = _weapi_post(
        f"{_BASE}/weapi/v3/song/detail",
        {"c": f'[{{"id":{s_id}}}]', "ids": f"[{s_id}]"},
    )
    data = resp.json()
    songs = data.get("songs") or []
    if not songs:
        return None
    s = songs[0]
    ar = s.get("ar") or []
    al = s.get("al") or {}
    comment_total = None
    try:
        cr = _weapi_post(
            f"{_BASE}/weapi/v1/resource/comments/R_SO_4_{s_id}",
            {"rid": f"R_SO_4_{s_id}", "offset": 0, "limit": 1},
        )
        comment_total = cr.json().get("total")
    except Exception as exc:  # noqa: BLE001
        logger.warning("netease comment fetch failed for %s: %s", s_id, exc)
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "alias": s.get("alia") or s.get("alias") or [],
        "artists": [a.get("name") for a in ar],
        "album": al.get("name"),
        "album_pic": al.get("picUrl"),
        "duration_ms": s.get("dt") or s.get("duration"),
        "pop": s.get("pop"),
        "publish_time": s.get("publishTime"),
        "mv_id": s.get("mv"),
        "comment_count": comment_total,
        "play_count": None,  # 网易云已关闭公开播放量接口
    }


def _normalize_song(s: dict) -> dict:
    """把网易云 song 对象统一为标准曲目结构（search/album/playlist/artist 通用）。"""
    ar = s.get("ar") or s.get("artists") or []
    al = s.get("al") or s.get("album") or {}
    alias = s.get("alia") or s.get("alias") or []
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "alias": alias,
        "artists": [a.get("name") for a in ar],
        "album": al.get("name"),
        "album_id": al.get("id"),
        "pic": al.get("picUrl"),
        "duration_ms": s.get("dt") or s.get("duration"),
        "pop": s.get("pop"),
        "mv_id": s.get("mv"),
    }


def get_artist_detail(artist_id) -> dict | None:
    """歌手详情：基础信息 + 简介 + 热门歌曲（前 50 首）。"""
    a_id = int(artist_id)
    resp = _weapi_post(f"{_BASE}/weapi/v1/artist/{a_id}", {})
    data = resp.json()
    artist = data.get("artist")
    if not artist:
        return None
    hot = data.get("hotSongs") or []
    return {
        "id": artist.get("id"),
        "name": artist.get("name"),
        "alias": artist.get("transNames") or artist.get("alias") or [],
        "pic": artist.get("picUrl") or artist.get("img1v1Url"),
        "brief_desc": artist.get("briefDesc") or "",
        "music_size": artist.get("musicSize"),
        "album_size": artist.get("albumSize"),
        "mv_size": artist.get("mvSize"),
        "hot_songs": [_normalize_song(x) for x in hot[:50]],
    }


def get_album_detail(album_id) -> dict | None:
    """专辑详情：专辑信息 + 曲目列表。"""
    a_id = int(album_id)
    resp = _weapi_post(
        f"{_BASE}/weapi/v1/album/{a_id}", {"offset": 0, "limit": 100, "total": True},
    )
    data = resp.json()
    album = data.get("album")
    if not album:
        return None
    songs = data.get("songs") or []
    artists = " / ".join(x.get("name", "") for x in (album.get("artists") or []))
    return {
        "id": album.get("id"),
        "name": album.get("name"),
        "artist": artists,
        "pic": album.get("picUrl"),
        "publish_time": album.get("publishTime"),
        "company": album.get("company"),
        "description": album.get("description") or "",
        "size": album.get("size"),
        "songs": [_normalize_song(x) for x in songs],
    }


def _get_songs_by_ids(ids: list[int]) -> list[dict]:
    """批量按 id 拉取标准曲目结构（用于歌单 trackIds 补全）。"""
    if not ids:
        return []
    c = "[" + ",".join(f'{{"id":{i}}}' for i in ids) + "]"
    resp = _weapi_post(
        f"{_BASE}/weapi/v3/song/detail", {"c": c, "ids": str(ids)},
    )
    songs = (resp.json() or {}).get("songs") or []
    return [_normalize_song(x) for x in songs]


def get_playlist_detail(playlist_id) -> dict | None:
    """歌单详情：歌单信息 + 完整曲目列表。

    网易云 v3/playlist/detail 的 `tracks` 字段默认只返回前 10 首，
    需借助 `trackIds`（全量 id）批量补拉，确保曲目列表完整。
    """
    p_id = int(playlist_id)
    resp = _weapi_post(f"{_BASE}/weapi/v3/playlist/detail", {"id": p_id, "n": 1000})
    data = resp.json()
    pl = data.get("playlist")
    if not pl:
        return None
    creator = (pl.get("creator") or {}).get("nickname", "")
    # 优先用 trackIds 补拉全量曲目；失败则退回前 10 首
    track_ids = [t.get("id") for t in (pl.get("trackIds") or []) if t.get("id")]
    tracks = _get_songs_by_ids(track_ids) if track_ids else [_normalize_song(x) for x in (pl.get("tracks") or [])]
    return {
        "id": pl.get("id"),
        "name": pl.get("name"),
        "creator": creator,
        "description": pl.get("description") or "",
        "tags": pl.get("tags") or [],
        "pic": pl.get("coverImgUrl"),
        "play_count": pl.get("playCount"),
        "track_count": pl.get("trackCount"),
        "subscribed_count": pl.get("subscribedCount"),
        "comment_count": pl.get("commentCount"),
        "tracks": tracks,
    }


def _parse_lrc(text: str) -> list[dict]:
    if not text:
        return []
    out = []
    pat = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\](.*)")
    for line in text.split("\n"):
        m = pat.match(line)
        if not m:
            continue
        t = int(m.group(1)) * 60 + float(m.group(2))
        out.append({"t": round(t, 3), "text": m.group(3).strip()})
    return out


def get_song_url(song_id, br: int = 320000) -> dict | None:
    """获取单曲播放直链（网易云 weapi）。返回 {url, br, size, code}。

    部分歌曲因版权限制 code=404 / url=null（如周杰伦原版），需前端降级提示。
    直链带有效期（约 1200s），过期后由前端重新拉取。
    """
    s_id = int(song_id)
    resp = _weapi_post(
        f"{_BASE}/weapi/song/enhance/player/url",
        {"ids": f"[{s_id}]", "br": br},
    )
    arr = (resp.json() or {}).get("data") or []
    if not arr:
        return None
    item = arr[0]
    return {
        "id": item.get("id"),
        "url": item.get("url"),
        "br": item.get("br"),
        "size": item.get("size"),
        "code": item.get("code"),
        "md5": item.get("md5"),
    }


def get_lyric(song_id) -> dict | None:
    """歌词：解析 LRC 原文 + 翻译（若有），按时间戳对齐成逐行结构。"""
    s_id = int(song_id)
    resp = _weapi_post(
        f"{_BASE}/weapi/song/lyric", {"id": s_id, "lv": -1, "kv": -1, "tv": -1},
    )
    data = resp.json()
    raw = (data.get("lrc") or {}).get("lyric") or ""
    raw_tl = (data.get("tlyric") or {}).get("lyric") or ""
    lines = _parse_lrc(raw)
    tl_map = {x["t"]: x["text"] for x in _parse_lrc(raw_tl)}
    for ln in lines:
        ln["tl"] = tl_map.get(ln["t"])
    return {
        "id": s_id,
        "raw_lrc": raw,
        "raw_tlyric": raw_tl,
        "lines": lines,
        "has_translation": bool(raw_tl),
    }


def get_song_comments(song_id, limit: int = 5) -> dict | None:
    """单曲热评：取 hotComments（热评）+ comments（最新评论）+ 总数。"""
    try:
        s_id = int(song_id)
    except (TypeError, ValueError):
        return None
    try:
        resp = _weapi_post(
            f"{_BASE}/weapi/v1/resource/comments/R_SO_4_{s_id}",
            {"rid": f"R_SO_4_{s_id}", "offset": 0, "limit": max(1, min(int(limit or 5), 20)), "cursor": -1},
        )
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("netease comments failed for %s: %s", s_id, exc)
        return None

    def norm(c: dict) -> dict:
        u = c.get("user") or {}
        return {
            "nickname": u.get("nickname", ""),
            "content": c.get("content", ""),
            "liked": int(c.get("likedCount") or 0),
            "time": int(c.get("time") or 0),
        }

    hot = [norm(c) for c in (data.get("hotComments") or [])]
    latest = [norm(c) for c in (data.get("comments") or [])]
    return {"id": s_id, "total": data.get("total"), "hot": hot, "latest": latest}
