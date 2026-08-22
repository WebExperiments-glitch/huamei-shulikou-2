"""B站 抓取子进程客户端（由 songs.py 通过 subprocess 调用）。

运行在独立子进程中，拥有与交互式 Bash 相同的出网出口，可稳定抓取 B站。
支持两种模式：
  view   <bvid>            -> 打印 {"code":.., "data":..}（含 stat 统计）
  search <keyword>         -> 打印 {"code":.., "items":[...]}（top10 视频候选）

输出单行 JSON 到 stdout，便于父进程解析。
"""
from __future__ import annotations

import json
import re
import sys

from . import wbi

_VIEW_URL = "https://api.bilibili.com/x/web-interface/view"
_SEARCH_URL = "https://api.bilibili.com/x/web-interface/wbi/search/all/v2"
_PLAYER_URL = "https://api.bilibili.com/x/player/wbi/v2"

_TAG_RE = re.compile(r"<[^>]+>")


def _strip(s: str | None) -> str:
    if not s:
        return ""
    return _TAG_RE.sub("", s).strip()


def _view(bvid: str) -> dict:
    try:
        r = wbi.signed_get(_VIEW_URL, {"bvid": bvid})
        p = r.json()
        return {"code": p.get("code"), "data": p.get("data")}
    except Exception as e:  # noqa: BLE001
        return {"code": "error", "msg": str(e)}


def _search(q: str) -> dict:
    try:
        # 搜索是 B 站风控最严的接口：走 StealthyFetcher 全隐身 + WBI2 行为签名。
        r = wbi.stealth_get(
            _SEARCH_URL,
            {"keyword": q, "search_type": "video", "page": 1},
            wbi2=True,
        )
        p = r.json()
        if p.get("code") != 0:
            return {"code": p.get("code"), "items": []}
        items: list[dict] = []
        for group in p.get("data", {}).get("result") or []:
            if group.get("result_type") != "video":
                continue
            for v in group.get("data") or []:
                bvid = v.get("bvid")
                if not bvid:
                    continue
                items.append(
                    {
                        "bvid": bvid,
                        "title": _strip(v.get("title")),
                        "author": _strip(v.get("author")),
                        "play": v.get("play") or 0,
                        "pubdate": v.get("pubdate") or 0,
                    }
                )
                if len(items) >= 10:
                    break
            if len(items) >= 10:
                break
        return {"code": 0, "items": items}
    except Exception as e:  # noqa: BLE001
        return {"code": "error", "msg": str(e)}


def _subtitle(bvid: str) -> dict:
    """获取 B 站视频的 CC 字幕（若有）：view 取 cid -> player 接口取字幕列表 -> 下载字幕。

    返回 {code, subtitle?, lang?, msg?}。无字幕时 code=0 且 subtitle=None。
    """
    try:
        view = _view(bvid)
        data = view.get("data") or {}
        cid = (data.get("pages") or [{}])[0].get("cid")
        if not cid:
            return {"code": 0, "subtitle": None, "msg": "未获取到 cid"}
        r = wbi.signed_get(_PLAYER_URL, {"bvid": bvid, "cid": cid})
        p = r.json()
        subs = (p.get("data") or {}).get("subtitle", {}).get("subtitles") or []
        if not subs:
            return {"code": 0, "subtitle": None, "msg": "该视频未开 B 站 CC 字幕"}
        sub = subs[0]
        url = sub.get("subtitle_url")
        lang = sub.get("lan") or sub.get("lan_doc") or ""
        if not url:
            return {"code": 0, "subtitle": None, "msg": "字幕 URL 为空"}
        rr = wbi.Fetcher.get(
            url, impersonate="chrome",
            headers={"User-Agent": wbi.BROWSER_HEADERS["User-Agent"]},
            timeout=15,
        )
        body = (rr.json() or {}).get("body") or []
        lines = [x.get("content") for x in body if x.get("content")]
        return {"code": 0, "subtitle": lines, "lang": lang, "cid": cid}
    except Exception as e:  # noqa: BLE001
        return {"code": "error", "msg": str(e)}


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"code": "error", "msg": "usage: view|search|subtitle <arg>"}))
        return
    mode = sys.argv[1]
    arg = sys.argv[2]
    if mode == "view":
        print(json.dumps(_view(arg), ensure_ascii=False))
    elif mode == "search":
        print(json.dumps(_search(arg), ensure_ascii=False))
    elif mode == "subtitle":
        print(json.dumps(_subtitle(arg), ensure_ascii=False))
    else:
        print(json.dumps({"code": "error", "msg": f"unknown mode {mode}"}))
