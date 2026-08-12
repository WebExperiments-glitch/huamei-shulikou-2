"""数据质量校验与交叉核验（多重冗余第二/三道防线）。

两层防护：
1) 摄入校验 (validate_issue_rows)：官方同步写入前，逐行检查 bvid 格式、指标非负、
   官方 score 存在且为正、rank 在 1..N 连续无重复。明显损坏的行被剔除并告警，
   可疑但不致命的行保留并告警（非阻断，避免一次脏响应拖垮整期同步）。
2) 公式交叉核验 (cross_check_issue)：同步完成后，用本地公式（rank.time_correction +
   权重）独立重算每首 self_score，与官方 score 比对。若整体偏差率超阈值，
   记 WARNING —— 这能第一时间发现「官方数据口径变化 / 本地公式漂移 / 摄入错位」。
   官方排名仍直接采用官方 score/rank（100% 复现），交叉核验仅作冗余哨兵。
"""
from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# B站 bvid 形如 BV1xx411c7mD（BV + 10 位 Base58 字符），放宽校验避免误杀。
BV_RE = re.compile(r"^BV[0-9A-Za-z]{8,12}$")

# 交叉核验：相对误差超过该比例视为「偏差行」
MISMATCH_REL = 0.05
# 整期偏差行占比超过该比例触发 WARNING（数据层异常信号）
MISMATCH_RATE_WARN = 0.25


def _is_int_like(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_issue_rows(rows: list[list[Any]], board_type: str) -> tuple[list[list[Any]], list[str]]:
    """对单期榜单待插入行做校验。

    入参 rows：与 sync_official.sync_one 中 INSERT 顺序一致的元组列表
    (rank, bvid, title, view, favorite, coin, like, score, pubtime, issue_id, weeks_on_board, peak_rank)。
    返回 (clean_rows, warnings)。clean_rows 为剔除「明显损坏」行后的列表；
    warnings 为告警文本列表（含被剔除/保留可疑行的说明）。
    """
    warnings: list[str] = []
    clean: list[list[Any]] = []
    seen_bvid: set[str] = set()
    n = len(rows)

    for i, r in enumerate(rows):
        # 结构保护：长度不足直接剔除
        if not isinstance(r, (list, tuple)) or len(r) < 8:
            warnings.append(f"行{i}: 结构异常(字段数={len(r) if isinstance(r,(list,tuple)) else '?'}), 剔除")
            continue
        rank, bvid, _title, view, fav, coin, like, score = r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]
        pubtime = r[8] if len(r) > 8 else 0

        drop = False
        # 1) bvid 格式
        if not (isinstance(bvid, str) and BV_RE.match(bvid)):
            warnings.append(f"行{i}: bvid 格式非法({bvid!r}), 剔除")
            drop = True
        # 2) 指标非负
        for name, val in (("view", view), ("favorite", fav), ("coin", coin), ("like", like)):
            if _is_int_like(val) and val < 0:
                warnings.append(f"行{i} bvid={bvid}: {name} 为负({val}), 剔除")
                drop = True
        # 3) 官方 score 必须存在且为正
        if not _is_int_like(score) or score <= 0:
            warnings.append(f"行{i} bvid={bvid}: score 缺失/非正({score!r}), 剔除")
            drop = True
        # 4) pubtime 非负（0 允许，代表缺失）
        if _is_int_like(pubtime) and pubtime < 0:
            warnings.append(f"行{i} bvid={bvid}: pubtime 为负({pubtime}), 置 0")
            r = list(r)
            r[8] = 0
        # 5) 重复 bvid（同 issue 内）
        if not drop and bvid in seen_bvid:
            warnings.append(f"行{i}: 重复 bvid({bvid}), 剔除重复项")
            drop = True
        if not drop:
            seen_bvid.add(bvid)
            clean.append(r)
        if drop:
            continue

    # 6) rank 连续性（1..N 应对齐行数）
    ranks = [r[0] for r in clean if _is_int_like(r[0])]
    if ranks and (min(ranks) != 1 or max(ranks) != len(ranks) or len(set(ranks)) != len(ranks)):
        warnings.append(f"rank 不连续或重复: min={min(ranks)} max={max(ranks)} count={len(ranks)} (期望 1..{len(ranks)})")

    if len(clean) != n:
        warnings.append(f"摄入校验: 剔除 {n - len(clean)}/{n} 行, 保留 {len(clean)} 行")
    return clean, warnings


def cross_check_issue(conn, board_type: str, issue_key: str,
                      formula_version: str | None = None) -> dict:
    """同步后用本地公式重算 self_score 与官方 score 比对（冗余哨兵）。

    返回 {checked, mismatches, mismatch_rate, max_rel, warn, sample[]}。
    """
    from . import boards as boards_svc
    from .rank import DEFAULT_WEIGHTS, OLD_WEIGHTS, NEW_FORMULA_FROM_ISSUE, time_correction, time_correction_old

    table = boards_svc._table_name(board_type, issue_key)
    # 注意：传入的 conn 通常为裸 sqlite3 连接（无 Row factory），按元组索引访问。
    # SELECT 顺序：rank, bvid, view, favorite, coin, like, score, pubtime, issue_id
    rows = conn.execute(
        f'SELECT rank, bvid, view, favorite, coin, like, score, pubtime, issue_id '
        f'FROM "{table}"'
    ).fetchall()
    if not rows:
        return {"checked": 0, "warn": False, "note": "空表"}

    # 公式版本判定（与 boards.get_issue_rankings 一致）
    is_old = formula_version == "old"
    if formula_version is None and board_type == "weekly":
        iid = next((r[8] for r in rows if r[8] is not None), None)
        is_old = (iid is not None and iid < NEW_FORMULA_FROM_ISSUE)
    w = OLD_WEIGHTS if is_old else DEFAULT_WEIGHTS
    anchor = boards_svc._settle_ts(issue_key) - (0 if is_old else 7 * 86400)

    mismatches = 0
    rels: list[float] = []
    sample: list[dict] = []
    for r in rows:
        bvid = r[1]
        view, fav, coin, like = r[2] or 0, r[3] or 0, r[4] or 0, r[5] or 0
        pub = r[7] or 0
        official = r[6] or 0
        t = time_correction_old(int(pub), anchor) if is_old else time_correction(int(pub), anchor) if pub else (2.47 if is_old else 1.0)
        self_score = (view * w["view"] * t + fav * w["favorite"] + like * w["like"] + coin * w["coin"])
        if official > 0:
            rel = abs(self_score - official) / official
            rels.append(rel)
            if rel > MISMATCH_REL:
                mismatches += 1
                if len(sample) < 5:
                    sample.append({"bvid": bvid, "official": round(official, 1),
                                   "self": round(self_score, 1), "rel": round(rel, 3), "t": round(t, 4)})

    checked = len(rels)
    mismatch_rate = (mismatches / checked) if checked else 0.0
    max_rel = max(rels) if rels else 0.0
    warn = mismatch_rate > MISMATCH_RATE_WARN
    if warn:
        logger.warning(
            "[cross_check] %s/%s 偏差率 %.1f%% 超阈值(>%.0f%%)！疑似官方口径变化或摄入错位。max_rel=%.2f",
            board_type, issue_key, mismatch_rate * 100, MISMATCH_RATE_WARN * 100, max_rel,
        )
    else:
        logger.info("[cross_check] %s/%s 校验通过: 偏差率 %.1f%% (n=%d, max_rel=%.2f)",
                    board_type, issue_key, mismatch_rate * 100, checked, max_rel)
    return {
        "checked": checked, "mismatches": mismatches,
        "mismatch_rate": round(mismatch_rate, 4), "max_rel": round(max_rel, 4),
        "warn": warn, "sample": sample,
    }
