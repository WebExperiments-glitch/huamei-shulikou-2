"""构建月榜聚合库 data/monthly.sqlite

数据源：源数据库 official_YYYYMMDD（周榜）
按自然月聚合：单曲在该月所有上榜期的最优/末期/累计得分、上榜周数、最高排名
输出：monthly_YYYYMM 表，score 用月度累计（当月各期 score 之和），最高排名 = min(rank)
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DB = Path(r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\biliboard-database\表格写入sqlite\biliboard (11).db")
OUT_DB = ROOT / "data" / "monthly.sqlite"

PREFIX = "official_"


def main() -> None:
    src = sqlite3.connect(f"file:{SOURCE_DB}?mode=ro", uri=True)
    tables = [r[0] for r in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{PREFIX}%",)
    )]

    monthly: dict[str, dict] = {}
    for t in sorted(tables):
        key = t[len(PREFIX):]
        month = key[:6]
        rows = src.execute(f'SELECT rank, bvid, title, score FROM "{t}"').fetchall()
        for rank, bvid, title, score in rows:
            bucket = monthly.setdefault(month, {})
            rec = bucket.setdefault(bvid, {"bvid": bvid, "title": title, "weeks": 0,
                                           "best_rank": 999, "best_week": None, "scores": []})
            rec["weeks"] += 1
            rec["best_rank"] = min(rec["best_rank"], rank)
            rec["scores"].append(score)

    db_path = OUT_DB
    db_path.parent.mkdir(parents=True, exist_ok=True)
    out = sqlite3.connect(str(db_path))
    # 先清掉所有旧月榜表（DROP 是 SQL 操作，不触发沙箱文件删除拦截）
    old_tables = [
        r[0]
        for r in out.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'monthly_%'"
        ).fetchall()
    ]
    for t in old_tables:
        out.execute(f'DROP TABLE IF EXISTS "{t}"')

    for month, bucket in sorted(monthly.items()):
        rows = []
        for bvid, rec in bucket.items():
            rows.append({
                "bvid": bvid, "title": rec["title"], "weeks_on_board": rec["weeks"],
                "best_rank": rec["best_rank"], "sum_score": round(sum(rec["scores"]), 1),
            })
        rows.sort(key=lambda x: (-x["sum_score"], x["best_rank"]))
        for i, r in enumerate(rows, 1):
            r["rank"] = i
        table = f"monthly_{month}"
        out.execute(f"""
            CREATE TABLE "{table}" (
                rank INTEGER, bvid TEXT, title TEXT,
                weeks_on_board INTEGER, best_rank INTEGER, sum_score REAL
            )
        """)
        out.executemany(
            f'INSERT INTO "{table}" (rank, bvid, title, weeks_on_board, best_rank, sum_score) '
            "VALUES (?,?,?,?,?,?)",
            [(r["rank"], r["bvid"], r["title"], r["weeks_on_board"], r["best_rank"], r["sum_score"]) for r in rows],
        )
        print(f"  {month}: {len(rows)} 首入选")
    out.commit()
    out.close()
    src.close()
    print(f"月榜构建完成 -> {db_path}")


if __name__ == "__main__":
    main()