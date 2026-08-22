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
import random
import re
import time
import urllib.parse
from functools import reduce

from scrapling.fetchers import Fetcher

# 确保 PLAYWRIGHT_BROWSERS_PATH（D 盘项目目录）在 StealthyFetcher 启动浏览器前生效
from ..core import config as _config  # noqa: F401

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
_FINGER_URL = "https://api.bilibili.com/x/frontend/finger/spi"

_cache: dict = {"keys": None, "ts": 0.0}
_device: dict = {"cookies": None, "ts": 0.0}


def get_mixin_key(orig: str) -> str:
    """对 img_key+sub_key 按置换表打乱并截断到 32 位。"""
    return reduce(lambda s, i: s + orig[i], MIXIN_KEY_ENC_TAB, "")[:32]


def get_device_cookies() -> dict[str, str]:
    """获取并缓存稳定的设备指纹 buvid3/buvid4（底层用 Scrapling Fetcher）。

    B 站按 buvid 追踪设备：若每次请求都换新 buvid，会被风控判为异常设备。
    这里在进程内只取一次并复用，让同一次抓取/搜索会话内 buvid 保持一致。
    失败返回空 dict（调用方忽略即可，不阻塞业务）。
    """
    now = time.time()
    if _device["cookies"] and now - _device["ts"] < 3600:
        return _device["cookies"]
    try:
        r = Fetcher.get(_FINGER_URL, headers=BROWSER_HEADERS, impersonate="chrome", timeout=10)
        d = (r.json() or {}).get("data") or {}
        ck: dict[str, str] = {}
        if d.get("b_3"):
            ck["buvid3"] = d["b_3"]
        if d.get("b_4"):
            ck["buvid4"] = d["b_4"]
        if ck:
            _device["cookies"] = ck
            _device["ts"] = now
            return ck
    except Exception:
        pass
    return {}


def _wbi2(params: dict) -> dict:
    """WBI2 增强：附加鼠标/键盘行为模拟参数，进一步降低被风控概率。"""
    p = dict(params)
    p.setdefault("dm_img_list", "[]")
    p.setdefault("dm_img_str", "".join(random.sample("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 2)))
    p.setdefault("dm_cover_img_str", "".join(random.sample("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 2)))
    p.setdefault("dm_img_inter", '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}')
    return p


def fetch_keys() -> tuple[str, str]:
    """从 nav 接口取 (img_key, sub_key)。失败抛异常由调用方兜底。"""
    r = Fetcher.get(_NAV_URL, headers=BROWSER_HEADERS, impersonate="chrome", timeout=15)
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
    # 官方算法（bilibili-API-collect）：先按 key 升序，再对每个值过滤 !'()*，
    # 用默认 safe 字符集的 urlencode 拼 query，最后 md5(query + mixin_key)。
    # 注意不可对每个键值用 quote(safe="")：那会把 -_.~ 等也转义，与 B站 服务端
    # 重新编码的口径不一致，含这些字符的参数（如带标点的曲名搜索）会签名校验失败。
    p = {k: re.sub(r"[!'()*]", "", str(v)) for k, v in sorted(p.items())}
    query = urllib.parse.urlencode(p)
    p["w_rid"] = hashlib.md5((query + mixin).encode("utf-8")).hexdigest()
    return p


def signed_get(url: str, params: dict, timeout: int = 15, wbi2: bool = False):
    """带 WBI 签名的 GET（底层用 Scrapling Fetcher 模拟 Chrome TLS 指纹 + 稳定 buvid）；
    nav 取键失败则回退未签名请求。wbi2=True 时附加行为模拟参数（风控更严的接口）。"""
    try:
        signed = sign(_wbi2(params) if wbi2 else params)
    except Exception:
        signed = dict(params)
    cookies = get_device_cookies()
    return Fetcher.get(
        url, params=signed, headers=BROWSER_HEADERS,
        cookies=cookies or None, impersonate="chrome", timeout=timeout,
    )


def _build_url(url: str, params: dict) -> str:
    """把参数字典拼成带 query 的完整 URL（StealthyFetcher 需要完整 URL）。"""
    if not params:
        return url
    q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote, safe="")
    return f"{url}{'&' if '?' in url else '?'}{q}"


def stealth_get(url: str, params: dict, timeout: int = 30, wbi2: bool = False):
    """全隐身 GET（Scrapling StealthyFetcher 真实 Chromium 伪装），用于风控最严的接口。

    带 WBI 签名 + 稳定 buvid 设备指纹。任一步骤失败即回退到轻量 Fetcher，
    保证功能不因隐身浏览器初始化失败而中断。wbi2=True 时附加行为模拟参数。
    """
    try:
        signed = sign(_wbi2(params) if wbi2 else params)
    except Exception:
        signed = dict(params)
    cookies = get_device_cookies()
    try:
        from scrapling.fetchers import StealthyFetcher

        r = StealthyFetcher.fetch(
            _build_url(url, signed),
            extra_headers=BROWSER_HEADERS,
            cookies=(
                [{"name": k, "value": v, "url": url} for k, v in cookies.items()]
                if cookies
                else None
            ),
            headless=True, google_search=False, disable_resources=True,
            load_dom=False, network_idle=False, real_chrome=True,
            timeout=timeout * 1000,
        )
        if r.status < 400:
            return r
    except Exception:
        pass
    return Fetcher.get(
        url, params=signed, headers=BROWSER_HEADERS,
        cookies=cookies or None, impersonate="chrome", timeout=timeout,
    )
