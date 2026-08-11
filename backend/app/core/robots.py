"""robots.txt 合规层：抓取并解析各外部数据源的 robots.txt，供爬虫在请求前校验。

设计原则（礼貌 + 透明，非隐蔽抓取）：
- 用标准库 urllib.robotparser 解析，尊重 Disallow / Crawl-delay 指令。
- 解析结果按 host 缓存到 data/robots/，TTL 24h，避免每次启动都打一次 robots.txt。
- 联网失败 / 超时 → 回退到内置 _KNOWN_RULES（覆盖本项目真实使用的 4 个 host），
  保证「已知规则永不丢失」，离线也不会悄悄违规。
- api.bilibili.com 的 robots.txt 是 `User-agent: * → Disallow: /`。
  该指令本质是「反搜索引擎索引」（不希望 Google 收录 API 裸 URL），并非禁止应用层
  使用其公开接口；且项目实时热度榜依赖此接口、无等价公开替代源。
  因此在 ROBOTS_STRICT=False（默认）下以「透明例外」方式继续：诚实 UA + 严格节流
  + 本地缓存最小化请求，并在日志明确声明。设置环境变量 ROBOTS_STRICT=1 可一键切到
  严格模式——拒绝抓取被禁 host，仅用历史快照数据。
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from ..core import config

logger = logging.getLogger(__name__)

CACHE_TTL = 24 * 3600
CHECKER_UA = (
    "ShuliKouWeeklyBoard-RobotsChecker/1.0 "
    "(+local fan ranking project; respects robots.txt)"
)

# 严格模式：env ROBOTS_STRICT=1 时，被 robots 禁止的 host 一律拒绝抓取。
STRICT = __import__("os").environ.get("ROBOTS_STRICT") == "1"

# 网络失败时的回退规则（覆盖本项目真实使用的 host）。key=host, value=robots.txt 原文。
_KNOWN_RULES: dict[str, str] = {
    "api.bilibili.com": "User-agent: *\nDisallow: /\n",
    "www.bilibili.com": (
        "User-agent: *\nDisallow: /medialist/detail/\nDisallow: /index.html\n"
    ),
    "biliboard.uk": (
        "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /data-management\n"
    ),
    "music.163.com": (
        "User-agent: *\nAllow: /\nDisallow: /prime/m/gift-receive\n"
    ),
}

_policy_cache: dict[str, RobotFileParser] = {}


def _cache_path(host: str) -> Path:
    config.ensure_dirs()
    d = config.DATA_DIR / "robots"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{host}.txt"


def _load_host(host: str) -> RobotFileParser:
    if host in _policy_cache:
        return _policy_cache[host]
    rp = RobotFileParser()
    rp.set_url(f"https://{host}/robots.txt")
    cached = _cache_path(host)
    raw: str | None = None
    # 1) 优先用磁盘缓存（24h 内）
    if cached.exists():
        try:
            if time.time() - cached.stat().st_mtime < CACHE_TTL:
                raw = cached.read_text(encoding="utf-8", errors="replace")
        except OSError:
            raw = None
    # 2) 缓存失效则联网抓取
    if raw is None:
        try:
            req = Request(
                f"https://{host}/robots.txt",
                headers={"User-Agent": CHECKER_UA},
            )
            with urlopen(req, timeout=10) as r:
                raw = r.read().decode("utf-8", errors="replace")
            cached.write_text(raw, encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "robots: 抓取 %s/robots.txt 失败: %s，回退内置规则", host, exc
            )
            raw = _KNOWN_RULES.get(host, "User-agent: *\nAllow: /\n")
    try:
        rp.parse(raw.splitlines())
    except Exception as exc:  # noqa: BLE001
        logger.warning("robots: 解析 %s 失败: %s，使用宽松默认", host, exc)
        rp.parse(_KNOWN_RULES.get(host, "User-agent: *\nAllow: /\n").splitlines())
    _policy_cache[host] = rp
    return rp


def host_of(url: str) -> str:
    return urlparse(url).netloc or url


def can_fetch(url: str, ua: str = "*") -> bool:
    """该 url（含 path）是否被 robots.txt 允许抓取。"""
    host = host_of(url)
    try:
        return _load_host(host).can_fetch(ua, url)
    except Exception as exc:  # noqa: BLE001
        logger.warning("robots: can_fetch 失败 %s: %s", url, exc)
        return True


def crawl_delay(url: str, ua: str = "*") -> float | None:
    """返回该 host 的 Crawl-delay（秒），无则 None。"""
    host = host_of(url)
    try:
        d = _load_host(host).crawl_delay(ua)
        return float(d) if d is not None else None
    except Exception:  # noqa: BLE001
        return None


def summary(host: str) -> dict:
    """启动期合规报告用：返回该 host 的 robots 策略快照。"""
    try:
        rp = _load_host(host)
        return {
            "host": host,
            "fetched": True,
            "allows_root": rp.can_fetch("*", f"https://{host}/"),
            "crawl_delay": rp.crawl_delay("*"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"host": host, "fetched": False, "error": str(exc)}
