"""官方 API 同步脚本（biliboard.uk v2 — 新 API）
官方数据源已迁移：旧 s5.biliboard.uk/api/x/board 已失效，
新 API 与官网同域（biliboard.uk/api/public/...），至今每周仍在更新（2026-08 已验证）。

用法:
    python scripts/sync_official.py            # 只同步周榜首榜（推荐日常）
    python scripts/sync_official.py --all      # 同步周榜+传说曲榜+年榜
    python scripts/sync_official.py --songs    # 同步收录池（songs_all，无二创全池）
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DB = Path(r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\biliboard-database\表格写入sqlite\biliboard (11).db")

BOARD_IDS = {"weekly": 1, "legend": 2, "annual": 3}
PREFIXES = {"weekly": "official_", "legend": "legend_", "annual": "annual_"}

API = "https://biliboard.uk/api/public"
SONGS_URI = "/songs"
BOARDS_URI = "/boards"
ISSUES_URI = "/boards/{bid}/issues"
RANKINGS_URI = "/boards/{bid}/issues/{iid}/rankings"

SONGS_COLS = ["id", "bvid", "pubtime", "title", "title_cn",
              "first_recorded_at", "producers", "vocalists"]


def existing_issues(conn: sqlite3.Connection, prefix: str) -> set[int]:
    """已同步过的期号（以 issue_id 为准，跨表去重）。"""
    known: set[int] = set()
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    ).fetchall()
    for (name,) in rows:
        try:
            for (iid,) in conn.execute(f'SELECT DISTINCT issue_id FROM "{name}" WHERE issue_id IS NOT NULL'):
                known.add(iid)
        except sqlite3.Error:
            continue
    return known


def get_json(client: httpx.Client, url: str, **params) -> dict | list:
    resp = client.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _local_latest_date(conn: sqlite3.Connection, prefix: str) -> str | None:
    """本地已同步表名中最大的日期后缀（official_20260803 → 20260803）。"""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    ).fetchall()
    dates = []
    for (name,) in rows:
        suffix = name[len(prefix):]
        if len(suffix) == 8 and suffix.isdigit():
            dates.append(suffix)
    return max(dates) if dates else None


def sync_one(client: httpx.Client, conn: sqlite3.Connection, board_type: str,
             max_lookback: int = 8) -> dict:
    """按 issues 列表增量同步某榜。

    自动判断：先比对本地已有哪些期号，只下载远端有、本地没有的期次（增量）。
    返回 {new, remote_latest, local_latest, up_to_date}：
      new          - 本次新增期数
      remote_latest- biliboard 最新一期日期(YYYYMMDD)
      local_latest - 本地最新一期日期(YYYYMMDD) 或 None
      up_to_date   - 本地是否已与 biliboard 一致（无新增）
    """
    bid = BOARD_IDS[board_type]
    prefix = PREFIXES[board_type]
    known = existing_issues(conn, prefix)

    issues = get_json(client, f"{API}{ISSUES_URI.format(bid=bid)}")
    if not isinstance(issues, list) or not issues:
        print(f"  [{board_type}] 无 issues 数据")
        return {"new": 0, "remote_latest": None, "local_latest": None, "up_to_date": True}
    issues.sort(key=lambda x: x.get("id") or 0, reverse=True)

    remote_latest_date = None
    if issues[0].get("end_date"):
        remote_latest_date = datetime.fromtimestamp(
            issues[0]["end_date"], tz=timezone.utc
        ).strftime("%Y%m%d")
    local_latest = _local_latest_date(conn, prefix)

    synced = 0
    for issue in issues[:max_lookback]:
        iid = issue.get("issue_id") or issue.get("id")
        if not iid or iid in known:
            continue
        end_ts = issue.get("end_date") or 0
        date_key = datetime.fromtimestamp(end_ts, tz=timezone.utc).strftime("%Y%m%d")
        try:
            board = get_json(client, f"{API}{RANKINGS_URI.format(bid=bid, iid=iid)}")
        except httpx.HTTPStatusError:
            continue
        if not isinstance(board, list) or not board:
            continue
        table = f"{prefix}{date_key}"
        conn.execute(f'DROP TABLE IF EXISTS "{table}"')
        conn.execute(
            f"""CREATE TABLE "{table}" (rank INTEGER, bvid TEXT, title TEXT,
                view INTEGER, favorite INTEGER, coin INTEGER, like INTEGER,
                score REAL, pubtime INTEGER, issue_id INTEGER,
                weeks_on_board INTEGER, peak_rank INTEGER)"""
        )
        rows = []
        for r in board:
            stats = r.get("stats") or {}
            rows.append((
                r.get("rank"), r.get("bvid"), r.get("title"),
                stats.get("views") or 0, stats.get("favorites") or 0,
                stats.get("coins") or 0, stats.get("likes") or 0,
                r.get("score"), r.get("pubtime") or 0,
                iid,
                r.get("weeksOnBoard"), r.get("peakRank"),
            ))
        conn.executemany(f'INSERT INTO "{table}" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', rows)
        conn.commit()
        synced += 1
        print(f"  [{board_type}] 同步 {date_key}: {len(rows)} 条")
    return {
        "new": synced,
        "remote_latest": remote_latest_date,
        "local_latest": local_latest,
        "up_to_date": synced == 0,
    }


def sync_songs(client: httpx.Client, conn: sqlite3.Connection, per_page: int = 200) -> dict:
    """拉取官方收录池（无二创全池）增量写入 songs_all。

    先取远端总数与本地 songs_all 行数比对：本地已 ≥ 远端总数即视为最新，
    直接跳过逐页抓取（避免每次刷新都翻 12000+ 首）。
    返回 {added, remote_total, local_total, up_to_date}。"""
    try:
        first = get_json(client, f"{API}{SONGS_URI}", per_page=1, page=1)
        remote_total = first.get("total", 0) if isinstance(first, dict) else 0
    except Exception:  # noqa: BLE001
        remote_total = 0
    local_total = 0
    try:
        local_total = conn.execute("SELECT COUNT(*) FROM songs_all").fetchone()[0]
    except sqlite3.Error:
        local_total = 0

    if remote_total > 0 and local_total >= remote_total:
        print(f"  [songs] 已为最新（本地 {local_total} / 远端 {remote_total}）")
        return {"added": 0, "remote_total": remote_total,
                "local_total": local_total, "up_to_date": True}

    added = 0
    page = 1
    while True:
        payload = get_json(client, f"{API}{SONGS_URI}", per_page=per_page, page=page)
        items = payload.get("data") or [] if isinstance(payload, dict) else payload
        if not items:
            break
        for s in items:
            try:
                exists = conn.execute(
                    "SELECT 1 FROM songs_all WHERE bvid=?", (s.get("bvid"),)
                ).fetchone()
            except sqlite3.Error:
                exists = True
            if exists:
                continue
            conn.execute(
                f"INSERT OR IGNORE INTO songs_all ({', '.join(SONGS_COLS)}) "
                f"VALUES ({','.join('?' * len(SONGS_COLS))})",
                tuple(_as_text(s.get(c)) if c in ("producers", "vocalists")
                      else s.get(c) for c in SONGS_COLS),
            )
            conn.commit()
            added += 1
        if len(items) < per_page:
            break
        page += 1
    print(f"  [songs] 收录池新增 {added} 条（本地 {local_total} → {local_total + added}）")
    return {"added": added, "remote_total": remote_total,
            "local_total": local_total, "up_to_date": added == 0}


def _as_text(v) -> str | None:
    if v is None:
        return None
    return json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v


def run_pipeline(types: list[str] | tuple[str, ...] = ("weekly", "legend", "annual"),
                 songs: bool = False, rebuild_monthly: bool = True) -> dict:
    """执行完整同步流水线：增量拉取指定期次榜单 + 可选收录池 + 重建月榜。

    返回汇总：
      {
        boards:        {board: {new, remote_latest, local_latest, up_to_date}},
        songs:         {added, remote_total, local_total, up_to_date} | None,
        monthly_built: bool,
        checked:       [board, ...],
        all_up_to_date:bool,   # 所有已检查项均无新增时为 True
      }
    """
    import importlib.util

    summary: dict = {"boards": {}, "songs": None, "monthly_built": False,
                     "checked": [], "all_up_to_date": False}
    conn = sqlite3.connect(SOURCE_DB)
    try:
        with httpx.Client() as client:
            for bt in types:
                summary["boards"][bt] = sync_one(client, conn, bt)
                summary["checked"].append(bt)
            if songs:
                summary["songs"] = sync_songs(client, conn)
                summary["checked"].append("songs")
    finally:
        conn.close()

    if rebuild_monthly:
        try:
            spec = importlib.util.spec_from_file_location(
                "build_monthly", str(Path(__file__).resolve().parent / "build_monthly.py")
            )
            bm = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(bm)
            bm.main()
            summary["monthly_built"] = True
            print("[monthly] 月榜已重建")
        except Exception as e:  # noqa: BLE001
            print(f"[monthly] 重建失败: {e}")

    board_all_ok = all(b.get("up_to_date", False) for b in summary["boards"].values())
    songs_ok = True
    if songs and summary["songs"] is not None:
        songs_ok = summary["songs"].get("up_to_date", False)
    summary["all_up_to_date"] = board_all_ok and songs_ok
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="同步全部三榜")
    parser.add_argument("--songs", action="store_true", help="同步收录池 songs_all")
    parser.add_argument("--no-monthly", action="store_true", help="不同步后重建月榜")
    args = parser.parse_args()

    types = list(BOARD_IDS) if args.all else ["weekly"]
    summary = run_pipeline(
        types=types,
        songs=args.songs or args.all,
        rebuild_monthly=not args.no_monthly,
    )
    print("汇总:", json.dumps(summary, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()