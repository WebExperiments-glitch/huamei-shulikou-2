from __future__ import annotations

import json
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.parse import quote

import httpx

from ..core import config

# Google 翻译目标语言映射
_TL = {"en": "en", "zh": "zh-CN"}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS song_i18n (
  bvid          TEXT PRIMARY KEY,
  title_en      TEXT,
  title_cn_auto TEXT,
  provider      TEXT,
  updated_at    INTEGER
)
"""

_ensured = False
_mem: dict[tuple[str, str], str] = {}  # (bvid, target) -> text，进程内二级缓存


def ensure_translate_schema() -> None:
    global _ensured
    if _ensured:
        return
    config.ensure_dirs()
    conn = sqlite3.connect(config.TRANSLATE_DB)
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()
    _ensured = True


def connect_translate(readonly: bool = False) -> sqlite3.Connection:
    config.ensure_dirs()
    ensure_translate_schema()
    path = Path(config.TRANSLATE_DB)
    if readonly:
        uri = path.resolve().as_uri() + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _fetch(url: str) -> str | None:
    """取数：优先 httpx(certifi 验证)，失败回退 curl --ssl-no-revoke（沙箱 TLS 限制）。"""
    try:
        import certifi

        # 沙箱 OpenSSL 对 Google 证书链验证必失败，给较短超时快速回退到 curl
        r = httpx.get(url, timeout=6, verify=certifi.where())
        if r.status_code == 200 and r.text.strip():
            return r.text
    except Exception:
        pass
    try:
        r = subprocess.run(
            ["curl", "-sS", "--ssl-no-revoke", url],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout
    except Exception:
        pass
    return None


def _parse_google(raw: str) -> str:
    """Google translate_a/single 返回嵌套数组，提取每句的翻译文本并拼接。"""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return ""
    chunks = data[0] if isinstance(data, list) and data else []
    out = []
    for seg in chunks:
        if isinstance(seg, list) and seg and isinstance(seg[0], str):
            out.append(seg[0])
    return "".join(out)


def google_translate(text: str, target: str) -> str | None:
    tl = _TL.get(target, "en")
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl=auto&tl={tl}&dt=t&q={quote(text)}"
    )
    raw = _fetch(url)
    if not raw:
        return None
    return _parse_google(raw)


def get_or_translate(conn, bvid: str, title: str, target: str) -> dict:
    """查缓存 → 缓存命中直接返；否则翻译并落库。title 为空时回源库查。"""
    target = "en" if target not in _TL else target
    col = "title_en" if target == "en" else "title_cn_auto"

    cached = _mem.get((bvid, target))
    if cached is not None:
        return {"bvid": bvid, "target": target, "text": cached, "cached": True}

    row = conn.execute(
        f"SELECT {col} FROM song_i18n WHERE bvid=?", (bvid,)
    ).fetchone()
    if row and row[col]:
        text = row[col]
        _mem[(bvid, target)] = text
        return {"bvid": bvid, "target": target, "text": text, "cached": True}

    if not title:
        from ..core import db

        sconn = db.connect_source()
        try:
            srow = sconn.execute(
                "SELECT title FROM songs_all WHERE LOWER(bvid)=LOWER(?)", (bvid,)
            ).fetchone()
            title = srow["title"] if srow else ""
        finally:
            sconn.close()
    if not title:
        return {"bvid": bvid, "target": target, "text": "", "cached": False}

    text = google_translate(title, target)
    if not text:
        return {"bvid": bvid, "target": target, "text": "", "cached": False}

    conn.execute(
        f"INSERT INTO song_i18n(bvid, {col}, provider, updated_at) VALUES(?,?,?,?) "
        f"ON CONFLICT(bvid) DO UPDATE SET {col}=excluded.{col}, provider=excluded.provider, updated_at=excluded.updated_at",
        (bvid, text, "google", int(time.time())),
    )
    conn.commit()
    _mem[(bvid, target)] = text
    return {"bvid": bvid, "target": target, "text": text, "cached": False}
