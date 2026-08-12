"""B站 WBI 签名工具（让请求更像正常浏览器，降低被风控概率）。

参考 SocialSisterYi/bilibili-API-collect 的 WBI 算法：
  1) 从 /x/web-interface/nav 取 wbi_img 的 img_key / sub_key；
  2) 用固定置换表 MIXIN_KEY_ENC_TAB 生成 32 位 mixin_key；
  3) 对请求参数加 wts（秒级时间戳），按 key 升序排序、过滤 '!()* 字符，
     用 uppercase hex 的 urlencode 拼成 query，再 md5(query + mixin_key) 得 w_rid。

`signed_get` 为 best-effort：签名所需的 nav 取键若失败，自动回退为未签名请求，
避免"为了更稳反而全挂"。
"""
from __future__ import annotations

import hashlib
import time
import urllib.parse
from functools import reduce

import httpx

MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
    27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
    37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
    22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.bilibili.com/",
    "Accept": "application/json, text/plain, */*",
}

_NAV_URL = "https://api.bilibili.com/x/web-interface/nav"

_cache: dict = {"keys": None, "ts": 0.0}


def get_mixin_key(orig: str) -> str:
    """对 img_key+sub_key 按置换表打乱并截断到 32 位。"""
    return reduce(lambda s, i: s + orig[i], MIXIN_KEY_ENC_TAB, "")[:32]


def fetch_keys() -> tuple[str, str]:
    """从 nav 接口取 (img_key, sub_key)。失败抛异常由调用方兜底。"""
    r = httpx.get(_NAV_URL, headers=BROWSER_HEADERS, timeout=15, follow_redirects=True)
    r.raise_for_status()
    wbi = r.json().get("data", {}).get("wbi_img", {})
    img = wbi.get("img_url", "").rsplit("/", 1)[-1].split(".")[0]
    sub = wbi.get("sub_url", "").rsplit("/", 1)[-1].split(".")[0]
    if not img or not sub:
        raise ValueError("WBI keys empty")
    return img, sub


def get_keys() -> tuple[str, str]:
    now = time.time()
    if _cache["keys"] and now - _cache["ts"] < 3600:
        return _cache["keys"]
    keys = fetch_keys()
    _cache["keys"] = keys
    _cache["ts"] = now
    return keys


def sign(params: dict) -> dict:
    """为请求参数附加 w_rid / wts（WBI 签名）。"""
    img, sub = get_keys()
    mixin = get_mixin_key(img + sub)
    p = dict(params)
    p.pop("w_rid", None)
    p["wts"] = int(time.time())
    items = sorted(p.items())

    def _q(s: str) -> str:
        return urllib.parse.quote(str(s), safe="")

    query = "&".join(f"{_q(k)}={_q(v)}" for k, v in items)
    p["w_rid"] = hashlib.md5((query + mixin).encode("utf-8")).hexdigest()
    return p


def signed_get(url: str, params: dict, timeout: int = 15) -> httpx.Response:
    """带 WBI 签名的 GET；nav 取键失败则回退未签名请求。"""
    try:
        signed = sign(params)
    except Exception:
        signed = dict(params)
    return httpx.get(url, params=signed, headers=BROWSER_HEADERS, timeout=timeout, follow_redirects=True)
