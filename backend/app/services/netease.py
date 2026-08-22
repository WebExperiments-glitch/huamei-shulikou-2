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

import json
import logging
import re

import requests

from app.vendor.weencrypt import weapi_encrypt

logger = logging.getLogger("netease")

# robots.txt 透明校验：music.163.com 对 /weapi 为 Allow（仅禁 /prime/m/gift-receive 与训练爬虫）。
# 首次调用时记录一次策略，确保合规可见、可审计。
from app.core import config  # noqa: E402
from app.core import robots as robots_mod  # noqa: E402

# 网易云自 2023 年起强制登录态才下发播放地址（匿名一律 code=404/-110）。
# 用户可在设置里填入自己的网易云 Cookie（完整串，含 MUSIC_U=...; NMTID=... 等），
# 本地保存到 DATA_DIR，仅用于拉取播放地址。
_COOKIE_FILE = config.DATA_DIR / "netease_cookie.json"


def _load_music_u() -> str:
    """读取用户配置的网易云 Cookie（完整串），未配置返回空串。"""
    try:
        data = json.loads(_COOKIE_FILE.read_text(encoding="utf-8"))
        return (data.get("music_u") or data.get("cookie") or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def save_cookie(music_u: str) -> None:
    """保存网易云 Cookie（完整串，可含 MUSIC_U/NMTID/__csrf 等多个键值对）到本地。传空串视为清除。"""
    _COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _COOKIE_FILE.write_text(
        json.dumps(
            {"music_u": (music_u or "").strip(), "updated_at": int(__import__("time").time())},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def get_cookie_status() -> dict:
    """Cookie 配置状态（供前端设置面板展示/回填）。"""
    value = _load_music_u()
    configured = bool(value)
    return {
        "configured": configured,
        "music_u": value,
        "hint": (
            "在网易云网页端登录后，F12 → Network(网络) → 刷新 → 点任意 music.163.com 请求 → "
            "Request Headers 里复制整个 Cookie 值填入"
        ),
    }

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

# 旧公开接口（/api/...）使用的完整浏览器 headers。
# 网易云 weapi 走百度云加速 CDN（baidu_ssp_verify），对无浏览器指纹/无 Cookie 的请求
# 直接返回空 body 风控；而 music.163.com/api/... 这一组旧公开接口仍开放（无需加密、无需登录）。
# 因此各查询函数优先走旧接口，weapi 作为兜底。
_PUBLIC_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://music.163.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Origin": "https://music.163.com",
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


def _weapi_post(url: str, data: dict, cookie: str | None = None) -> dict:
    """对 data 做 weapi 加密后 POST，返回解析后的 JSON 字典。

    网易云 weapi 目前走百度云加速风控，常返回空 body（200 但无内容），
    这里统一容错：解析失败时返回 {}（不抛异常），由调用方判断数据是否可用。
    可传入登录 Cookie（MUSIC_U）以获取需登录态的播放地址。
    """
    payload = weapi_encrypt(data)
    headers = dict(_WEAPI_HEADERS)
    if cookie:
        headers["Cookie"] = cookie
    try:
        resp = requests.post(url, data=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception:  # noqa: BLE001
        return {}


def _j(resp) -> dict:
    """统一从「旧接口 Response」或「weapi 回退 dict」中取 JSON 数据，失败返回 {}。"""
    if isinstance(resp, dict):
        return resp
    try:
        return resp.json()
    except Exception:  # noqa: BLE001
        return {}


def _public_get(path: str, params: dict) -> requests.Response | None:
    """网易云旧公开接口 GET（/api/...，无需加密、不受百度云加速风控）。

    成功且返回合法 JSON（code=200）时返回 Response；被风控/空 body/异常时返回 None，
    供调用方回退到 weapi。path 需以 /api/ 开头，会拼到 music.163.com 上。
    """
    try:
        r = requests.get(
            _BASE + path, params=params, headers=_PUBLIC_HEADERS, timeout=15,
        )
        if r.status_code != 200 or not r.text.strip():
            return None
        data = r.json()
        code = data.get("code")
        if code is not None and code != 200:
            return None
        return r
    except Exception:  # noqa: BLE001
        return None


def _search_public(keyword: str, stype: str, limit: int, offset: int) -> requests.Response | None:
    """旧接口搜索（无加密）。返回 Response 或 None。"""
    t = _TYPE_MAP.get(stype, 1)
    return _public_get(
        "/api/search/get",
        {"s": keyword, "type": t, "limit": limit, "offset": offset},
    )


def search(keyword: str, stype: str = "song", limit: int = 20, offset: int = 0) -> dict:
    """搜索网易云。stype: song/album/artist/playlist/lyric/mv/user。

    返回统一 items 结构：{kind, id, name, sub, pic, [duration_ms, pop]}。
    - song   : 单曲（含时长/热度）
    - artist : 歌手
    - album  : 专辑
    - playlist: 歌单
    """
    _log_robots_once()
    resp = _search_public(keyword, stype, limit, offset)
    if resp is None:
        # 旧接口被风控时回退 weapi
        resp = _weapi_post(
            f"{_BASE}/weapi/search/get",
            {"s": keyword, "type": _TYPE_MAP.get(stype, 1), "limit": limit, "offset": offset},
        )
    data = _j(resp)
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
        # 搜索接口返回的单曲只带 album.picId、不含完整封面 URL，
        # 批量用 song/detail 一次补齐（避免前端每首都发请求）。
        missing = [it for it in items if not it.get("pic")]
        if missing:
            ids = [str(it["id"]) for it in missing]
            dr = _public_get("/api/song/detail", {"ids": f"[{','.join(ids)}]"})
            if dr is not None:
                pics = {
                    sng.get("id"): (sng.get("album") or sng.get("al") or {}).get("picUrl")
                    for sng in _j(dr).get("songs") or []
                }
                for it in missing:
                    it["pic"] = pics.get(it["id"])
    return {"keyword": keyword, "type": stype, "count": len(items), "items": items}


def get_song_detail(song_id) -> dict | None:
    """单曲详情：基础信息 + 热度(pop) + 评论总数。播放量接口已关闭 -> play_count=None。"""
    s_id = int(song_id)
    resp = _public_get("/api/song/detail", {"ids": f"[{s_id}]"})
    if resp is None:
        resp = _weapi_post(
            f"{_BASE}/weapi/v3/song/detail",
            {"c": f'[{{"id":{s_id}}}]', "ids": f"[{s_id}]"},
        )
    data = _j(resp)
    songs = data.get("songs") or []
    if not songs:
        return None
    s = songs[0]
    # 兼容新旧两套字段：weapi 用 ar/al，旧接口用 artists/album/alia
    ar = s.get("ar") or s.get("artists") or []
    al = s.get("al") or s.get("album") or {}
    comment_total = None
    try:
        cr = _public_get(f"/api/v1/resource/comments/R_SO_4_{s_id}", {"limit": 1, "offset": 0})
        if cr is not None:
            comment_total = cr.json().get("total")
        else:
            cw = _weapi_post(
                f"{_BASE}/weapi/v1/resource/comments/R_SO_4_{s_id}",
                {"rid": f"R_SO_4_{s_id}", "offset": 0, "limit": 1},
            )
            comment_total = cw.get("total")
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
        "pop": s.get("pop") or s.get("score"),
        "publish_time": s.get("publishTime"),
        "mv_id": s.get("mv"),
        "comment_count": comment_total,
        "play_count": None,  # 网易云已关闭公开播放量接口
    }


def _album_id_of(s: dict):
    """从 song 对象安全取专辑 id，兼容 al / album 两种字段且容忍字段为字符串等异常。"""
    al = s.get("al") if isinstance(s.get("al"), dict) else None
    alb = s.get("album") if isinstance(s.get("album"), dict) else None
    a = al or alb or {}
    return a.get("id")


def _normalize_song(s: dict) -> dict:
    """把网易云 song 对象统一为标准曲目结构（search/album/playlist/artist 通用）。"""
    ar = s.get("ar") or s.get("artists") or []
    al = s.get("al") if isinstance(s.get("al"), dict) else (s.get("album") if isinstance(s.get("album"), dict) else {})
    alias = s.get("alia") or s.get("alias") or []
    # artists 兼容两种格式：dict 列表（新版）或纯字符串列表（旧 /api 接口）
    if isinstance(ar, list):
        artists = [a.get("name") if isinstance(a, dict) else str(a) for a in ar]
    elif isinstance(ar, dict):
        artists = [ar.get("name")]
    else:
        artists = [str(ar)] if ar else []
    return {
        "id": s.get("id"),
        "name": s.get("name"),
        "alias": alias,
        "artists": artists,
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
    resp = _public_get(f"/api/artist/{a_id}", {})
    if resp is None:
        resp = _weapi_post(f"{_BASE}/weapi/v1/artist/{a_id}", {})
    data = _j(resp)
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


def _album_search_keywords(album_name: str, artist: str) -> list[str]:
    """按精确度递减生成专辑搜索关键词：专辑名+歌手 → 纯专辑名 → 去括号后缀的专辑名。

    优先级：先带歌手名提高命中精确度，其次纯专辑名，最后去掉（…）/（…）等后缀的
    精简名（如 "(Special Edition)" / "（限定盘）"），以兜底专辑名的常见变体。
    """
    name = (album_name or "").strip()
    artist = (artist or "").strip()
    keys: list[str] = []
    if name:
        if artist:
            keys.append(f"{name} {artist}")
        keys.append(name)
        stripped = re.sub(r"[（(].*?[）)]", "", name).strip()
        if stripped and stripped != name:
            keys.append(stripped)
    return keys


def _complete_album_tracks(album_id: int, album_name: str, artist: str) -> list[dict]:
    """专辑曲目补全：当专辑元数据接口拿不到 songs 时，按专辑名搜索歌曲并按 album_id 过滤。

    网易云歌曲搜索结果的 song 对象带 album/al.id，可用其精确匹配目标专辑，
    从而避免误收同名翻唱/remix/合辑。返回标准曲目结构列表（可能仍为空）。
    """
    for keyword in _album_search_keywords(album_name, artist):
        resp = _search_public(keyword, "song", 50, 0)
        if resp is None:
            resp = _weapi_post(
                f"{_BASE}/weapi/search/get",
                {"s": keyword, "type": 1, "limit": 50, "offset": 0},
            )
        data = _j(resp)
        result = data.get("result") or {}
        songs = result.get("songs") or []
        matched = [
            _normalize_song(s)
            for s in songs
            if _album_id_of(s) == album_id
        ]
        if matched:
            return matched
    return []


def get_album_detail(album_id) -> dict | None:
    """专辑详情：专辑信息 + 曲目列表。

    旧公开接口 /api/album 仅返回专辑元数据（songs 为空），weapi 又被百度云加速风控，
    因此曲目列表可能为空。此时用「专辑名 + 歌手名」在歌曲维度搜索、再按 album_id
    过滤补全曲目（见 _complete_album_tracks）。
    """
    a_id = int(album_id)
    resp = _public_get(f"/api/album/{a_id}", {"ext": True})
    if resp is None:
        # weapi 受百度云加速风控，常间歇性返回空 body；短重试提高命中
        for _ in range(3):
            resp = _weapi_post(
                f"{_BASE}/weapi/v1/album/{a_id}", {"offset": 0, "limit": 100, "total": True},
            )
            if resp.get("album"):
                break
    data = _j(resp)
    album = data.get("album")
    if not album:
        return None
    songs = data.get("songs") or []
    artists = " / ".join(
        a.get("name") if isinstance(a, dict) else str(a)
        for a in (album.get("artists") or [])
        if isinstance(a, (dict, str))
    )
    # 曲目缺失补全：元数据接口拿不到 songs 时，按专辑名搜索并过滤专辑内歌曲
    if not songs:
        songs = _complete_album_tracks(a_id, album.get("name") or "", artists)
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
        "tracks_completed": bool(songs),
    }


def _get_songs_by_ids(ids: list[int]) -> list[dict]:
    """批量按 id 拉取标准曲目结构（用于歌单 trackIds 补全）。"""
    if not ids:
        return []
    resp = _public_get("/api/song/detail", {"ids": f"[{','.join(str(i) for i in ids)}]"})
    if resp is None:
        c = "[" + ",".join(f'{{"id":{i}}}' for i in ids) + "]"
        resp = _weapi_post(
            f"{_BASE}/weapi/v3/song/detail", {"c": c, "ids": str(ids)},
        )
    songs = (_j(resp) or {}).get("songs") or []
    return [_normalize_song(x) for x in songs]


def get_playlist_detail(playlist_id) -> dict | None:
    """歌单详情：歌单信息 + 完整曲目列表。

    网易云 v3/playlist/detail 的 `tracks` 字段默认只返回前 10 首，
    需借助 `trackIds`（全量 id）批量补拉，确保曲目列表完整。
    """
    p_id = int(playlist_id)
    resp = _public_get("/api/playlist/detail", {"id": p_id})
    if resp is None:
        resp = _weapi_post(f"{_BASE}/weapi/v3/playlist/detail", {"id": p_id, "n": 1000})
    data = _j(resp)
    # 旧接口返回 {result:{...扁平歌单...}, code}，weapi 返回 {playlist:{...}}
    pl = data.get("playlist") or (data.get("result") or {})
    if not pl or not pl.get("name"):
        return None
    creator = (pl.get("creator") or {}).get("nickname", "")
    # 优先用 trackIds 补拉全量曲目（旧接口可能只有 topTrackIds）；失败则退回已有 tracks
    track_ids = [t.get("id") for t in (pl.get("trackIds") or pl.get("topTrackIds") or []) if t.get("id")]
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
    """获取单曲播放直链。返回 {url, br, size, code}。

    播放地址获取优先级：
    1) 用户配置了 Cookie（MUSIC_U）→ 用带登录态的公开接口，可拿高音质（br=320000）；
    2) weapi 兜底（同样带 Cookie，可拿 VIP/高音质）；
    3) 官方「外链播放器」接口（/song/media/outer/url，无需登录）兜底 —— 免费歌曲可播，
       返回带 302 重定向的外链地址，由浏览器自动跟随；VIP/版权受限歌曲会被重定向到 404，
       由 API 层提示「版权限制或需会员」。
    均拿不到时返回 None。
    """
    s_id = int(song_id)
    cookie = _load_music_u()
    d: dict | None = None

    # 1) 公开接口（带 cookie，结构稳定）
    if cookie:
        try:
            headers = dict(_PUBLIC_HEADERS)
            headers["Cookie"] = cookie
            resp = requests.get(
                f"{_BASE}/api/song/enhance/player/url",
                params={"ids": f"[{s_id}]", "br": br, "e_r": "true"},
                headers=headers, timeout=15,
            )
            if resp.status_code == 200:
                arr = (resp.json() or {}).get("data") or []
                if arr:
                    item = arr[0]
                    d = {
                        "id": item.get("id"),
                        "url": item.get("url"),
                        "br": item.get("br"),
                        "size": item.get("size"),
                        "code": item.get("code"),
                        "md5": item.get("md5"),
                    }
        except Exception:  # noqa: BLE001
            pass

    # 2) weapi 兜底（同样带 cookie）
    if d is None or not d.get("url"):
        resp = _weapi_post(
            f"{_BASE}/weapi/song/enhance/player/url",
            {"ids": f"[{s_id}]", "br": br},
            cookie,
        )
        arr = (_j(resp) or {}).get("data") or []
        if arr:
            item = arr[0]
            d = {
                "id": item.get("id"),
                "url": item.get("url"),
                "br": item.get("br"),
                "size": item.get("size"),
                "code": item.get("code"),
                "md5": item.get("md5"),
            }

    # 3) 官方「外链播放器」兜底（无需登录，免费歌曲可播；VIP 歌会重定向到 404）
    if d is None or not d.get("url"):
        try:
            resp = requests.get(
                f"{_BASE}/song/media/outer/url?id={s_id}.mp3",
                headers=_PUBLIC_HEADERS, timeout=15, stream=True, allow_redirects=True,
            )
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if resp.status_code == 200 and ctype.startswith("audio/"):
                d = {
                    "id": s_id,
                    # 返回带 302 的外链地址，由浏览器自动跟随（每次请求都重新签名，不会过期）
                    "url": f"{_BASE}/song/media/outer/url?id={s_id}.mp3",
                    "br": 128000,
                    "size": int(resp.headers.get("Content-Length") or 0),
                    "code": 200,
                    "md5": None,
                }
            resp.close()
        except Exception:  # noqa: BLE001
            pass

    if d and d.get("url"):
        return d
    return None


def get_lyric(song_id) -> dict | None:
    """歌词：解析 LRC 原文 + 翻译（若有），按时间戳对齐成逐行结构。"""
    s_id = int(song_id)
    resp = _public_get(
        "/api/song/lyric",
        {"id": s_id, "lv": -1, "kv": -1, "tv": -1},
    )
    if resp is None:
        resp = _weapi_post(
            f"{_BASE}/weapi/song/lyric", {"id": s_id, "lv": -1, "kv": -1, "tv": -1},
        )
    data = _j(resp)
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
        resp = _public_get(
            f"/api/v1/resource/comments/R_SO_4_{s_id}",
            {"offset": 0, "limit": max(1, min(int(limit or 5), 20))},
        )
        if resp is None:
            resp = _weapi_post(
                f"{_BASE}/weapi/v1/resource/comments/R_SO_4_{s_id}",
                {"rid": f"R_SO_4_{s_id}", "offset": 0, "limit": max(1, min(int(limit or 5), 20)), "cursor": -1},
            )
        data = _j(resp)
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


# 允许代理的音频上游域名（网易云外链及其 CDN）。SSRF 白名单。
_NETEASE_AUDIO_HOSTS = ("music.163.com", "music.126.net")


def _is_allowed_audio_host(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
    except Exception:  # noqa: BLE001
        return False
    return any(host == d or host.endswith("." + d) for d in _NETEASE_AUDIO_HOSTS)


def get_audio_stream(song_id) -> requests.Response:
    """建立到网易云音频上游的流式连接（SSRF 白名单校验 + 跟随重定向）。

    网易云音频外链（music.163.com/song/media/outer/url 及其 302 到的 CDN）默认不带
    CORS 头：前端 <audio crossOrigin> 读不到数据，一旦被 Web Audio 图
    （createMediaElementSource）接管便静音、频谱全零。后端代理把音频流原样转发，
    补上 CORS 头，从根上解决「打开可视化后没声音/地图不动」。

    返回可迭代的 requests.Response，调用方负责 close（异常时内部已 close）。
    """
    s_id = int(song_id)
    # 复用 get_song_url 的解析逻辑：直接拿最终可播的 url（含外链兜底）
    info = get_song_url(s_id)
    if info is None or not info.get("url"):
        raise ValueError("该歌曲无可用播放源（版权限制或已下架）")
    target = info["url"]
    if not _is_allowed_audio_host(target):
        raise ValueError("仅支持网易云域名音频地址")
    resp = requests.get(
        target, headers=dict(_PUBLIC_HEADERS), stream=True, timeout=30, allow_redirects=True,
    )
    if resp.status_code != 200:
        resp.close()
        raise ValueError(f"音频上游返回 {resp.status_code}")
    return resp
