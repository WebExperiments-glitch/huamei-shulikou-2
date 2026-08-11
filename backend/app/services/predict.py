"""下期冲榜预测（周榜 Top 20 入榜线预测）。

方法论（全部可核验，无黑箱）：

1. **速率估计**：从自建快照库 hot.sqlite 取两份快照（基线 / 最新），对每首曲子
   求四维增量 Δview/Δfav/Δcoin/Δlike，除以窗口天数得到「当前日均速率」。

2. **热度衰减**：视频热度随时间衰减，新曲当前速率是爆发期峰值，直接线性外推
   会系统性高估。故按投稿年龄施加衰减系数：

       decay(age) = 0.55 + 0.45 × min(age, 30) / 30      （再乘用户可调系数 k）

   即 0 天新曲取 0.55，30 天以上老曲取 1.0（速率已趋稳定，不额外打折）。

3. **7 日外推**：projected_7d = 日均速率 × 7 × decay。

4. **套用现行官方公式**（issue ≥ 54 新公式，见 rank.py）：

       得分 = Δ播放 × t + 15·Δ收藏 + 3·Δ点赞 + 30·Δ投币
       t = 1 (Δt<0) 或 log10(e^(Δt/86400/14)+1)+1，Δt = 投稿时间 − 本周期起点

   本周期起点取「最新快照时刻」，与官方「前一期统计截止」锚点口径一致。

5. **入榜线**：取最近 N 期官方周榜第 20 名（末位）得分，用中位数作为预测入榜线，
   同时给出 min/max 区间以体现波动。

6. **概率映射**：p = r^2.5 / (1 + r^2.5)，r = 预测得分 / 入榜线中位数。
   r=1 → 50%，r=1.5 → 77%，r=0.5 → 15%。单调、可解释，不引入拟合参数。

已知局限（前端会明示）：
- 仅覆盖自建爬虫已追踪的曲目（当前约 200 余首），不等于全站候选池；
- 快照窗口越短，速率噪声越大，窗口 < 1 天时结果仅供参考；
- 不建模突发事件（转载、二创爆火、官方推荐位）。
"""
from __future__ import annotations

import logging
import math
import statistics
import time

from . import boards as boards_svc
from . import crawler
from .rank import DEFAULT_WEIGHTS, time_correction

logger = logging.getLogger("predict")

# 入榜线回看期数
CUTLINE_LOOKBACK = 8
# 自动选基线快照时，允许回溯的最长天数（超过视为过期，改用相邻快照）
AUTO_BASELINE_MAX_DAYS = 10.0


def _decay(age_days: float, k: float) -> float:
    """热度衰减系数：新曲打折更狠，老曲趋近 1.0。"""
    a = min(max(age_days, 0.0), 30.0)
    base = 0.55 + 0.45 * a / 30.0
    return max(0.1, min(1.5, base * k))


def _prob(score: float, cut: float) -> float:
    """预测得分 → 上榜概率。r=1 时恰为 0.5。"""
    if cut <= 0:
        return 0.0
    r = max(score, 0.0) / cut
    if r <= 0:
        return 0.0
    rp = r ** 2.5
    return round(rp / (1.0 + rp), 4)


def cutlines(conn, board_type: str = "weekly", lookback: int = CUTLINE_LOOKBACK) -> dict:
    """最近 N 期官方榜的末位（入榜线）得分统计。"""
    prefix = boards_svc.PREFIXES.get(board_type, "official_")
    issues = boards_svc.list_issues(conn, board_type)[:lookback]
    history: list[dict] = []
    for iss in issues:
        table = f'{prefix}{iss["issue"]}'
        try:
            r = conn.execute(
                f'SELECT MIN(score) AS cut, MAX(score) AS top, COUNT(*) AS n FROM "{table}"'
            ).fetchone()
        except Exception:
            continue
        if not r or r["cut"] is None:
            continue
        history.append({
            "issue": iss["issue"],
            "date": iss["date"],
            "entries": int(r["n"]),
            "cut": round(float(r["cut"]), 2),
            "top": round(float(r["top"]), 2),
        })
    cuts = [h["cut"] for h in history]
    return {
        "history": history,
        "median": round(statistics.median(cuts), 2) if cuts else None,
        "mean": round(statistics.fmean(cuts), 2) if cuts else None,
        "min": min(cuts) if cuts else None,
        "max": max(cuts) if cuts else None,
        "board_size": history[0]["entries"] if history else 20,
        "lookback": len(history),
    }


def _pick_pair(hot, baseline: str) -> tuple[dict | None, dict | None, float]:
    """选取 (最新快照, 基线快照, 窗口天数)。

    baseline = "auto"  → 取 AUTO_BASELINE_MAX_DAYS 内最早的一份（窗口最大、噪声最小）
               "prev"  → 相邻上一份
               数字串   → 指定 snapshot id
    """
    snaps = [dict(r) for r in hot.execute(
        "SELECT id, created_at, count FROM snapshots ORDER BY id DESC"
    ).fetchall()]
    if len(snaps) < 2:
        return (snaps[0] if snaps else None), None, 0.0

    new = snaps[0]
    if baseline == "prev":
        old = snaps[1]
    elif baseline.isdigit():
        old = next((s for s in snaps if s["id"] == int(baseline)), snaps[1])
    else:
        limit_ts = new["created_at"] - AUTO_BASELINE_MAX_DAYS * 86400
        candidates = [s for s in snaps[1:] if s["created_at"] >= limit_ts]
        old = candidates[-1] if candidates else snaps[1]

    window = max(new["created_at"] - old["created_at"], 60) / 86400.0
    return new, old, round(window, 4)


def _last_board(conn, board_type: str = "weekly") -> dict[str, int]:
    """上一期官方榜的 bvid → rank 映射，用于标记「已在榜」。"""
    issues = boards_svc.list_issues(conn, board_type)
    if not issues:
        return {}
    prefix = boards_svc.PREFIXES.get(board_type, "official_")
    table = f'{prefix}{issues[0]["issue"]}'
    try:
        return {r["bvid"]: int(r["rank"]) for r in conn.execute(f'SELECT bvid, rank FROM "{table}"')}
    except Exception:
        return {}


def next_week(
    conn,
    *,
    baseline: str = "auto",
    decay_k: float = 1.0,
    limit: int = 60,
    board_type: str = "weekly",
) -> dict:
    """生成下期冲榜预测。conn 为官方源库连接（只读）；快照库内部自行打开。"""
    cut_info = cutlines(conn, board_type)
    cut = cut_info["median"] or 0.0
    last_ranks = _last_board(conn, board_type)

    hot = crawler.connect_hot(readonly=True)
    try:
        new_snap, old_snap, window = _pick_pair(hot, baseline)
        if not new_snap or not old_snap:
            return {
                "ok": False,
                "reason": "快照不足：至少需要两次实时热度刷新才能估计增长速率",
                "cutline": cut_info,
                "items": [],
                "summary": None,
            }

        old_map = {
            r["bvid"]: r
            for r in hot.execute(
                "SELECT bvid, view, favorite, coin, like FROM snapshot_stats WHERE snapshot_id=?",
                (old_snap["id"],),
            )
        }
        new_rows = hot.execute(
            "SELECT bvid, title, title_cn, owner, pubtime, view, favorite, coin, like "
            "FROM snapshot_stats WHERE snapshot_id=?",
            (new_snap["id"],),
        ).fetchall()
    finally:
        hot.close()

    period_start = int(new_snap["created_at"])
    now = int(time.time())
    w = DEFAULT_WEIGHTS
    items: list[dict] = []

    for r in new_rows:
        o = old_map.get(r["bvid"])
        if o is None:
            continue  # 新入库曲无基线，跳过以免误判暴涨
        dv = max((r["view"] or 0) - (o["view"] or 0), 0)
        df = max((r["favorite"] or 0) - (o["favorite"] or 0), 0)
        dc = max((r["coin"] or 0) - (o["coin"] or 0), 0)
        dl = max((r["like"] or 0) - (o["like"] or 0), 0)
        if dv + df + dc + dl == 0:
            continue  # 完全静止的曲子不进入预测榜

        pub = int(r["pubtime"] or 0)
        age_days = (now - pub) / 86400.0 if pub else 999.0
        k = _decay(age_days, decay_k)
        f = 7.0 / window * k  # 窗口增量 → 7 日外推倍率

        p7v, p7f, p7c, p7l = dv * f, df * f, dc * f, dl * f
        t = time_correction(pub, period_start) if pub else 1.0
        score = p7v * w["view"] * t + p7f * w["favorite"] + p7l * w["like"] + p7c * w["coin"]

        items.append({
            "bvid": r["bvid"],
            "title": r["title"],
            "title_cn": r["title_cn"],
            "owner": r["owner"],
            "pubtime": pub,
            "age_days": round(age_days, 1),
            "view": r["view"], "favorite": r["favorite"], "coin": r["coin"], "like": r["like"],
            "dv": dv, "df": df, "dc": dc, "dl": dl,
            "rate_view": round(dv / window, 1),
            "decay": round(k, 3),
            "p7v": int(p7v), "p7f": int(p7f), "p7c": int(p7c), "p7l": int(p7l),
            "t": round(t, 4),
            "pred_score": round(score, 2),
            "prob": _prob(score, cut),
            "margin": round(score - cut, 2) if cut else None,
            "margin_pct": round((score / cut - 1) * 100, 1) if cut else None,
            "on_last_board": r["bvid"] in last_ranks,
            "last_rank": last_ranks.get(r["bvid"]),
        })

    items.sort(key=lambda x: x["pred_score"], reverse=True)
    for i, it in enumerate(items, 1):
        it["pred_rank"] = i

    board_size = cut_info["board_size"] or 20
    expected_in = sum(1 for it in items if it["prob"] >= 0.5)
    newcomers = sum(1 for it in items[:board_size] if not it["on_last_board"])

    summary = {
        "generated_at": now,
        "period_start": period_start,
        "window_days": window,
        "baseline_snapshot": {"id": old_snap["id"], "created_at": old_snap["created_at"]},
        "latest_snapshot": {"id": new_snap["id"], "created_at": new_snap["created_at"]},
        "tracked": len(items),
        "board_size": board_size,
        "cut_median": cut,
        "cut_min": cut_info["min"],
        "cut_max": cut_info["max"],
        "expected_in": expected_in,
        "newcomers_in_top": newcomers,
        "decay_k": decay_k,
        "formula": "Δ播放×t + 15Δ收藏 + 3Δ点赞 + 30Δ投币（现行新公式）",
        "low_confidence": window < 1.0,
    }
    return {
        "ok": True,
        "reason": None,
        "cutline": cut_info,
        "summary": summary,
        "total": len(items),
        "items": items[:limit],
    }
