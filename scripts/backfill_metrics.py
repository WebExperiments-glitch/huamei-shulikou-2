"""全池播放指标补抓脚本（数据覆盖增强）

背景：songs_all 收录池 12381 首，但仅有 data*/legend_/annual_ 表中出现过的歌曲
（约 2,480 首）有播放/收藏/硬币/点赞指标，其余约 9,900 首在歌曲库中显示「—」。

本脚本遍历 songs_all 中「无指标」的 BV，通过 B 站公开 view 接口逐首抓取实时指标，
写入 hot.sqlite 的 hot_cache 表（与实时热度共用缓存，抓过后 songs._build_metrics
自动合并，歌曲库即时获得指标）。

特性：
- 断点续跑：hot_cache 中已存在（status=ok）的 bvid 自动跳过
- 限速 + 抖动 + -412 风控冷却（复用 crawler 的 Throttle/重试）
- 支持 --limit / --start 分批执行，避免单次请求过多触发风控
- 进度实时打印，Ctrl+C 安全退出（已抓取的已落库）

用法:
    python scripts/backfill_metrics.py                  # 全部无指标歌曲
    python scripts/backfill_metrics.py --limit 500      # 只抓 500 首（建议先小批量验证）
    python scripts/backfill_metrics.py --start 500 --limit 500   # 断点续跑
    python scripts/backfill_metrics.py --dry-run        # 只看待抓数量，不实际抓取
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services import crawler  # noqa: E402
from app.services.songs import _build_metrics  # noqa: E402

import app.core.db as db  # noqa: E402


def collect_missing(conn: sqlite3.Connection, hot: sqlite3.Connection) -> list[str]:
    """收集 songs_all 中无指标且未抓取过的 bvid（升序，稳定分页）。

    ⚠️ B 站 BV 号为 Base58 编码，**大小写敏感**：songs_all 中多为混合大小写
    （如 BV1ibzyBUEaS），请求必须用原始大小写，uppercase 后 B 站返回 -404。
    去重集合统一用 upper()，返回列表保留原始大小写。
    """
    metrics = _build_metrics(conn)
    already = {r[0].upper() for r in hot.execute("SELECT bvid FROM hot_cache WHERE status='ok'")}
    missing = []
    for r in conn.execute("SELECT bvid FROM songs_all ORDER BY id"):
        bv = (r[0] or "").strip()
        if bv and bv.upper() not in metrics and bv.upper() not in already:
            missing.append(bv)
    return missing


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="本次最多抓取数量（0=全部）")
    ap.add_argument("--start", type=int, default=0, help="从第 N 个缺失项开始（断点续跑）")
    ap.add_argument("--dry-run", action="store_true", help="只统计待抓数量，不抓取")
    ap.add_argument("--interval", type=float, default=0, help="覆盖请求间隔（秒，默认用 crawler 节流）")
    args = ap.parse_args()

    if args.interval > 0:
        crawler.MIN_INTERVAL = args.interval

    conn = db.connect_source()
    hot = crawler.connect_hot(readonly=False)
    try:
        missing = collect_missing(conn, hot)
        total_missing = len(missing)
        print(f"[backfill] songs_all 无指标待抓: {total_missing} 首")

        if args.dry_run:
            print(f"[backfill] dry-run 完成（limit={args.limit or '全部'}）")
            return

        batch = missing[args.start:]
        if args.limit > 0:
            batch = batch[: args.limit]
        if not batch:
            print("[backfill] 没有需要抓取的歌曲")
            return

        print(f"[backfill] 本次抓取 {len(batch)} 首（从索引 {args.start} 起）")
        throttle = crawler.Throttle()
        ok = fail = deleted = 0
        t0 = time.time()
        for i, bv in enumerate(batch):
            status, data = crawler.fetch_stat(bv, throttle)
            if status == "ok":
                crawler._upsert(hot, {"bvid": bv, "title_cn": ""}, "ok", data)
                ok += 1
            elif status == "deleted":
                crawler._upsert(hot, {"bvid": bv, "title_cn": ""}, "deleted", {})
                deleted += 1
            else:
                crawler._upsert(hot, {"bvid": bv, "title_cn": ""}, "error", {})
                fail += 1
            if (i + 1) % 50 == 0 or i == len(batch) - 1:
                el = time.time() - t0
                rate = (i + 1) / el if el > 0 else 0
                print(
                    f"  [{i + 1}/{len(batch)}] ok={ok} deleted={deleted} fail={fail} "
                    f"耗时 {el:.0f}s 速率 {rate:.1f}/s"
                )
        print(f"[backfill] 完成: ok={ok} deleted={deleted} fail={fail}（合计 {len(batch)}）")
    finally:
        hot.close()
        conn.close()


if __name__ == "__main__":
    main()
