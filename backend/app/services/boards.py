from __future__ import annotations

import re

from ..core import db
from .rank import DEFAULT_WEIGHTS, time_correction

PREFIXES = {"weekly": "official_", "legend": "legend_", "annual": "annual_"}

BOARD_LABELS = {
    "weekly": "周榜",
    "legend": "传说曲周榜",
    "annual": "年榜/半年榜",
}

ISSUE_RE = re.compile(r"^(\d{8})$")

# 各榜原始指标列名的差异：周榜用 view，传说/年榜用 views/favorites/coins/likes
METRIC_COLS = {
    "weekly": ("view", "favorite", "coin", "like"),
    "legend": ("views", "favorites", "coins", "likes"),
    "annual": ("views", "favorites", "coins", "likes"),
}


def _table_name(board_type: str, issue_key: str) -> str:
    return f"{PREFIXES[board_type]}{issue_key}"


def list_issues(conn, board_type: str) -> list[dict]:
    """列出某榜全部期次（按日期降序）。"""
    prefix = PREFIXES[board_type]
    tables = [
        r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ? ORDER BY name",
            (f"{prefix}%",),
        )
    ]
    issues = []
    for t in tables:
        key = t[len(prefix):]
        if not ISSUE_RE.match(key):
            continue
        try:
            row = conn.execute(f'SELECT is_annual, COUNT(*) AS n FROM "{t}"').fetchone()
            is_annual = int(row["is_annual"] or 0) if row else 0
            n = int(row["n"]) if row else 0
        except Exception:
            is_annual, n = 0, 0
        issues.append({
            "issue": key,
            "date": f"{key[:4]}-{key[4:6]}-{key[6:]}",
            "entries": n,
            "is_annual": is_annual,
        })
    issues.sort(key=lambda x: x["issue"], reverse=True)
    return issues


def latest_issue(conn, board_type: str) -> dict | None:
    issues = list_issues(conn, board_type)
    return issues[0] if issues else None


def _recalc(items: list[dict], board_type: str, issue_key: str) -> list[dict]:
    """用自建公式（rank.py 口径）重算得分与排名：
    得分 = 播放×t + 收藏×15 + 点赞×3 + 投币×30，t = 官方时间修正（投稿越接近结算日加成越大）。

    官方表存的是当期累计值（非全量快照，跨期差分会出现数据回退/0 分），
    故直接对当期值加权，与官方 score 同口径。官方 score/rank 保留为对照字段。
    """
    vc, fc, lc, cc = METRIC_COLS[board_type]
    w = DEFAULT_WEIGHTS
    settle_ts = _settle_ts(issue_key)

    for d in items:
        pub = d.get("pubtime") or d.get("first_recorded_at") or 0
        t = time_correction(int(pub), settle_ts) if pub else 1.0
        score = (d.get(vc) or 0) * w["view"] * t \
            + (d.get(fc) or 0) * w["favorite"] \
            + (d.get(lc) or 0) * w["like"] \
            + (d.get(cc) or 0) * w["coin"]
        d["self_score"] = round(score, 2)
        d["self_t"] = round(t, 4)
    items.sort(key=lambda r: (r["self_score"], r.get(vc) or 0), reverse=True)
    for i, d in enumerate(items, 1):
        d["self_rank"] = i
    return items


def _settle_ts(issue_key: str) -> int:
    """期键 YYYYMMDD → 结算日零点 unix 时间戳。"""
    from datetime import datetime
    dt = datetime.strptime(issue_key, "%Y%m%d")
    return int(dt.timestamp())


def get_issue_rankings(conn, board_type: str, issue_key: str, top: int = 100, offset: int = 0) -> list[dict]:
    if not ISSUE_RE.match(issue_key):
        return []
    table = _table_name(board_type, issue_key)
    cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
    rows = conn.execute(f'SELECT * FROM "{table}" ORDER BY rank LIMIT ? OFFSET ?', (top, offset)).fetchall()
    out = []
    if "producers" in cols:
        for r in rows:
            d = dict(r)
            d["producers"] = db.parse_json_list(d.get("producers"))
            d["vocalists"] = db.parse_json_list(d.get("vocalists"))
            out.append(d)
    else:
        # 旧结构榜单表无 producers/vocalists 列 → 从 songs_all 批量补齐
        bvids = [r["bvid"] for r in rows]
        meta: dict[str, dict] = {}
        if bvids:
            placeholders = ",".join("?" * len(bvids))
            for m in conn.execute(
                f"SELECT bvid, producers, vocalists FROM songs_all WHERE bvid IN ({placeholders})",
                tuple(bvids),
            ):
                md = dict(m)
                meta[md["bvid"]] = {
                    "producers": db.parse_json_list(md.get("producers")),
                    "vocalists": db.parse_json_list(md.get("vocalists")),
                }
        for r in rows:
            d = dict(r)
            m = meta.get(d["bvid"], {})
            d["producers"] = m.get("producers", [])
            d["vocalists"] = m.get("vocalists", [])
            out.append(d)
    return _recalc(out, board_type, issue_key)


def get_song_issue(conn, board_type: str, issue_key: str, bvid: str) -> dict | None:
    if not ISSUE_RE.match(issue_key):
        return None
    table = _table_name(board_type, issue_key)
    cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
    r = conn.execute(f'SELECT * FROM "{table}" WHERE LOWER(bvid)=LOWER(?)', (bvid,)).fetchone()
    if not r:
        return None
    d = dict(r)
    if "producers" in cols:
        d["producers"] = db.parse_json_list(d.get("producers"))
        d["vocalists"] = db.parse_json_list(d.get("vocalists"))
    else:
        m = conn.execute(
            "SELECT producers, vocalists FROM songs_all WHERE LOWER(bvid)=LOWER(?)", (bvid,)
        ).fetchone()
        d["producers"] = db.parse_json_list(m["producers"]) if m else []
        d["vocalists"] = db.parse_json_list(m["vocalists"]) if m else []
    return d


def get_song_history(conn, board_type: str, bvid: str) -> list[dict]:
    """单曲在某榜全部上榜历史（跨期，正序）。"""
    issues = list_issues(conn, board_type)
    rows = []
    for iss in issues:
        d = get_song_issue(conn, board_type, iss["issue"], bvid)
        if d:
            d["issue"] = iss["issue"]
            d["issue_date"] = iss["date"]
            rows.append(d)
    rows.sort(key=lambda x: x["issue"])
    return rows


def get_issue_sparklines(conn, board_type: str, issue_key: str, count: int = 10) -> dict:
    """某期榜单内每首歌在最近 count 期（含当期）的排名序列，用于表格行内 sparkline。

    返回 { bvid: [rank|None, ...] }（按时间升序，缺失期用 None 占位）。
    实现上每个窗口期只整表读取一次，整体复杂度 O(窗口期数) 而非 O(歌曲数)，
    避免对上百首歌曲各自逐期查询。
    """
    if board_type not in PREFIXES or not ISSUE_RE.match(issue_key):
        return {}
    issues = sorted(list_issues(conn, board_type), key=lambda x: x["issue"])
    idx = next((i for i, iss in enumerate(issues) if iss["issue"] == issue_key), None)
    if idx is None:
        return {}
    window = issues[max(0, idx - count + 1): idx + 1]
    cur_table = _table_name(board_type, issue_key)
    bvids = [r["bvid"] for r in conn.execute(f'SELECT bvid FROM "{cur_table}" ORDER BY rank')]
    series: dict[str, list] = {b: [None] * len(window) for b in bvids}
    for wi, iss in enumerate(window):
        t = _table_name(board_type, iss["issue"])
        try:
            for r in conn.execute(f'SELECT bvid, rank FROM "{t}"'):
                if r["bvid"] in series:
                    series[r["bvid"]][wi] = r["rank"]
        except Exception:
            continue
    return series


def get_reentry_tracks(conn, board_type: str = "legend", top: int = 200) -> list[dict]:
    """历史二次上榜追踪：统计每首曲目在榜上的全部上榜段。

    分段规则：歌连续在相邻两期出现视为同一段；某期掉榜（表中消失）后再出现
    即开启新段。weeks_on_board 仅作参考（官方跨掉榜累计，不能用来分段）。
    返回 segment_count >= 2 的"二次上榜"曲目，附每段起止期/周数/最佳排名。
    """
    issues = list_issues(conn, board_type)
    issues_asc = sorted(issues, key=lambda x: x["issue"])
    issue_idx = {iss["issue"]: i for i, iss in enumerate(issues_asc)}
    records: dict[str, list[dict]] = {}
    for iss in reversed(issues):
        table = _table_name(board_type, iss["issue"])
        cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
        cols_sql = ", ".join(c for c in ("bvid", "title", "rank", "weeks_on_board", "peak_rank", "rate") if c in cols)
        if "bvid" not in cols or "rank" not in cols:
            continue
        for r in conn.execute(f'SELECT {cols_sql} FROM "{table}"'):
            d = dict(r)
            d["issue"] = iss["issue"]
            records.setdefault(d["bvid"], []).append(d)

    out = []
    for bvid, recs in records.items():
        recs.sort(key=lambda x: x["issue"])
        segments = []
        cur = None
        prev_issue = None
        for rec in recs:
            idx = issue_idx.get(rec["issue"])
            prev_idx = issue_idx.get(prev_issue) if prev_issue else None
            is_new = (
                cur is None
                or prev_idx is None
                or idx is None
                or idx != prev_idx + 1
            )
            if is_new:
                cur = {
                    "start": rec["issue"],
                    "end": rec["issue"],
                    "weeks": 1,
                    "best_rank": rec["rank"],
                }
                segments.append(cur)
            else:
                cur["end"] = rec["issue"]
                cur["weeks"] += 1
                cur["best_rank"] = min(cur["best_rank"], rec["rank"])
            prev_issue = rec["issue"]
        if len(segments) >= 2:
            out.append({
                "bvid": bvid,
                "title": recs[0].get("title", ""),
                "segment_count": len(segments),
                "latest_issue": recs[-1]["issue"],
                "total_weeks": sum(s["weeks"] for s in segments),
                "segments": segments,
            })

    out.sort(key=lambda x: (-x["segment_count"], x["latest_issue"]), reverse=False)
    return out[:top]