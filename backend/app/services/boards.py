from __future__ import annotations

import re
import time

from ..core import db
from .rank import (
    DEFAULT_WEIGHTS,
    OLD_WEIGHTS,
    NEW_FORMULA_FROM_ISSUE,
    time_correction,
    time_correction_old,
)

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


# 进程内缓存：list_issues 结果仅在「同步写库」时变化。以 board_type 为 key，
# TTL 兜底（默认 600s）：最坏情况仅在新同步后 10 分钟内 issue 级元信息略旧，
# 且只影响 entries/is_annual 等元信息，不影响榜单正文（正文每次现读）。
_ISSUES_CACHE: dict[str, tuple[float, list[dict]]] = {}
_ISSUES_CACHE_TTL = 600.0


def invalidate_issues_cache(board_type: str | None = None) -> None:
    """同步写库成功后调用，使缓存失效（scripts/sync_official 可接入）。"""
    if board_type is None:
        _ISSUES_CACHE.clear()
    else:
        _ISSUES_CACHE.pop(board_type, None)


def list_issues(conn, board_type: str) -> list[dict]:
    """列出某榜全部期次（按日期降序）。结果进程内缓存（见 _ISSUES_CACHE）。"""
    now = time.monotonic()
    hit = _ISSUES_CACHE.get(board_type)
    if hit is not None and now - hit[0] < _ISSUES_CACHE_TTL:
        return hit[1]
    data = _list_issues_real(conn, board_type)
    _ISSUES_CACHE[board_type] = (now, data)
    return data


def _list_issues_real(conn, board_type: str) -> list[dict]:
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
            if board_type == "weekly":
                # weekly 表结构上不含 is_annual 列，直接跳过 PRAGMA 探测，立省 112 次查询
                is_annual = 0
            else:
                cols = {c[1] for c in conn.execute(f'PRAGMA table_info("{t}")').fetchall()}
                is_annual = 1 if "is_annual" in cols else 0
            sel = "COUNT(*) AS n, MIN(issue_id) AS iid" + (", MAX(is_annual) AS ia" if is_annual else ", 0 AS ia")
            row = conn.execute(f'SELECT {sel} FROM "{t}"').fetchone()
            is_annual = int(row["ia"] or 0) if row else 0
            n = int(row["n"]) if row else 0
            iid = row["iid"] if row else None
        except Exception:
            is_annual, n, iid = 0, 0, None
        issues.append({
            "issue": key,
            "date": f"{key[:4]}-{key[4:6]}-{key[6:]}",
            "entries": n,
            "is_annual": is_annual,
            "issue_id": iid,  # 官方期号（weekly/annual 表含该列；legend 表无）
        })
    issues.sort(key=lambda x: x["issue"], reverse=True)
    # 附加期序号（按日期升序，1-based）与公式版本。
    # 周榜以官方期号 54 为界（旧 <54：2·Δview·t + 30Δfav + 3Δlike + 10Δcoin；
    #                         新 ≥54：Δview·t + 15Δfav + 3Δlike + 30Δcoin）。
    # 优先用表内 issue_id（weekly 与官方期号精确对应）；legend/annual 表无 issue_id
    # 或不受该分界影响（其建立时间均晚于新公式时代），一律视为新公式。
    total = len(issues)
    for i, iss in enumerate(issues):
        iss["seq"] = total - i  # 列表为降序，最早的期 seq=1
        if board_type == "weekly" and iss["issue_id"] is not None:
            iss["formula_version"] = "old" if iss["issue_id"] < NEW_FORMULA_FROM_ISSUE else "new"
        else:
            iss["formula_version"] = "new"
    return issues


def latest_issue(conn, board_type: str) -> dict | None:
    issues = list_issues(conn, board_type)
    return issues[0] if issues else None


def _recalc(items: list[dict], board_type: str, issue_key: str, formula_version: str | None = None) -> list[dict]:
    """用自建公式（rank.py 口径）重算得分与排名，作为官方 score 的交叉核验列（self_score / self_rank）。

    得分 = 播放×t×w_view + 收藏×w_fav + 点赞×w_like + 投币×w_coin
    新公式（≥issue 54）w = (1, 15, 3, 30)；旧公式（<54）w = (2, 30, 3, 10)。
    t 为官方时间修正：
      · 新公式 anchor = 周期起点（前一期统计截止 = 本期结算日 − 7 天），投稿越接近周期起点加成越小
        （T[0]=1.0527 → T[6]=2.47）；
      · 旧公式 anchor = 本周期结束（本期结算日），D = floor((结束−投稿)/86400) 阶梯。
    注意：官方表存的是当期累计值（跨期差分会出现回退/0 分），故这里直接对当期累计值加权，
    仅用于「与官方 rank 对照」，真正的榜单排名始终采用官方 score。
    """
    vc, fc, lc, cc = METRIC_COLS[board_type]
    is_old = formula_version == "old"
    if is_old:
        w = OLD_WEIGHTS
        anchor = _settle_ts(issue_key)  # 旧公式以本周期结束为锚
    else:
        w = DEFAULT_WEIGHTS
        # 新公式以「周期起点 = 前一期统计截止」为锚，即本期结算日 − 7 天
        anchor = _settle_ts(issue_key) - 7 * 86400
    for d in items:
        pub = d.get("pubtime") or d.get("first_recorded_at") or 0
        if pub:
            t = time_correction_old(int(pub), anchor) if is_old else time_correction(int(pub), anchor)
        else:
            t = 2.47 if is_old else 1.0
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
    # 显式校验表存在：PRAGMA table_info 对缺失表静默返回空集（不抛异常），
    # 真正报 no such table 的是后续 SELECT，故必须查 sqlite_master 兜底。
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return []
    has_meta_cols = board_type != "weekly"  # weekly 表无 producers/vocalists 列，跳过 PRAGMA
    if has_meta_cols:
        cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
        has_meta_cols = "producers" in cols
    rows = conn.execute(f'SELECT * FROM "{table}" ORDER BY rank LIMIT ? OFFSET ?', (top, offset)).fetchall()
    out = []
    if has_meta_cols:
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
    # 公式分代：weekly 以官方 issue_id=54 为界；legend/annual 表无 issue_id 或均晚于新公式时代
    formula_version = "new"
    if board_type == "weekly":
        try:
            row = conn.execute(f'SELECT MIN(issue_id) AS iid FROM "{table}"').fetchone()
            iid = row["iid"] if row else None
            if iid is not None and iid < NEW_FORMULA_FROM_ISSUE:
                formula_version = "old"
        except Exception:
            pass
    return _recalc(out, board_type, issue_key, formula_version)


def get_song_issue(conn, board_type: str, issue_key: str, bvid: str) -> dict | None:
    if not ISSUE_RE.match(issue_key):
        return None
    table = _table_name(board_type, issue_key)
    # weekly 表无 producers/vocalists 列，直接跳过 PRAGMA 探测（get_song_history 循环内调用频繁）
    has_meta_cols = board_type != "weekly"
    if has_meta_cols:
        cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
        has_meta_cols = "producers" in cols
    r = conn.execute(f'SELECT * FROM "{table}" WHERE LOWER(bvid)=LOWER(?)', (bvid,)).fetchone()
    if not r:
        return None
    d = dict(r)
    if has_meta_cols:
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