"""Biliboard 官方得分公式（按代切换）与快照查询。

公式分两代，以「第 54 期」为界（已用 rankings_official.csv 112 期全量对拍验证）：

● 新公式（≥issue 54，现行官方版）：
    得分 = Δ播放 × t + Δ新增收藏×15 + Δ新增点赞×3 + Δ新增投币×30
    t = 1 (Δt<0) 或 log10(e^(Δt/86400/14)+1)+1，随后钳制到 [1.0, 2.615]（新曲温和加成，老曲恒为 1）
    Δt = 投稿时间 − 本周起始快照时刻（前一周期统计截止，单位秒）
    实现见 time_correction。2026-08-11 二次测算：用官方 112 期 score 反推 implied_t，
    实测 t 中位 1.0、p95 1.69、最大 2.615；原 log10 公式对脏数据（pubtime 记成遥远未来）
    会算出 t=13.7/19.8，远超官方实际，故钳制上限以消除该偏差。

● 旧公式（<issue 54）：
    得分 = 2·Δ播放 × t + 30·Δ收藏 + 3·Δ点赞 + 10·Δ投币
    t = 按「发行天数 D = floor((结束快照时刻 − 投稿时间)/86400)」的阶梯系数：
        D≤1:2.47, D=2:2.06, D=3:1.69, D=4:1.39, D=5:1.18,
        D=6:1.08, D=7:1.03, D=8:1.01, D>8:1.0
    实现见 time_correction_old。D 必须用时间戳秒差向下取整 24h 天，不可用日历天差。
"""
from __future__ import annotations

import logging
import math

from . import crawler

logger = logging.getLogger(__name__)

# 公式分代：第 54 期起切换为现行新公式；此前使用旧公式。
NEW_FORMULA_FROM_ISSUE = 54

# 旧公式（<issue 54）：得分 = 2·Δ播放·t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
# t 为按「发行天数 D」的阶梯系数（见 time_correction_old）。
OLD_WEIGHTS = {"view": 2.0, "favorite": 30, "like": 3, "coin": 10}

# 新公式（≥issue 54，现行）：得分 = Δ播放·t + 15Δ收藏 + 3Δ点赞 + 30Δ投币
DEFAULT_WEIGHTS = {"view": 1.0, "favorite": 15, "like": 3, "coin": 30}

# 传说曲阈值：百万播放
LEGEND_VIEW_THRESHOLD = 1_000_000


# 官方实际 t 的实测上下界（用 112 期 ground truth 反推 implied_t 得到）：
#   中位 1.0、p95 1.69、最大 2.615，没有任何样本 t>2.62，且 t 不会为负放大。
# 故把 log10 时间加成的结果钳制到 [T_CLAMP_MIN, T_CLAMP_MAX]，消除脏数据导致的 t 失控放大。
T_CLAMP_MIN = 1.0
T_CLAMP_MAX = 2.615
# pubtime 异常阈值：投稿时间比本期起点晚超过 1 年视为脏数据（不可能“新”到这种程度），按老曲 t=1。
DT_ANOMALY_MAX = 365 * 86400


def time_correction(pubtime: int, prev_period_end_ts: int) -> float:
    """官方新公式时间修正（2026-08-11 二次测算后修正版）。

    t = 1 (Δt<0) 或 log10(e^(Δt/86400/14)+1)+1，随后钳制到 [1.0, 2.615]。
    Δt = 投稿时间 − 前一期统计截止时间（秒）= pubtime − 本周起始快照时刻。
    老曲（投稿早于本期起点）Δt<0 → t=1；新曲 Δt≥0 → 温和加成，但上限 2.615。

    校正依据：用官方 112 期 score 反推 implied_t，实测 t 中位 1.0、最大 2.615；原 log10
    公式在脏数据（pubtime 被记为遥远未来）上会算出 t=13.7/19.8，远超官方实际，
    故钳制上限以消除该偏差。pubtime 缺失或异常（晚于本期起点 1 年以上）按老曲 t=1。
    """
    if not pubtime or pubtime <= 0:
        return T_CLAMP_MIN
    dt = pubtime - prev_period_end_ts
    if dt < 0:
        return T_CLAMP_MIN
    if dt > DT_ANOMALY_MAX:
        return T_CLAMP_MIN
    t = math.log10(math.exp(dt / 86400.0 / 14.0) + 1) + 1
    return min(max(t, T_CLAMP_MIN), T_CLAMP_MAX)


def time_correction_old(pubtime: int, period_end_ts: int) -> float:
    """旧公式时间修正（笔记-术力口周榜公式还原 §已确证公式，<issue 54 使用）。

    t = 按「发行天数 D」的阶梯系数：
        D≤1:2.47, D=2:2.06, D=3:1.69, D=4:1.39, D=5:1.18,
        D=6:1.08, D=7:1.03, D=8:1.01, D>8:1.0
    D = floor((period_end_ts − pubtime) / 86400)，必须以「结束快照时刻」为锚点
    （即本周期统计截止时间），用时间戳秒差向下取整 24h 天，不可用日历天差。
    无 pubtime 时按 D≤1 处理（t=2.47）。
    """
    if not pubtime:
        return 2.47
    d = (period_end_ts - pubtime) // 86400
    ladder = [
        (1, 2.47), (2, 2.06), (3, 1.69), (4, 1.39), (5, 1.18),
        (6, 1.08), (7, 1.03), (8, 1.01),
    ]
    for threshold, val in ladder:
        if d <= threshold:
            return val
    return 1.0


def list_snapshots(limit: int = 50) -> list[dict]:
    """最近若干次爬取快照（id / 创建时间 / 范围 / 收录曲数），反映实时数据新鲜度。"""
    conn = crawler.connect_hot(readonly=True)
    try:
        rows = conn.execute(
            "SELECT id, created_at, scope, count FROM snapshots ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
