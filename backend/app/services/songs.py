from __future__ import annotations

import re
import sqlite3

import httpx
import json
import subprocess
import sys
import time

from ..core import db
from ..core import cache as cache_mod
from ..core import config
from . import rank as rank_svc

BOARD_TABLES = {
    "weekly": "official_",
    "legend": "legend_",
    "annual": "annual_",
}

# 殿堂/传说/神话 播放量阈值（B 站 VOCALOID 圈惯例）
TIER_THRESHOLDS = [
    ("myth", 10_000_000),    # 神话曲：千万播放
    ("legend", 1_000_000),   # 传说曲：百万播放
    ("hall", 100_000),       # 殿堂曲：十万播放
]

# 模块级缓存：源库为只读，重扫 100+ 表较贵。
# 改用进程级持久化 SQL 缓存（app.core.cache），按 TTL 自动失效、重启不丢，
# 不再需要「改完后端手动重启」来刷新指标。
_METRICS_TTL = 1800    # 30 分钟
_BOARD_STATS_TTL = 1800
_NAMES_TTL = 3600      # 1 小时

# B 站 BV 号：固定 BV + 10 位 Base58 字符（大小写敏感，匹配时统一 LOWER）
_BV_RE = re.compile(r"BV[0-9A-Za-z]{10}", re.I)


def _tier(view: int | None) -> str | None:
    if not view:
        return None
    for name, thr in TIER_THRESHOLDS:
        if view >= thr:
            return name
    return None


def _board_stats(conn: sqlite3.Connection) -> dict[str, dict]:
    """每首歌跨三榜的上榜统计：上榜周数、最佳排名、上榜类型、最近上榜期。"""
    stats: dict[str, dict] = {}
    for bt, prefix in BOARD_TABLES.items():
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
                (f"{prefix}%",),
            )
        ]
        for t in tables:
            key = t[len(prefix):]
            if not (len(key) == 8 and key.isdigit()):
                continue
            try:
                rows = conn.execute(f'SELECT bvid, rank FROM "{t}"').fetchall()
            except Exception:
                continue
            for bvid, rank in rows:
                bvid = (bvid or "").upper()
                s = stats.setdefault(bvid, {"weeks": 0, "best_rank": 999, "boards": set(), "last_issue": ""})
                s["weeks"] += 1
                s["best_rank"] = min(s["best_rank"], rank)
                s["boards"].add(bt)
                if key > s["last_issue"]:
                    s["last_issue"] = key
    for s in stats.values():
        s["boards"] = sorted(s["boards"])
    return stats


def _build_metrics(conn: sqlite3.Connection) -> dict[str, dict]:
    """聚合每首歌「最佳已知指标」：跨 data* 快照表 + legend_/annual_ 榜单表。

    取播放量最高的一次快照作为该曲的完整指标记录（view/favorite/coin/like/share/score）。
    覆盖量受源数据限制：仅 data*/legend/annual 中出现过的歌曲有指标，未上榜歌曲为 None。
    """
    metrics: dict[str, dict] = {}

    def update(bvid, view, favorite, coin, like, share=0, score=0):
        if not bvid:
            return
        bvid = bvid.upper()  # B站 bvid 规范为大写 BV；源表偶有小写，统一以避免 join 失败
        view = int(view or 0)
        cur = metrics.get(bvid)
        if cur is None or view > cur["view"]:
            metrics[bvid] = {
                "view": view,
                "favorite": int(favorite or 0),
                "coin": int(coin or 0),
                "like": int(like or 0),
                "share": int(share or 0),
                "score": int(score or 0),
            }

    # 1) data* 快照表：bv, view, favorite, coin, share, like（周级时序，覆盖最广）
    data_tables = [
        r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data%'"
        )
    ]
    for t in data_tables:
        try:
            rows = conn.execute(
                f'SELECT bv, view, favorite, coin, share, like FROM "{t}"'
            ).fetchall()
        except Exception:
            continue
        for r in rows:
            update(r["bv"], r["view"], r["favorite"], r["coin"], r["like"], r["share"])

    # 2) legend_/annual_ 榜单表：views, likes, coins, favorites, score
    for prefix in ("legend_", "annual_"):
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
                (f"{prefix}%",),
            )
        ]
        for t in tables:
            key = t[len(prefix):]
            if not (len(key) == 8 and key.isdigit()):
                continue
            try:
                rows = conn.execute(
                    f'SELECT bvid, views, likes, coins, favorites, score FROM "{t}"'
                ).fetchall()
            except Exception:
                continue
            for r in rows:
                update(r["bvid"], r["views"], r["favorites"], r["coins"], r["likes"], 0, r["score"])

    # 3) hot.sqlite 实时缓存（backfill_metrics.py 补抓的全池实时指标）。
    #    hot_cache 中 status='ok' 的歌曲以「实时最新值」并入，补齐无历史快照的覆盖缺口。
    from . import crawler  # 延迟导入避免循环依赖

    try:
        hot = crawler.connect_hot(readonly=True)
        try:
            rows = hot.execute(
                "SELECT bvid, view, favorite, coin, like, share FROM hot_cache WHERE status='ok'"
            ).fetchall()
        finally:
            hot.close()
        for r in rows:
            update(r["bvid"], r["view"], r["favorite"], r["coin"], r["like"], r["share"])
    except Exception:
        pass  # hot 库不可用/未初始化时静默跳过，不影响历史指标

    return metrics


def _get_board_stats(conn: sqlite3.Connection) -> dict:
    hit, v = cache_mod.cache_get_json("songs:board_stats")
    if hit:
        return v
    s = _board_stats(conn)
    cache_mod.cache_put_json("songs:board_stats", s, ttl=_BOARD_STATS_TTL)
    return s


def _get_metrics(conn: sqlite3.Connection) -> dict:
    hit, v = cache_mod.cache_get_json("songs:metrics")
    if hit:
        return v
    m = _build_metrics(conn)
    cache_mod.cache_put_json("songs:metrics", m, ttl=_METRICS_TTL)
    return m


def _to_item(r, stats: dict, metrics: dict) -> dict:
    d = dict(r)
    d["producers"] = db.parse_json_list(d.get("producers"))
    d["vocalists"] = db.parse_json_list(d.get("vocalists"))
    bvid_key = (d["bvid"] or "").upper()
    s = stats.get(bvid_key)
    d["weeks_on_board"] = s["weeks"] if s else 0
    d["best_rank"] = s["best_rank"] if s else None
    d["boards"] = s["boards"] if s else []
    m = metrics.get(bvid_key)
    if m:
        d["view"] = m["view"]
        d["favorite"] = m["favorite"]
        d["coin"] = m["coin"]
        d["like"] = m["like"]
        d["share"] = m["share"]
        d["peak_score"] = m["score"]
        d["tier"] = _tier(m["view"])
    else:
        d["view"] = None
        d["favorite"] = None
        d["coin"] = None
        d["like"] = None
        d["share"] = None
        d["peak_score"] = None
        d["tier"] = None
    return d


def _like(q: str) -> str:
    """转义 SQL LIKE 通配符（% _ \），再前后包 %，配合 ESCAPE '\\' 使用。

    否则用户输入 % 或 _ 会被当作通配符，导致联想/搜索异常（如输入 % 匹配全部）。
    """
    esc = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"


def search_songs(
    conn,
    *,
    q: str = "",
    producer: str | None = None,
    vocalist: str | None = None,
    limit: int = 50,
    offset: int = 0,
    sort: str = "id",
    order: str = "desc",
    board: str | None = None,
    min_weeks: int = 0,
    tier: str | None = None,
    min_view: int | None = None,
    max_view: int | None = None,
    pub_from: int | None = None,
    pub_to: int | None = None,
) -> dict:
    """收录池检索（重写版）。

    筛选维度：
      - q：标题 / 中文名 / bvid 片段
      - producer / vocalist：按解析后的 name 子串匹配（不再误命中 URL）
      - board：仅显示上过指定榜的歌曲（weekly/legend/annual）
      - min_weeks：上榜总周数下限
      - tier：殿堂/传说/神话/has（有指标）/none（无指标）
      - min_view / max_view：播放量区间
      - pub_from / pub_to：投稿时间区间（unix 秒）
    排序：id|pubtime|weeks|best_rank|view|favorite|coin|like|score
    每首歌均注入 view/favorite/coin/like/share/peak_score/tier（无则 None）。
    """
    where, params = [], []
    if q:
        q = q.strip()
        m = _BV_RE.search(q)
        # 来自 B 站视频链接（含 /video/）或整条即纯 BV 号 → 精确匹配 bvid，
        # 避免把整条 URL 当 LIKE 子串去匹配 bvid 列而失效
        is_bv = bool(m) and (
            "/video/" in q.lower()
            or re.fullmatch(r"BV[0-9A-Za-z]{10}", m.group(0), re.I) is not None
        )
        if is_bv:
            where.append("LOWER(bvid) = LOWER(?)")
            params.append(m.group(0))
        else:
            where.append(
                "(title LIKE ? ESCAPE '\\' OR title_cn LIKE ? ESCAPE '\\' OR bvid LIKE ? ESCAPE '\\')"
            )
            params += [_like(q), _like(q), _like(q)]
    if pub_from is not None:
        where.append("pubtime >= ?")
        params.append(int(pub_from))
    if pub_to is not None:
        where.append("pubtime <= ?")
        params.append(int(pub_to))
    sql_where = f"WHERE {' AND '.join(where)}" if where else ""

    stats = _get_board_stats(conn)
    metrics = _get_metrics(conn)

    rows = conn.execute(
        f"SELECT id, bvid, title, title_cn, pubtime, first_recorded_at, producers, vocalists "
        f"FROM songs_all {sql_where}",
        tuple(params),
    ).fetchall()

    items: list[dict] = []
    for r in rows:
        d = _to_item(r, stats, metrics)
        # producer / vocalist：按解析后的 name 子串匹配
        if producer:
            names = " / ".join(p.get("name", "") for p in d["producers"])
            if producer.lower() not in names.lower():
                continue
        if vocalist:
            names = " / ".join(v.get("name", "") for v in d["vocalists"])
            if vocalist.lower() not in names.lower():
                continue
        # board / min_weeks
        if board and not (d["boards"] and board in d["boards"]):
            continue
        if min_weeks and not (d["weeks_on_board"] or 0) >= min_weeks:
            continue
        # tier
        if tier == "has" and d["tier"] is None:
            continue
        if tier == "none" and d["tier"] is not None:
            continue
        if tier in ("hall", "legend", "myth") and d["tier"] != tier:
            continue
        # view 区间
        v = d["view"]
        if min_view is not None and (v is None or v < min_view):
            continue
        if max_view is not None and (v is None or v > max_view):
            continue
        items.append(d)

    reverse = order == "desc"
    if sort in ("view", "favorite", "coin", "like"):
        items.sort(key=lambda d: d.get(sort) or -1, reverse=reverse)
    elif sort == "score":
        items.sort(key=lambda d: d.get("peak_score") or -1, reverse=reverse)
    elif sort == "weeks":
        items.sort(key=lambda d: d.get("weeks_on_board") or 0, reverse=reverse)
    elif sort == "best_rank":
        items.sort(key=lambda d: d.get("best_rank") or 999, reverse=reverse)
    elif sort == "pubtime":
        items.sort(key=lambda d: d.get("pubtime") or 0, reverse=reverse)
    else:  # id
        items.sort(key=lambda d: d.get("id") or 0, reverse=reverse)

    total = len(items)
    page = items[offset: offset + limit]
    return {"total": total, "items": page}


def suggest(conn, q: str, limit: int = 8) -> list[dict]:
    """轻量曲名/bvid 联想：只取 bvid/title/title_cn，前缀优先于子串，不触发 _to_item。"""
    if not q:
        return []
    ql = q.lower()
    pat = _like(ql)
    rows = conn.execute(
        "SELECT bvid, title, title_cn FROM songs_all "
        "WHERE LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(title_cn) LIKE ? ESCAPE '\\' OR LOWER(bvid) LIKE ? ESCAPE '\\' "
        "LIMIT 400",
        (pat, pat, pat),
    ).fetchall()
    scored = []
    for r in rows:
        title = r["title"] or ""
        title_cn = r["title_cn"] or ""
        tl = title.lower()
        cl = title_cn.lower()
        bl = (r["bvid"] or "").lower()
        # 前缀命中排最前，其次 bvid 命中，最后子串
        if tl.startswith(ql) or cl.startswith(ql) or bl.startswith(ql):
            pri = 0
        elif bl == ql:
            pri = 1
        else:
            pri = 2
        scored.append((pri, title, r))
    scored.sort(key=lambda x: (x[0], x[1]))
    return [
        {"bvid": r["bvid"], "title": r["title"], "title_cn": r["title_cn"]}
        for _, _, r in scored[:limit]
    ]


def _get_names(conn, role: str) -> list[tuple[str, int]]:
    hit, v = cache_mod.cache_get_json(f"songs:names:{role}")
    if hit:
        return v
    names: dict[str, int] = {}
    for r in conn.execute(f"SELECT {role} FROM songs_all").fetchall():
        for p in db.parse_json_list(r[role]):
            name = (p.get("name") or "").strip()
            if name:
                names[name] = names.get(name, 0) + 1
    out = sorted(names.items(), key=lambda kv: (-kv[1], kv[0]))
    cache_mod.cache_put_json(f"songs:names:{role}", out, ttl=_NAMES_TTL)
    return out


def suggest_names(conn, role: str, q: str, limit: int = 8) -> list[dict]:
    """P主/歌姬名称联想：从收录池角色字段聚合（带参与歌曲数），前缀优先。"""
    if role not in ("producers", "vocalists"):
        return []
    if not q:
        return []
    ql = q.lower()
    out = []
    for name, cnt in _get_names(conn, role):
        nl = name.lower()
        if nl.startswith(ql):
            pri = 0
        elif ql in nl:
            pri = 1
        else:
            continue
        out.append((pri, name, {"name": name, "count": cnt}))
    out.sort(key=lambda x: (x[0], -x[2]["count"], x[1]))
    return [d for _, _, d in out[:limit]]


def score_breakdown(conn, bvid: str, board_type: str = "weekly") -> dict:
    """单曲在某榜的「得分因子拆解（透明参考）」。

    说明：官方榜单表存的是【当期累计】指标（view/favorite/coin/like 或其复数形式），
    并非相邻周之间的【增量快照】，跨期差分会出现数据回退（负增量），因此无法用 Δ
    公式忠实复算官方得分（详见 rank.py 文档与源码研读笔记）。

    本接口返回的是【因子构成参考】：对每个上榜期，取当期累计指标，按该期应当使用的
    公式代（周榜以第 54 期为界；旧<54 / 新≥54）的权重与时间修正 t 计算各因子贡献
    comp_* = metric × weight × (t 仅作用于播放)。comp_* 之和反映「若按累计值加权，
    各因子相对占比」，用于直观说明一首歌的分数从哪来；它不等于官方得分（官方用 Δ）。

    真正的「可核验」由前端公式试算器承担：填入任意 Δ 增量即可按文档公式精确复算。

    返回：formula_version / weights / entries[]（每期官方分、原始指标、t、各因子贡献）。
    """
    from ..services import boards as boards_svc  # 延迟导入，避免循环依赖

    if board_type not in ("weekly", "legend", "annual"):
        board_type = "weekly"

    # 该榜全部期次（升序）。官方期号以表内 issue_id 为准（weekly 从 2 起，
    # 与升序位置相差 1，不可用位置号判断公式版本）；legend/annual 无 issue_id，一律新公式。
    issues = sorted(boards_svc.list_issues(conn, board_type), key=lambda x: x["issue"])
    issue_index: dict[str, int] = {
        iss["issue"]: iss.get("issue_id") or 0 for iss in issues
    }

    history = boards_svc.get_song_history(conn, board_type, bvid)
    if not history:
        return {
            "bvid": bvid, "board_type": board_type,
            "formula_version": "new", "weights": dict(rank_svc.DEFAULT_WEIGHTS),
            "entries": [],
        }

    # 规整列名：周榜为单数，传说/年榜为复数
    def norm(r: dict) -> dict:
        out = dict(r)
        if "views" in out and "view" not in out:
            out["view"] = out.get("views")
        if "favorites" in out and "favorite" not in out:
            out["favorite"] = out.get("favorites")
        if "coins" in out and "coin" not in out:
            out["coin"] = out.get("coins")
        if "likes" in out and "like" not in out:
            out["like"] = out.get("likes")
        return out

    song = get_song(conn, bvid)
    song_pub = (song or {}).get("pubtime")

    def ts_of(issue_key: str) -> int:
        from datetime import datetime
        try:
            return int(datetime.strptime(issue_key, "%Y%m%d").timestamp())
        except Exception:
            return 0

    entries = []
    prev_issue = None
    for raw in history:
        r = norm(raw)
        issue = r.get("issue", "")
        idx = issue_index.get(issue, 0)
        is_old = board_type == "weekly" and idx > 0 and idx < rank_svc.NEW_FORMULA_FROM_ISSUE
        formula_version = "old" if is_old else "new"
        w = rank_svc.OLD_WEIGHTS if is_old else rank_svc.DEFAULT_WEIGHTS

        cur_ts = ts_of(issue)
        # 时间修正锚点：新公式以「周期起点（前一期截止 = cur_ts − 7 天）」为锚；
        # 旧公式以本周期结束为锚 = cur_ts（D = floor((end-pub)/86400)）。
        if formula_version == "new":
            anchor = cur_ts - 7 * 86400  # 修正：周期起点 = 本 issue 起点，非 issue 当天（周期终点）
            pub = r.get("pubtime") or song_pub
            t = rank_svc.time_correction(int(pub or 0), anchor) if pub else 1.0
            t_assumed = pub is None
        else:
            anchor = cur_ts
            pub = r.get("pubtime") or song_pub
            t = rank_svc.time_correction_old(int(pub or 0), anchor) if pub else 2.47
            t_assumed = pub is None

        view = r.get("view")
        favorite = r.get("favorite")
        coin = r.get("coin")
        like = r.get("like")

        def safe(m, ww):
            return (int(m or 0)) * ww if m is not None else None

        comp_favorite = safe(favorite, w["favorite"]) if favorite is not None else None
        comp_like = safe(like, w["like"]) if like is not None else None
        comp_coin = safe(coin, w["coin"]) if coin is not None else None
        known = (comp_favorite or 0) + (comp_like or 0) + (comp_coin or 0)

        # 官方周榜表 view 列恒为 0（未收录播放量字段），但官方分内含播放贡献。
        # 当 view 缺失时，由「官方分 − 已知三因子贡献」反推播放贡献，使四因子之和=官方分，
        # 从而可核验公式成立；view_implied 标记表示该项为反推值。
        view_implied = False
        if view is not None and view > 0:
            comp_view = safe(view, w["view"] * t)
        else:
            off = r.get("score")
            if off is not None:
                comp_view = round(off - known, 2)
                view_implied = True
            else:
                comp_view = None

        entries.append({
            "issue": issue,
            "issue_date": r.get("issue_date", ""),
            "rank": r.get("rank"),
            "official_score": r.get("score"),
            "view": view,
            "favorite": favorite,
            "coin": coin,
            "like": like,
            "pubtime": pub,
            "t": round(t, 4),
            "t_assumed": t_assumed,
            "formula_version": formula_version,
            "view_implied": view_implied,
            "comp_view": round(comp_view, 2) if comp_view is not None else None,
            "comp_favorite": round(comp_favorite, 2) if comp_favorite is not None else None,
            "comp_like": round(comp_like, 2) if comp_like is not None else None,
            "comp_coin": round(comp_coin, 2) if comp_coin is not None else None,
        })
        prev_issue = issue

    return {
        "bvid": bvid,
        "board_type": board_type,
        "formula_version": entries[-1]["formula_version"] if entries else "new",
        "weights": dict(rank_svc.DEFAULT_WEIGHTS),
        "entries": entries,
    }


def formula_compare(conn, bvid: str, board_type: str = "weekly") -> dict:
    """单曲在新/旧两代公式下的得分因子对比（公式可视化实验室）。

    对每期上榜记录，分别用 OLD_WEIGHTS 与 DEFAULT_WEIGHTS（含各自时间修正 t）
    计算各因子贡献与合计，直观展示「同一首歌换公式后分数如何变化」。
    view 缺失时由「官方分 − 其余三因子」反推（与 score_breakdown 同口径）。
    """
    from ..services import boards as boards_svc
    from datetime import datetime

    if board_type not in ("weekly", "legend", "annual"):
        board_type = "weekly"

    issues = sorted(boards_svc.list_issues(conn, board_type), key=lambda x: x["issue"])
    issue_index = {iss["issue"]: iss.get("issue_id") or 0 for iss in issues}

    history = boards_svc.get_song_history(conn, board_type, bvid)
    if not history:
        return {"bvid": bvid, "board_type": board_type, "entries": []}

    def norm(r):
        out = dict(r)
        if "views" in out and "view" not in out:
            out["view"] = out.get("views")
        if "favorites" in out and "favorite" not in out:
            out["favorite"] = out.get("favorites")
        if "coins" in out and "coin" not in out:
            out["coin"] = out.get("coins")
        if "likes" in out and "like" not in out:
            out["like"] = out.get("likes")
        return out

    def ts_of(issue_key):
        try:
            return int(datetime.strptime(issue_key, "%Y%m%d").timestamp())
        except Exception:
            return 0

    song = get_song(conn, bvid)
    pub = (song or {}).get("pubtime")

    def factor_comp(w, view, fav, coin, like, t, official_score=None):
        def safe(m, ww):
            return int(m or 0) * ww if m is not None else None
        comp_fav = safe(fav, w["favorite"]) if fav is not None else None
        comp_like = safe(like, w["like"]) if like is not None else None
        comp_coin = safe(coin, w["coin"]) if coin is not None else None
        known = (comp_fav or 0) + (comp_like or 0) + (comp_coin or 0)
        view_implied = False
        if view is not None and view > 0:
            comp_view = safe(view, w["view"] * t)
        elif official_score is not None:
            comp_view = round(official_score - known, 2)
            view_implied = True
        else:
            comp_view = None
        return {
            "comp_view": round(comp_view, 2) if comp_view is not None else None,
            "comp_favorite": round(comp_fav, 2) if comp_fav is not None else None,
            "comp_like": round(comp_like, 2) if comp_like is not None else None,
            "comp_coin": round(comp_coin, 2) if comp_coin is not None else None,
            "view_implied": view_implied,
        }

    entries = []
    prev_issue = None
    for raw in history:
        r = norm(raw)
        issue = r.get("issue", "")
        idx = issue_index.get(issue, 0)
        is_old = board_type == "weekly" and idx > 0 and idx < rank_svc.NEW_FORMULA_FROM_ISSUE
        official_version = "old" if is_old else "new"
        cur_ts = ts_of(issue)
        # 时间修正锚点：新公式以「本周起点（前一期截止）」为锚 = 当前 issue 起点 cur_ts；
        # 注意 prev_issue 对应的是上一期起点（≠ 本期起点），必须用本期 cur_ts 作锚。
        anchor_new = cur_ts
        anchor_old = cur_ts
        t_new = rank_svc.time_correction(int(pub or 0), anchor_new) if pub else 1.0
        t_old = rank_svc.time_correction_old(int(pub or 0), anchor_old) if pub else 2.47
        view = r.get("view")
        fav = r.get("favorite")
        coin = r.get("coin")
        like = r.get("like")
        off = r.get("score")
        old_c = factor_comp(rank_svc.OLD_WEIGHTS, view, fav, coin, like, t_old, off)
        new_c = factor_comp(rank_svc.DEFAULT_WEIGHTS, view, fav, coin, like, t_new, off)
        entries.append({
            "issue": issue,
            "rank": r.get("rank"),
            "official_score": off,
            "view": view, "favorite": fav, "coin": coin, "like": like,
            "pubtime": pub,
            "official_version": official_version,
            "t_new": round(t_new, 4), "t_old": round(t_old, 4),
            "old": {**old_c, "total": round((old_c["comp_view"] or 0) + (old_c["comp_favorite"] or 0) + (old_c["comp_like"] or 0) + (old_c["comp_coin"] or 0), 2)},
            "new": {**new_c, "total": round((new_c["comp_view"] or 0) + (new_c["comp_favorite"] or 0) + (new_c["comp_like"] or 0) + (new_c["comp_coin"] or 0), 2)},
        })
        prev_issue = issue

    return {"bvid": bvid, "board_type": board_type, "entries": entries}


def get_song(conn, bvid: str) -> dict | None:
    # B站 bvid 大小写在不同源表不一致，查询时忽略大小写
    r = conn.execute(
        "SELECT id, bvid, title, title_cn, pubtime, first_recorded_at, producers, vocalists "
        "FROM songs_all WHERE LOWER(bvid)=LOWER(?)",
        (bvid,),
    ).fetchone()
    if not r:
        return None
    stats = _get_board_stats(conn)
    metrics = _get_metrics(conn)
    return _to_item(r, stats, metrics)


def get_facets(conn) -> dict:
    """歌曲库筛选面：tier 分布与指标覆盖情况。

    直接遍历 songs_all（与 search 同一数据源与口径），保证 facets 计数与
    tier=xxx 过滤结果完全一致；tiers.none 即「未达殿堂(无里程碑)」歌曲数。
    """
    stats = _get_board_stats(conn)
    metrics = _get_metrics(conn)
    rows = conn.execute(
        "SELECT id, bvid, title, title_cn, pubtime, first_recorded_at, producers, vocalists "
        "FROM songs_all"
    ).fetchall()
    counts = {"hall": 0, "legend": 0, "myth": 0, "none": 0}
    with_metrics = 0
    for r in rows:
        d = _to_item(r, stats, metrics)
        if d["tier"]:
            counts[d["tier"]] += 1
        else:
            counts["none"] += 1
        if d["view"] is not None:
            with_metrics += 1
    return {
        "total": len(rows),
        "with_metrics": with_metrics,
        "tiers": counts,
    }


def _board_appearance(conn) -> dict:
    """预计算每个 bvid 的上榜次数与最高排名（跨周榜/传说榜/年榜）。

    返回 {bvid_upper: {"count": int, "best_rank": int|None}}。
    count = 在官方榜出现的总期数（一首歌在周榜出现 N 期计 N 次）；
    best_rank = 所有上榜记录中的最小 rank（即历史最高排名）。
    """
    info: dict[str, dict] = {}
    for prefix in ("official_", "legend_", "annual_"):
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
                (f"{prefix}%",),
            ).fetchall()
            if r[0][len(prefix):].isdigit() and len(r[0][len(prefix):]) == 8
        ]
        for t in tables:
            try:
                rows = conn.execute(
                    f'SELECT bvid, rank FROM "{t}" WHERE rank IS NOT NULL'
                ).fetchall()
            except Exception:
                continue
            for r in rows:
                bv = (r["bvid"] or "").upper()
                rk = r["rank"]
                d = info.get(bv)
                if d is None:
                    d = info[bv] = {"count": 0, "best_rank": None}
                d["count"] += 1
                if rk is not None:
                    if d["best_rank"] is None or rk < d["best_rank"]:
                        d["best_rank"] = rk
    return info


def _aggregate_role(conn, role: str, url_keys: tuple[str, ...], min_songs: int = 1) -> list[dict]:
    """通用角色聚合（P主 / 歌姬）。

    对收录池每首歌的角色字段（producers / vocalists）展开，统计：
      - songs       参与歌曲数（完整覆盖）
      - total_view  可统计指标歌曲的播放量合计
      - legend      旗下传说曲（百万）数量
      - myth        旗下神话曲（千万）数量
      - best_*      代表曲：可统计指标中播放最高的曲子（bvid/title/view）
      - board_count 旗下歌曲在官方榜累计上榜期数
      - best_rank   旗下歌曲的历史最高排名（最小 rank）
      - power       综合战力分（透明加权，公式见下方）

    战力分公式（前端「战力说明」公开，便于核验）：
        power = 总播放(百万计) × 1 + 上榜期数 × 3 + 传说曲 × 200 + 神话曲 × 1000
    各维度量级经平衡，使单一神话曲或百万级总播放都不至于碾压其它维度。
    """
    metrics = _build_metrics(conn)
    board_info = _board_appearance(conn)
    # 保留 songs_all 原始大小写，避免 best_bvid 全大写导致下游链接 404
    bvid_map = {
        (r["bvid"] or "").upper(): r["bvid"]
        for r in conn.execute("SELECT bvid FROM songs_all").fetchall()
    }
    title_map = {
        (r["bvid"] or "").upper(): r["title"]
        for r in conn.execute("SELECT bvid, title FROM songs_all").fetchall()
    }
    rows = conn.execute(f"SELECT bvid, {role} FROM songs_all").fetchall()
    stats: dict[str, dict] = {}
    for r in rows:
        bvid = (r["bvid"] or "").upper()
        m = metrics.get(bvid)
        bi = board_info.get(bvid)
        for p in db.parse_json_list(r[role]):
            name = (p.get("name") or "").strip() or "未知"
            url = None
            for k in url_keys:
                if p.get(k):
                    url = p[k]
                    break
            s = stats.get(name)
            if s is None:
                s = stats[name] = {
                    "name": name, "url": url,
                    "songs": 0, "total_view": 0, "legend": 0, "myth": 0,
                    "best_view": -1, "best_bvid": None, "best_title": None,
                    "board_count": 0, "best_rank": None,
                }
            s["songs"] += 1
            if m:
                s["total_view"] += m["view"]
                tier = _tier(m["view"])
                if tier == "legend":
                    s["legend"] += 1
                elif tier == "myth":
                    s["myth"] += 1
                if m["view"] > s["best_view"]:
                    s["best_view"] = m["view"]
                    s["best_bvid"] = bvid_map.get(bvid, bvid)
                    s["best_title"] = title_map.get(bvid)
            if bi:
                s["board_count"] += bi["count"]
                if bi["best_rank"] is not None:
                    if s["best_rank"] is None or bi["best_rank"] < s["best_rank"]:
                        s["best_rank"] = bi["best_rank"]
    # 计算综合战力分
    for s in stats.values():
        tv = s["total_view"] or 0
        s["power"] = int(
            (tv / 1_000_000) * 1
            + (s["board_count"] or 0) * 3
            + (s["legend"] or 0) * 200
            + (s["myth"] or 0) * 1000
        )
    out = [s for s in stats.values() if s["songs"] >= min_songs]
    out.sort(key=lambda x: (-x["songs"], -x["total_view"]))
    return out


def artist_stats(conn, limit: int = 50, offset: int = 0, min_songs: int = 1) -> dict:
    """P主聚合（返回带 total 的分页结果）。"""
    out = _aggregate_role(conn, "producers", ("wiki_url", "moegirl_url"), min_songs)
    return {"total": len(out), "items": out[offset:offset + limit]}


def vocalist_stats(conn, limit: int = 50, offset: int = 0) -> dict:
    """歌姬聚合（返回带 total 的分页结果）。"""
    out = _aggregate_role(conn, "vocalists", ("url", "wiki_url"), 1)
    return {"total": len(out), "items": out[offset:offset + limit]}


def _fetch_bili_view_subprocess(bvid: str) -> tuple[str, dict]:
    """用独立子进程抓 B站 view 接口，绕过 uvicorn 常驻进程出口被 B站风控的问题。

    子进程拥有与交互式 Bash 相同的出网出口，可稳定抓取（api.bilibili.com 对
    uvicorn 进程的出口 IP 返回 -404/deleted 风控，对 Bash/子进程出口正常）。
    返回 (code_str, data_dict)：code_str 为 B站返回的 code（"0" 表示成功）。
    """
    script = (
        "import sys, json, httpx\n"
        "bvid = sys.argv[1]\n"
        "headers = {'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0'}\n"
        "try:\n"
        "    r = httpx.get('https://api.bilibili.com/x/web-interface/view',\n"
        "                 params={'bvid': bvid}, headers=headers, timeout=15)\n"
        "    p = r.json()\n"
        "    print(json.dumps({'code': p.get('code'), 'data': p.get('data')}))\n"
        "except Exception as e:\n"
        "    print(json.dumps({'code': 'error', 'msg': str(e)}))\n"
    )
    try:
        res = subprocess.run(
            [sys.executable, "-c", script, bvid],
            capture_output=True, text=True, timeout=30,
        )
        out = (res.stdout or "").strip()
        if not out:
            return "error", {}
        line = out.splitlines()[-1]
        obj = json.loads(line)
        return str(obj.get("code")), obj.get("data") or {}
    except Exception:
        return "error", {}


def resolve_bvid(raw: str) -> str | None:
    """从 B站链接或纯 BV 号解析出 BV 号；支持 b23.tv 短链（跟随重定向取最终 URL）。"""
    s = (raw or "").strip()
    m = _BV_RE.search(s)
    if m:
        return m.group(0).upper()
    if s.lower().startswith("http://") or s.lower().startswith("https://"):
        try:
            resp = httpx.get(s, follow_redirects=True, timeout=12)
            m2 = _BV_RE.search(str(resp.url))
            if m2:
                return m2.group(0).upper()
        except Exception:
            pass
    return None


def _lookup_local_board(bvid: str) -> tuple[str, int] | None:
    """从本地周榜/传说曲/年榜各期表找该 bvid，返回 (title, pubtime) 或 None。

    用于手动入库：已上榜但没收录池的歌曲（如刚发布的新一期）可直接借榜单信息
    补全入库，零网络依赖、不受 B站对服务端出口的风控影响。
    """
    conn = db.connect_source()
    try:
        for prefix in ("official_", "legend_", "annual_"):
            tables = [
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
                    (f"{prefix}%",),
                )
            ]
            for t in tables:
                key = t[len(prefix):]
                if not (len(key) == 8 and key.isdigit()):
                    continue
                row = conn.execute(
                    f'SELECT title, pubtime FROM "{t}" WHERE LOWER(bvid)=LOWER(?)', (bvid,)
                ).fetchone()
                if row and row["title"]:
                    return (row["title"], int(row["pubtime"] or 0))
    finally:
        conn.close()
    return None


def ingest_song(bvid: str) -> dict:
    """手动入库：补全歌曲到 songs_all 收录池。

    返回 {"ok": True, "song": <get_song 结果>, "updated": bool}，
    或 {"ok": False, "status": <原因>, "bvid": bvid}（失败）。

    数据来源优先级：
      1) 本地已上榜歌曲（周榜/传说曲/年榜各期表）——零网络依赖，不受 B站对服务端
         出口的风控影响，可补全「已上榜但没收录池」的歌曲（如刚发布的新一期）；
      2) 兜底：B站在线 view 接口（独立子进程抓取，服务端出口被风控时可能失败）。
    """
    from . import crawler

    bvid = (bvid or "").strip().upper()
    if not _BV_RE.fullmatch(bvid):
        raise ValueError("无效的 B站 BV 号")

    title = None
    pubtime = 0
    # 1) 本地榜单表优先
    found = _lookup_local_board(bvid)
    if found:
        title, pubtime = found
    else:
        # 2) 兜底：B站在线（子进程；服务端出口被风控时失败）
        if not crawler._robots_allowed():
            return {"ok": False, "status": "blocked", "bvid": bvid}
        code, data = _fetch_bili_view_subprocess(bvid)
        if code == "0":
            title = data.get("title") or ""
            pubtime = int(data.get("pubdate") or 0)
        elif code in ("-404", "-400"):
            return {"ok": False, "status": "deleted", "bvid": bvid}
        else:
            return {"ok": False, "status": "not_found", "bvid": bvid}

    if not title:
        return {"ok": False, "status": "not_found", "bvid": bvid}

    # 投稿者（UP主）/ 歌姬：本地榜单与 B站接口均无完整字段，留空待后续补全
    producers: list[dict] = []
    vocalists: list[dict] = []

    w = db.connect_write(config.SOURCE_DB)
    try:
        existing = w.execute(
            "SELECT bvid FROM songs_all WHERE LOWER(bvid)=LOWER(?)", (bvid,)
        ).fetchone()
        prod_json = json.dumps(producers, ensure_ascii=False)
        voc_json = json.dumps(vocalists, ensure_ascii=False)
        if existing:
            w.execute(
                "UPDATE songs_all SET title=?, title_cn=?, pubtime=?, producers=?, vocalists=? "
                "WHERE LOWER(bvid)=LOWER(?)",
                (title, None, pubtime, prod_json, voc_json, bvid),
            )
        else:
            w.execute(
                "INSERT INTO songs_all (bvid, title, title_cn, pubtime, first_recorded_at, producers, vocalists) "
                "VALUES (?,?,?,?,?,?,?)",
                (bvid, title, None, pubtime, None, prod_json, voc_json),
            )
        w.commit()
    finally:
        w.close()

    # 失效 songs 相关缓存，使搜索/聚合立即包含新歌（metrics/board_stats/names 等）
    try:
        cache_mod.cache_clear_prefix("songs:")
    except Exception:
        pass

    rconn = db.connect_source()
    try:
        song = get_song(rconn, bvid)
    finally:
        rconn.close()
    return {"ok": True, "song": song, "updated": bool(existing)}
