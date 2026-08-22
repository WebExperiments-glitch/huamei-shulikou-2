"""数据预警与洞察中心（数据层）。

把分散在多个数据源的信息整合成可操作的"预警/洞察"：
  · milestones  —— 里程碑冲刺预警：殿堂/传说/神话曲即将达成的歌曲及进度
  · newcomers  —— 新曲首秀：最新一期首次上榜的新面孔
  · surges     —— 排名突进：本期较上期排名大幅上升的歌曲
  · freshness  —— 数据新鲜度：最新周榜距今，识别静默同步失败
  · kpis       —— 关键指标汇总（曲库量/上榜量/各档曲数）

设计原则：
  · 全部只读、复用已有 services（songs._get_metrics 已缓存，避免重复全表扫描）
  · 里程碑进度 = 当前最佳播放量 / 门槛，仅对进入"冲刺窗口"(默认 75%~99%) 的歌曲告警
  · 排序一律降序取 Top N，前端无需再排序
"""

from __future__ import annotations

import logging
from datetime import datetime

from ..core import db
from . import boards as boards_svc
from . import songs as songs_svc

logger = logging.getLogger(__name__)

# 里程碑门槛（B站虚拟歌手分档，按播放量）
TIER_THRESHOLDS: dict[str, int] = {
    "myth": 10_000_000,     # 神话曲 1000万
    "legend": 1_000_000,    # 传说曲 100万
    "hall": 100_000,        # 殿堂曲 10万
}
TIER_LABELS: dict[str, str] = {
    "myth": "神话曲",
    "legend": "传说曲",
    "hall": "殿堂曲",
}
# 进入冲刺窗口的下限比例（当前播放 ≥ 门槛×SHOT_START 才算"即将达成"）
SHOT_START = 0.75
# 数据新鲜度哨兵：最新周榜距今超过该天数视为 stale
FRESH_MAX_DAYS = 8


def _freshness(conn) -> dict:
    """最新一期周榜距今天数（复用 health 的哨兵口径）。"""
    try:
        issues = boards_svc.list_issues(conn, "weekly")
        if not issues:
            return {"latest_weekly_issue": None, "age_days": None, "stale": True}
        latest = issues[0]["issue"]
        d = datetime.strptime(latest, "%Y%m%d")
        age = (datetime.now() - d).days
        return {"latest_weekly_issue": latest, "age_days": age, "stale": age > FRESH_MAX_DAYS}
    except Exception as e:  # noqa: BLE001
        logger.warning("insights.freshness: %s", e)
        return {"error": str(e)}


def milestones(conn, tier: str | None = None, limit: int = 10) -> list[dict]:
    """里程碑冲刺预警。

    用每首歌"当前最佳播放量"（songs._get_metrics，已缓存）计算距离各档门槛的进度，
    仅返回进入冲刺窗口 (进度 ∈ [75%, 100%)) 的歌曲，按进度降序。
    """
    metrics = songs_svc._get_metrics(conn)
    rows = conn.execute(
        "SELECT bvid, title, title_cn, producers, vocalists FROM songs_all"
    ).fetchall()

    tiers = [tier] if tier in TIER_THRESHOLDS else list(TIER_THRESHOLDS.keys())
    out: list[dict] = []
    for r in rows:
        bvid = (r["bvid"] or "").upper()
        m = metrics.get(bvid)
        if not m or not m.get("view"):
            continue
        view = m["view"]
        title = r["title_cn"] or r["title"]
        prod = db.parse_json_list(r["producers"])
        voc = db.parse_json_list(r["vocalists"])
        for tk in tiers:
            thr = TIER_THRESHOLDS[tk]
            if view >= thr:
                continue  # 已达成该档，不再预警
            progress = view / thr
            if progress < SHOT_START:
                continue  # 尚未进入冲刺窗口
            out.append({
                "tier": tk,
                "tier_label": TIER_LABELS[tk],
                "threshold": thr,
                "bvid": bvid,
                "title": title,
                "producers": [p["name"] if isinstance(p, dict) else p for p in prod],
                "vocalists": [v["name"] if isinstance(v, dict) else v for v in voc],
                "view": view,
                "progress": round(progress, 4),
                "remain": max(0, thr - view),
                "target": thr,
            })
    # 按进度降序，同档内取前 limit
    out.sort(key=lambda x: (-x["progress"], -x["view"]))
    return out[:limit]


def newcomers(conn, limit: int = 20) -> dict:
    """最新一期周榜首秀：weeks_on_board == 1 的歌曲（本期首次上榜）。"""
    latest = boards_svc.latest_issue(conn, "weekly")
    if not latest:
        return {"issue": None, "items": []}
    table = boards_svc._table_name("weekly", latest["issue"])
    rows = conn.execute(
        f'SELECT rank, bvid, title, score, weeks_on_board, pubtime FROM "{table}" '
        "WHERE weeks_on_board = 1 ORDER BY rank ASC LIMIT ?",
        (limit,),
    ).fetchall()
    items = []
    for r in rows:
        items.append({
            "rank": r["rank"],
            "bvid": r["bvid"],
            "title": r["title"],
            "score": r["score"],
            "pubtime": r["pubtime"],
            "url": f"https://www.bilibili.com/video/{r['bvid']}",
        })
    return {"issue": latest["issue"], "items": items}


def surges(conn, limit: int = 20) -> dict:
    """最新两期周榜排名突进：本期较上期 rank 大幅上升的歌曲。

    仅统计"两期都在榜"的歌曲（排除新上榜），按名次上升幅度降序。
    """
    issues = boards_svc.list_issues(conn, "weekly")
    if len(issues) < 2:
        return {"cur_issue": None, "prev_issue": None, "items": []}
    cur, prev = issues[0], issues[1]
    cur_t = boards_svc._table_name("weekly", cur["issue"])
    prev_t = boards_svc._table_name("weekly", prev["issue"])
    cur_rows = {
        (r["bvid"] or "").upper(): r
        for r in conn.execute(f'SELECT rank, bvid, title, score, weeks_on_board FROM "{cur_t}"').fetchall()
    }
    prev_rank = {
        (r["bvid"] or "").upper(): r["rank"]
        for r in conn.execute(f'SELECT bvid, rank FROM "{prev_t}"').fetchall()
    }
    items = []
    for bvid, r in cur_rows.items():
        pr = prev_rank.get(bvid)
        if pr is None:
            continue  # 上期不在榜（新上榜/回归），单独归类
        gain = pr - r["rank"]  # 正 = 名次上升
        if gain <= 0:
            continue
        items.append({
            "rank": r["rank"],
            "prev_rank": pr,
            "gain": gain,
            "bvid": bvid,
            "title": r["title"],
            "score": r["score"],
            "url": f"https://www.bilibili.com/video/{bvid}",
        })
    items.sort(key=lambda x: -x["gain"])
    return {"cur_issue": cur["issue"], "prev_issue": prev["issue"], "items": items[:limit]}


def kpis(conn) -> dict:
    """关键指标：曲库量、最新期上榜数、各档曲数量、冲刺中数量。"""
    metrics = songs_svc._get_metrics(conn)
    total = conn.execute("SELECT COUNT(*) AS n FROM songs_all").fetchone()["n"]
    latest = boards_svc.latest_issue(conn, "weekly")
    board_count = None
    if latest:
        t = boards_svc._table_name("weekly", latest["issue"])
        board_count = conn.execute(f'SELECT COUNT(*) AS n FROM "{t}"').fetchone()["n"]

    counts = {"myth": 0, "legend": 0, "hall": 0}
    shots = {"myth": 0, "legend": 0, "hall": 0}
    for m in metrics.values():
        view = m.get("view") or 0
        if view >= TIER_THRESHOLDS["myth"]:
            counts["myth"] += 1
        elif view >= TIER_THRESHOLDS["legend"]:
            counts["legend"] += 1
        elif view >= TIER_THRESHOLDS["hall"]:
            counts["hall"] += 1
        for tk, thr in TIER_THRESHOLDS.items():
            if thr > view >= thr * SHOT_START:
                shots[tk] += 1
    return {
        "songs_total": int(total),
        "board_count": int(board_count or 0),
        "latest_issue": latest["issue"] if latest else None,
        "tier_counts": counts,
        "milestone_shots": shots,
    }


def overview(conn) -> dict:
    """洞察中心聚合入口：一次性返回全部卡片数据。"""
    return {
        "freshness": _freshness(conn),
        "kpis": kpis(conn),
        "milestones": {
            "myth": milestones(conn, tier="myth", limit=8),
            "legend": milestones(conn, tier="legend", limit=8),
            "hall": milestones(conn, tier="hall", limit=8),
        },
        "newcomers": newcomers(conn, limit=15),
        "surges": surges(conn, limit=15),
    }
