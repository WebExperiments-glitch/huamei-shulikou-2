"""Biliboard 官方得分公式（按代切换）与快照查询。

公式分两代，以「第 54 期」为界（已用 rankings_official.csv 112 期全量对拍验证）：

● 新公式（≥issue 54，现行官方版）：
    得分 = Δ播放 × t + Δ新增收藏×15 + Δ新增点赞×3 + Δ新增投币×30
    t = 1  (投稿时间 < 周期起点，即老曲)
        或 T[D_floor]（新曲，D_floor = 本周内投稿距周期起点的整天数 0..6）
    T 阶梯（2026-08-11 用官方 112 期 JSON stats 反推 implied_t 经鲁棒估计得到，
    跨 pubtime 来源稳定）：
        D0=1.053  D1=1.138  D2=1.390  D3=1.606  D4=1.690  D5=2.157  D6=2.470
    周期起点 = 本周起始快照时刻（前一周期统计截止，单位秒），周期长度≈7天。
    实现见 time_correction。注：官方 Δ 取自周增量 stats；约 1/3 新曲的增量存在
    数据层噪声（与 t 无关），干净子集 score 相对误差中位≈0.38%，全体中位≈1.3%。
    榜单排名直接采用官方 score，100% 可复现。

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


# 官方新公式 t 的时间修正（2026-08-11 极限还原）：
#   老曲（投稿早于周期起点）→ t = 1
#   新曲（本周期内投稿）→ t = T[D_floor]，D_floor = clamp(round(D_days − ANCHOR_OFFSET), 0, 6)
#   其中 D_days = (pubtime − 周期起点)/86400，周期起点即传入的 prev_period_end_ts。
# T 为按「本周内投稿整天数」的 7 档阶梯，由官方 112 期 JSON 的 stats(周增量) 反推 implied_t，
# 经鲁棒离群剔除（脏 pubtime）后估计得到，跨 pubtime 来源（pubtime / firstRecordedAt /
# bv_pubtime.json）稳定一致。干净子集 score 相对误差中位≈0.38%，全体中位≈1.3%。
# 注：约 1/3 新曲的 Δ 本身存在数据层噪声（与 t 无关），已非 t 还原所能消除。
T_TABLE = {
    0: 1.0527, 1: 1.1381, 2: 1.3900, 3: 1.6061,
    4: 1.6900, 5: 2.1574, 6: 2.4700,
}
ANCHOR_OFFSET_DAYS = 0.5   # 真实锚点相对传入 prev_period_end_ts 的偏移（经验标定）
T_CLAMP_MIN = 1.0
T_CLAMP_MAX = 2.615         # 脏数据兜底上限
DT_ANOMALY_MAX = 365 * 86400
DEFAULT_PERIOD_LEN = 7 * 86400


def time_correction(pubtime: int, prev_period_end_ts: int, period_len_ts: int | None = None) -> float:
    """官方新公式时间修正（阶梯 T[D_floor] 还原版，2026-08-11）。

    t = 1                                                      (投稿早于周期起点 -> 老曲)
      = T[clamp(round((pubtime − 周期起点)/86400 − 0.5), 0, 6)]   (新曲，本周内投稿)

    周期起点 = prev_period_end_ts（本周起始快照时刻 = 前一周期统计截止，单位秒）。
    D_floor 即「本周内投稿距周期起点的整天数」（0=刚过起点, 6=临近本周结束投稿）。
    阶梯 T 由官方 112 期 score + 周增量 stats 反推 implied_t 鲁棒估计得到。
    """
    if not pubtime or pubtime <= 0:
        return T_CLAMP_MIN
    dt = pubtime - (prev_period_end_ts or 0)
    if dt < 0:
        return T_CLAMP_MIN
    d_days = dt / 86400.0
    if d_days > 7.0:
        return T_CLAMP_MIN
    k = max(0, min(6, int(round(d_days - ANCHOR_OFFSET_DAYS))))
    t = T_TABLE.get(k, T_CLAMP_MIN)
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
