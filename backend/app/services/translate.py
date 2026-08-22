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

# 本地球名表：data/song_translations.json，key 为日文原名，value 为 {cn, en?}
_DICT_PATH = config.DATA_DIR / "song_translations.json"
_dict_cache: dict = {}
_dict_norm: dict[str, str] = {}  # 归一化原名 -> 原名


def _norm_title(t: str) -> str:
    return "".join(t.split()).lower()


def load_song_dict() -> None:
    """加载本地球名表（进程内缓存）。失败时保持空表，不影响 Google 兜底。"""
    global _dict_cache, _dict_norm
    if _dict_cache:
        return
    data: dict = {}
    try:
        if _DICT_PATH.exists():
            raw = json.loads(_DICT_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
    except Exception:
        data = {}
    _dict_cache = data
    _dict_norm = {_norm_title(k): k for k in data}


def _entry_value(entry) -> dict | None:
    if isinstance(entry, str):
        return {"cn": entry, "en": None}
    if isinstance(entry, dict):
        return {"cn": entry.get("cn"), "en": entry.get("en")}
    return None


def dict_lookup(title: str, target: str) -> str | None:
    """译名表查询：优先精确匹配，其次忽略空格/大小写匹配。返回目标语言译名，未命中返回 None。"""
    if not title:
        return None
    load_song_dict()
    key = _norm_title(title)
    hit = _dict_norm.get(key) or (title if title in _dict_cache else None)
    if not hit:
        return None
    val = _entry_value(_dict_cache[hit])
    if not val:
        return None
    return val.get("cn") if target == "zh" else val.get("en")

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

    # 本地球名表优先，未命中才回退 Google
    provider = "google"
    text = dict_lookup(title, target)
    if text:
        provider = "dict"
    else:
        text = google_translate(title, target)
    if not text:
        return {"bvid": bvid, "target": target, "text": "", "cached": False}

    conn.execute(
        f"INSERT INTO song_i18n(bvid, {col}, provider, updated_at) VALUES(?,?,?,?) "
        f"ON CONFLICT(bvid) DO UPDATE SET {col}=excluded.{col}, provider=excluded.provider, updated_at=excluded.updated_at",
        (bvid, text, provider, int(time.time())),
    )
    conn.commit()
    _mem[(bvid, target)] = text
    return {"bvid": bvid, "target": target, "text": text, "cached": False}


def backfill_all(target: str = "zh", only_missing: bool = True, sleep: float = 0.3,
                 stop_check=None, progress=None, limit: int | None = None) -> dict:
    """批量补齐全部歌曲译名到 song_i18n（断点续传）。

    遍历 songs_all 全表，对每首歌：
      - 复用官方 title_cn（仅 zh）：源库已有译名直接落库，零网络请求
      - 否则本地球名表 dict_lookup 优先 → Google 免费接口兜底
    支持：
      - only_missing=True 跳过已有缓存（断点续传 / 重复运行不重复请求）
      - stop_check() 返回真时中断（配合 Jobs 取消）
      - progress(i, total, reused, translated, failed) 进度回调
      - limit 只处理前 N 首（测试用）

    返回 {"total", "reused", "translated", "failed"}。
    """
    target = "en" if target not in _TL else target
    col = "title_en" if target == "en" else "title_cn_auto"
    from ..core import db

    ensure_translate_schema()
    sconn = db.connect_source()
    try:
        rows = [dict(r) for r in sconn.execute(
            "SELECT bvid, title, title_cn FROM songs_all ORDER BY id"
        ).fetchall()]
    finally:
        sconn.close()
    if limit is not None:
        rows = rows[: max(0, int(limit))]
    total = len(rows)
    tconn = connect_translate()
    reused = translated = failed = 0
    try:
        for i, row in enumerate(rows, 1):
            if stop_check and stop_check():
                break
            bvid = row.get("bvid") or ""
            title = row.get("title") or ""
            title_cn = (row.get("title_cn") or "").strip()
            if not bvid or not title:
                continue
            # 断点续传：已有缓存直接跳过
            if only_missing:
                cur = tconn.execute(f"SELECT {col} FROM song_i18n WHERE bvid=?", (bvid,)).fetchone()
                if cur and cur[col]:
                    reused += 1
                    if progress:
                        progress(i, total, reused, translated, failed)
                    continue
            # 中文：官方 title_cn 优先复用（零请求）
            text = None
            provider = None
            if target == "zh" and title_cn:
                text, provider = title_cn, "source"
            else:
                text = dict_lookup(title, target)
                provider = "dict" if text else None
                if not text:
                    text = google_translate(title, target)
                    provider = "google" if text else None
            if not text:
                failed += 1
                if progress:
                    progress(i, total, reused, translated, failed)
                continue
            tconn.execute(
                f"INSERT INTO song_i18n(bvid, {col}, provider, updated_at) VALUES(?,?,?,?) "
                f"ON CONFLICT(bvid) DO UPDATE SET {col}=excluded.{col}, provider=excluded.provider, updated_at=excluded.updated_at",
                (bvid, text, provider, int(time.time())),
            )
            translated += 1
            if translated % 20 == 0:
                tconn.commit()  # 分批提交，断点续传时已落库行不丢
            if provider == "google" and sleep and sleep > 0:
                time.sleep(sleep)  # 免费接口限速，避免 429
            if progress:
                progress(i, total, reused, translated, failed)
        tconn.commit()
    finally:
        tconn.close()
    return {"total": total, "reused": reused, "translated": translated, "failed": failed}
