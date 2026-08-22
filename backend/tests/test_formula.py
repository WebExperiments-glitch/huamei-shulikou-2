"""评分公式纯函数测试：不依赖数据库/网络，回归保护公式重构。"""
import math

import pytest

from app.services.rank import (
    DEFAULT_WEIGHTS,
    MID_WEIGHTS,
    OLD_WEIGHTS,
    CONTINUOUS_EARLY_WEIGHTS,
    LEGEND_VIEW_THRESHOLD,
    time_correction,
    time_correction_mid,
    time_correction_old,
)

DAY = 86400


def test_time_correction_old_song_is_1():
    # 投稿远早于周期起点（老曲，如 30 天前）→ t ≈ 1
    period_start = 1_700_000_000
    assert time_correction(period_start - 30 * DAY, period_start) == pytest.approx(1.0, abs=1e-6)


def test_time_correction_matches_official_log_formula():
    # 现行连续对数公式：t = ln(exp(3) + 1) + 1（投稿比起点晚 3 天）
    period_start = 1_700_000_000
    t = time_correction(period_start + 3 * DAY, period_start)
    assert t == pytest.approx(math.log(math.exp(3.0) + 1.0) + 1.0)


def test_time_correction_new_song_greater_than_1():
    period_start = 1_700_000_000
    assert time_correction(period_start + DAY, period_start) > 1.0


def test_time_correction_no_pubtime_returns_1():
    assert time_correction(0, 1_700_000_000) == 1.0


def test_time_correction_clamps_future_anomaly():
    # 极端未来时间戳：不抛 OverflowError，t 被夹到上限
    t = time_correction(1_800_000_000, 1_700_000_000)
    assert 0 < t <= 50.0


def test_time_correction_mid_old_is_1():
    assert time_correction_mid(100, 200) == 1.0


def test_time_correction_mid_uses_ladder():
    # 投稿比起点晚 1 天 → k = round(1 - 0.5) = 0（Python 银行家舍入）→ t = 1.0527
    period_start = 1_700_000_000
    assert time_correction_mid(period_start + DAY, period_start) == pytest.approx(1.0527, abs=1e-4)
    # 投稿比起点晚 1.5 天 → k = round(1.0) = 1 → t = 1.1381
    assert time_correction_mid(period_start + int(1.5 * DAY), period_start) == pytest.approx(1.1381, abs=1e-4)


def test_time_correction_old_no_pubtime_is_2_47():
    assert time_correction_old(0, 1_700_000_000) == 2.47


# ---------------------------------------------------------------------------
# 公式权重常量：代际权重是榜单结果的生命线，回归保护防止误改。
# ---------------------------------------------------------------------------
def test_formula_weights_are_stable():
    # 现行（≥issue 111）：收藏15 / 投币30
    assert DEFAULT_WEIGHTS == {"view": 1.0, "favorite": 15, "like": 3, "coin": 30}
    # 现行早期（103 ≤ issue < 111）：收藏30 / 投币15
    assert CONTINUOUS_EARLY_WEIGHTS == {"view": 1.0, "favorite": 30, "like": 3, "coin": 15}
    # 中间（54 ≤ issue < 103）：收藏30 / 投币10
    assert MID_WEIGHTS == {"view": 1.0, "favorite": 30, "like": 3, "coin": 10}
    # 远古（<54）：view 带 2× 系数
    assert OLD_WEIGHTS == {"view": 2.0, "favorite": 30, "like": 3, "coin": 10}
    # 传说曲阈值：百万播放
    assert LEGEND_VIEW_THRESHOLD == 1_000_000


# ---------------------------------------------------------------------------
# 旧公式（<54）阶梯边界：发行天数 D 的 8 档系数 + 兜底
# ---------------------------------------------------------------------------
def test_time_correction_old_ladder_boundaries():
    period_end = 1_700_000_000
    # D=0（当天投稿）→ D≤1 → 2.47
    assert time_correction_old(period_end, period_end) == 2.47
    # D=1 → 2.47
    assert time_correction_old(period_end - DAY, period_end) == 2.47
    # D=2 → 2.06
    assert time_correction_old(period_end - 2 * DAY, period_end) == 2.06
    # D=8 → 1.01
    assert time_correction_old(period_end - 8 * DAY, period_end) == 1.01
    # D=9 → 1.0（超出阶梯兜底）
    assert time_correction_old(period_end - 9 * DAY, period_end) == 1.0
    # D=100 → 1.0
    assert time_correction_old(period_end - 100 * DAY, period_end) == 1.0


# ---------------------------------------------------------------------------
# 中间公式（54−103）：投稿超 7 天应回退为 1.0，新曲晚 1 天取第 1 档
# ---------------------------------------------------------------------------
def test_time_correction_mid_beyond_week_falls_back_to_1():
    period_start = 1_700_000_000
    # 晚 8 天 → 超出 7 档阶梯 → t = 1.0
    assert time_correction_mid(period_start + 8 * DAY, period_start) == 1.0
    # 晚 0.x 周五以内（约 0.5 天）→ k=0 → 1.0527
    assert time_correction_mid(period_start + int(0.5 * DAY), period_start) == pytest.approx(1.0527, abs=1e-4)


# ---------------------------------------------------------------------------
# 连续对数公式 clamped 上限：极端新曲 delta 不应溢出/越界
# ---------------------------------------------------------------------------
def test_time_correction_clamps_to_max():
    period_start = 1_700_000_000
    fars = period_start + 400 * DAY  # > DT_ANOMALY_MAX(365 天) → 先夹取再算
    t = time_correction(fars, period_start)
    assert t == 50.0  # 被 T_CLAMP_MAX 截断
    assert 0 < t <= 50.0
