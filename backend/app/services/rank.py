"""Biliboard 官方得分公式（按代切换）与快照查询。

公式分四代，以 Biliboard 官方专栏公布的排名计算方式为准（详见 docs/公式演变.md，
经官方 score 反推验证）：

● 现行公式（≥issue 111）：
    得分 = 新增播放 × t + 新增收藏×15 + 新增点赞×3 + 新增投币×30
    t = 1  (投稿时间 ≤ 周期起点，即老曲)
        或 ln(exp((pubtime − 周期起点)/86400) + 1) + 1  (新曲，投稿晚于周期起点)
    周期起点 = prev_period_end_ts（前一周期统计截止 = 本期结算日 − 7 天，秒级）。
    实现见 time_correction。

● 现行早期公式（103 ≤ issue < 111）：
    同上连续对数 t，但收藏×30 / 投币×15（111 期起两项系数互换）。

● 中间公式（54 ≤ issue < 103）：
    得分 = 新增播放 × t + 新增收藏×30 + 新增点赞×3 + 新增投币×10
    t = 按「本周内投稿距周期起点整天数」的 7 档阶梯：
        D0=1.053  D1=1.138  D2=1.390  D3=1.606  D4=1.690  D5=2.157  D6=2.470
    注：本期权重的 收藏×30 / 投币×10 与旧公式相同，但少了 view 的 2× 系数，
        且 t 的锚点从「周期终点」改为「周期起点」。
    实现见 time_correction_mid。

● 远古公式（<issue 54）：
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

# 公式分代
NEW_FORMULA_FROM_ISSUE = 54           # 54 期起切换为「新公式」（T_TABLE 阶梯版）
CONTINUOUS_FORMULA_FROM_ISSUE = 103   # 103 期起切换为「连续对数公式」（锚点=周期起点）
CONTINUOUS_CURRENT_FROM_ISSUE = 111   # 111 期起收藏/投币系数互换（现行权重）

# 旧公式（<issue 54）：得分 = 2·Δ播放·t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
OLD_WEIGHTS = {"view": 2.0, "favorite": 30, "like": 3, "coin": 10}

# 中间公式（54 ≤ issue < 103）：得分 = Δ播放·t + 30Δ收藏 + 3Δ点赞 + 10Δ投币
MID_WEIGHTS = {"view": 1.0, "favorite": 30, "like": 3, "coin": 10}

# 现行早期公式（103 ≤ issue < 111）：连续对数 t + 收藏30/投币15（111 期起互换）
CONTINUOUS_EARLY_WEIGHTS = {"view": 1.0, "favorite": 30, "like": 3, "coin": 15}

# 现行公式（≥issue 111）：得分 = Δ播放·t + 15Δ收藏 + 3Δ点赞 + 30Δ投币
DEFAULT_WEIGHTS = {"view": 1.0, "favorite": 15, "like": 3, "coin": 30}

# 传说曲阈值：百万播放
LEGEND_VIEW_THRESHOLD = 1_000_000

# 连续对数公式常数
T_CLAMP_MIN = 1.0
T_CLAMP_MAX = 50.0          # 兜底上限（极端新曲 delta 可达 7 天，t ≈ 8.0；留余量）
DT_ANOMALY_MAX = 365 * 86400
DEFAULT_PERIOD_LEN = 7 * 86400


def time_correction(pubtime: int, prev_period_end_ts: int, period_len_ts: int | None = None) -> float:
    """现行/过渡公式时间修正（连续对数，≥issue 100 官方版）。

    公式（Biliboard 第 111 期专栏原文）：
        t = LOG(EXP(DATE([投稿时间])-DATE([前一期周榜数据统计截止时间]))/86400 + 1) + 1
        PS:时间均精确到秒

    即：
        delta_days = (pubtime − prev_period_end_ts) / 86400
        t = ln(exp(delta_days) + 1) + 1

    当 delta_days ≤ 0（老曲，投稿不晚于周期起点）→ t ≈ 1.0
    当 delta_days > 0（新曲，本周内投稿）→ t > 1，delta 越大 t 越大。
    经数据库实际 score 反推验证，LOG 此处为自然对数 ln（非 Excel 默认的 log10）。
    """
    if not pubtime or pubtime <= 0:
        return T_CLAMP_MIN
    dt = pubtime - (prev_period_end_ts or 0)
    # 兜底：异常时间戳（毫秒级误存/未来时间）先夹取，避免 math.exp 溢出抛 OverflowError 拖垮整期榜单。
    # 超过 365 天的 delta 其 t 本就会被 T_CLAMP_MAX 截断为 50，先夹取不影响结果。
    if dt > DT_ANOMALY_MAX:
        dt = DT_ANOMALY_MAX
    d_days = dt / 86400.0
    # 连续对数公式：t = ln(exp(d_days) + 1) + 1
    t = math.log(math.exp(d_days) + 1.0) + 1.0
    return min(max(t, T_CLAMP_MIN), T_CLAMP_MAX)


def time_correction_mid(pubtime: int, prev_period_end_ts: int) -> float:
    """中间公式时间修正（阶梯 T_TABLE，54 ≤ issue < 103）。

    t = 1                                                      (投稿早于周期起点 -> 老曲)
      = T[clamp(round((pubtime − 周期起点)/86400 − 0.5), 0, 6)]   (新曲，本周内投稿)

    周期起点 = prev_period_end_ts（本周起始快照时刻 = 前一周期统计截止，单位秒）。
    T 阶梯由官方 112 期 JSON 的 stats(周增量) 反推 implied_t 鲁棒估计得到。
    """
    if not pubtime or pubtime <= 0:
        return T_CLAMP_MIN
    dt = pubtime - (prev_period_end_ts or 0)
    if dt < 0:
        return T_CLAMP_MIN
    d_days = dt / 86400.0
    if d_days > 7.0:
        return T_CLAMP_MIN
    t_table = {
        0: 1.0527, 1: 1.1381, 2: 1.3900, 3: 1.6061,
        4: 1.6900, 5: 2.1574, 6: 2.4700,
    }
    k = max(0, min(6, int(round(d_days - 0.5))))
    t = t_table.get(k, T_CLAMP_MIN)
    return min(max(t, T_CLAMP_MIN), 2.615)


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
