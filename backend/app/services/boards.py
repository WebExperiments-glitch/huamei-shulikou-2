from __future__ import annotations

import re
import time

from ..core import db
from .rank import (
    CONTINUOUS_CURRENT_FROM_ISSUE,
    CONTINUOUS_EARLY_WEIGHTS,
    CONTINUOUS_FORMULA_FROM_ISSUE,
    DEFAULT_WEIGHTS,
    MID_WEIGHTS,
    OLD_WEIGHTS,
    NEW_FORMULA_FROM_ISSUE,
    time_correction,
    time_correction_mid,
    time_correction_old,
)

PREFIXES = {"weekly": "official_", "legend": "legend_", "annual": "annual_"}

BOARD_LABELS = {
    "weekly": "周榜",
    "legend": "传说曲周榜",
    "annual": "年榜/半年榜",
}

ISSUE_RE = re.compile(r"^(\d{8})$")

# 各榜原始指标列名的差异：周榜用 view，传说/年榜用 views/favorites/coins/likes。
# 顺序必须与 _recalc 中的解构 `vc, fc, lc, cc` 词义一致（view, favorite, like, coin）；
# 若把 coin/like 颠倒，会导致 like 值误按 coin 权重、coin 值误按 like 权重计算。
METRIC_COLS = {
    "weekly": ("view", "favorite", "like", "coin"),
    "legend": ("views", "favorites", "likes", "coins"),
    "annual": ("views", "favorites", "likes", "coins"),
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
                has_iid, has_ia = True, False
            else:
                cols = {c[1] for c in conn.execute(f'PRAGMA table_info("{t}")').fetchall()}
                # 注意：legend / 新式 annual 表没有 issue_id 列，必须按列存在与否动态拼 SELECT，
                # 否则 MIN(issue_id) 会抛 no such column，被下方 except 吞掉后 entries 恒为 0。
                has_iid = "issue_id" in cols
                has_ia = "is_annual" in cols
            iid_expr = "MIN(issue_id)" if has_iid else "NULL"
            ia_expr = "MAX(is_annual)" if has_ia else "0"
            sel = f"COUNT(*) AS n, {iid_expr} AS iid, {ia_expr} AS ia"
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
    # 附加期序号（按日期升序，1-based）与公式版本（前端显示用）。
    # formula_version 保留 old/new 二值（前端 badge 着色、得分拆解等兼容契约）；
    # formula_gen 为四代精确分代（周榜公式说明展示用，与 rank.py / _recalc 口径一致）：
    #   old(<54) / mid(54-102) / early(103-110) / current(≥111)。
    # 优先用表内 issue_id；legend/annual 表无 issue_id 或均晚于新公式时代，一律视为 current。
    total = len(issues)
    for i, iss in enumerate(issues):
        iss["seq"] = total - i  # 列表为降序，最早的期 seq=1
        iid = iss.get("issue_id")
        if board_type == "weekly" and iid is not None:
            iss["formula_version"] = "old" if iid < NEW_FORMULA_FROM_ISSUE else "new"
            if iid < NEW_FORMULA_FROM_ISSUE:
                iss["formula_gen"] = "old"
            elif iid < CONTINUOUS_FORMULA_FROM_ISSUE:
                iss["formula_gen"] = "mid"
            elif iid < CONTINUOUS_CURRENT_FROM_ISSUE:
                iss["formula_gen"] = "early"
            else:
                iss["formula_gen"] = "current"
        else:
            iss["formula_version"] = "new"
            iss["formula_gen"] = "current"
    return issues


def latest_issue(conn, board_type: str) -> dict | None:
    issues = list_issues(conn, board_type)
    return issues[0] if issues else None


def _recalc(items: list[dict], board_type: str, issue_key: str,
            formula_version: str | None = None, issue_id: int | None = None) -> list[dict]:
    """用自建公式（rank.py 口径）重算得分与排名，作为官方 score 的交叉核验列（self_score / self_rank）。

    四代公式，按 issue_id 自动选择（详见 docs/公式演变.md）：
      · 远古（<54）：得分 = 2·Δ播放×t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
        anchor = 本期结算日（时间锚点 = 结算日零点）
      · 中间（54 ≤ issue < 103）：得分 = Δ播放×t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
        anchor = 周期起点 = 结算日 − 7 天
      · 现行早期（103 ≤ issue < 111）：得分 = Δ播放×t + 30Δ收藏 + 3Δ点赞 + 15Δ投币
        anchor = 周期起点 = 结算日 − 7 天
      · 现行（≥111）：得分 = Δ播放×t + 15Δ收藏 + 3Δ点赞 + 30Δ投币
        anchor = 周期起点 = 结算日 − 7 天

    注意：官方表存的是当期累计值（跨期差分会出现回退/0 分），故这里直接对当期累计值加权，
    仅用于「与官方 rank 对照」，真正的榜单排名始终采用官方 score。
    """
    vc, fc, lc, cc = METRIC_COLS[board_type]
    settle_ts = _settle_ts(issue_key)

    # ---------- 确定公式代 ----------
    if formula_version == "old" or (issue_id is not None and issue_id < NEW_FORMULA_FROM_ISSUE):
        # 远古公式（<issue 54）
        w = OLD_WEIGHTS
        anchor = settle_ts
        for d in items:
            pub = d.get("pubtime") or d.get("first_recorded_at") or 0
            t = time_correction_old(int(pub), anchor) if pub else 2.47
            score = (d.get(vc) or 0) * w["view"] * t \
                + (d.get(fc) or 0) * w["favorite"] \
                + (d.get(lc) or 0) * w["like"] \
                + (d.get(cc) or 0) * w["coin"]
            d["self_score"] = round(score, 2)
            d["self_t"] = round(t, 4)
    elif issue_id is not None and issue_id < CONTINUOUS_FORMULA_FROM_ISSUE:
        # 中间公式（54 ≤ issue < 103）
        w = MID_WEIGHTS
        anchor = settle_ts - 7 * 86400
        for d in items:
            pub = d.get("pubtime") or d.get("first_recorded_at") or 0
            t = time_correction_mid(int(pub), anchor) if pub else 1.0
            score = (d.get(vc) or 0) * w["view"] * t \
                + (d.get(fc) or 0) * w["favorite"] \
                + (d.get(lc) or 0) * w["like"] \
                + (d.get(cc) or 0) * w["coin"]
            d["self_score"] = round(score, 2)
            d["self_t"] = round(t, 4)
    elif issue_id is not None and issue_id < CONTINUOUS_CURRENT_FROM_ISSUE:
        # 现行早期公式（103 ≤ issue < 111）：连续对数 t，收藏30/投币15
        w = CONTINUOUS_EARLY_WEIGHTS
        anchor = settle_ts - 7 * 86400
        for d in items:
            pub = d.get("pubtime") or d.get("first_recorded_at") or 0
            t = time_correction(int(pub), anchor) if pub else 1.0
            score = (d.get(vc) or 0) * w["view"] * t \
                + (d.get(fc) or 0) * w["favorite"] \
                + (d.get(lc) or 0) * w["like"] \
                + (d.get(cc) or 0) * w["coin"]
            d["self_score"] = round(score, 2)
            d["self_t"] = round(t, 4)
    else:
        # 现行公式（≥issue 111）：连续对数 t，收藏15/投币30
        w = DEFAULT_WEIGHTS
        anchor = settle_ts - 7 * 86400
        for d in items:
            pub = d.get("pubtime") or d.get("first_recorded_at") or 0
            t = time_correction(int(pub), anchor) if pub else 1.0
            score = (d.get(vc) or 0) * w["view"] * t \
                + (d.get(fc) or 0) * w["favorite"] \
                + (d.get(lc) or 0) * w["like"] \
                + (d.get(cc) or 0) * w["coin"]
            d["self_score"] = round(score, 2)
            d["self_t"] = round(t, 4)

    # self_rank 用按 self_score 降序的副本确定名次，但不改动 items 本身的官方顺序
    # （官方 rank 顺序由调用方 SQL 的 ORDER BY rank 保证，这里不得原地排序打乱它，
    #   否则 rankings 接口返回的数组顺序会与官方排名不一致——曾导致前端列表顺序错乱）。
    ranked = sorted(items, key=lambda r: (r["self_score"], r.get(vc) or 0), reverse=True)
    for i, d in enumerate(ranked, 1):
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
    issue_id = None
    if board_type == "weekly":
        try:
            row = conn.execute(f'SELECT MIN(issue_id) AS iid FROM "{table}"').fetchone()
            issue_id = row["iid"] if row else None
            if issue_id is not None and issue_id < NEW_FORMULA_FROM_ISSUE:
                formula_version = "old"
        except Exception:
            pass
    return _recalc(out, board_type, issue_key, formula_version, issue_id)


def get_song_issue(conn, board_type: str, issue_key: str, bvid: str) -> dict | None:
    if not ISSUE_RE.match(issue_key):
        return None
    table = _table_name(board_type, issue_key)
    # 显式校验表存在：PRAGMA table_info 对缺失表静默返回空集，真正报错的是后续 SELECT，
    # 故必须先查 sqlite_master（AI 智能体可能传入格式合法但不存在的期键）。
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if not exists:
        return None
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