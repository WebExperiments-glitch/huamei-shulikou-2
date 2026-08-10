from __future__ import annotations

import sqlite3
import re

from fastapi import APIRouter, HTTPException, Query

from ..core import db

router = APIRouter(prefix="/api", tags=["self-built"])

MONTH_RE = re.compile(r"^monthly_(\d{6})$")
DAILY_RE = re.compile(r"^daily_(\d{8})$")


def _list_from(conn: sqlite3.Connection, prefix: str, pattern: re.Pattern) -> list[dict]:
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    )]
    out = []
    for t in tables:
        m = pattern.match(t)
        if not m:
            continue
        key = m.group(1)
        try:
            n = conn.execute(f'SELECT COUNT(*) AS n FROM "{t}"').fetchone()["n"]
        except Exception:
            n = 0
        out.append({"issue": key, "entries": n})
    out.sort(key=lambda x: x["issue"], reverse=True)
    return out


@router.get("/monthly/issues")
def monthly_issues():
    conn = db.connect_monthly()
    try:
        return {"issues": _list_from(conn, "monthly_", MONTH_RE)}
    finally:
        conn.close()


@router.get("/monthly/issues/{issue}/rankings")
def monthly_rankings(issue: str, top: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    if not MONTH_RE.match(f"monthly_{issue}"):
        raise HTTPException(404, "无效月份")
    conn = db.connect_monthly()
    try:
        rows = conn.execute(
            f'SELECT * FROM "monthly_{issue}" ORDER BY rank LIMIT ? OFFSET ?', (top, offset)
        ).fetchall()
        return {"issue": issue, "month": f"{issue[:4]}-{issue[4:]}", "items": [dict(r) for r in rows]}
    except sqlite3.OperationalError:
        raise HTTPException(404, "该月无数据")
    finally:
        conn.close()


@router.get("/daily/issues")
def daily_issues():
    conn = db.connect_daily()
    try:
        return _list_from(conn, "daily_", DAILY_RE)
    finally:
        conn.close()


@router.get("/daily/issues/{issue}/rankings")
def daily_rankings(issue: str, top: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    if not DAILY_RE.match(f"daily_{issue}"):
        raise HTTPException(404, "无效日期")
    conn = db.connect_daily()
    try:
        rows = conn.execute(
            f'SELECT rank, bvid, name, view, favorite, coin, share, like, score FROM "daily_{issue}" '
            "ORDER BY rank LIMIT ? OFFSET ?", (top, offset)
        ).fetchall()
        return {"issue": issue, "date": f"{issue[:4]}-{issue[4:6]}-{issue[6:]}", "items": [dict(r) for r in rows]}
    except sqlite3.OperationalError:
        raise HTTPException(404, "该日无数据")
    finally:
        conn.close()