"""构建日榜快照库 data/daily.sqlite
数据源：biliboard历史数据/snapshots.csv（周快照，每首歌在多个时点的播放/赞/藏/币）

生成：daily_YYYYMMDD 表，每行 = 当次快照的全量数据 + 相对上一快照的增量得分
排序指标（社区近似 score）：like + favorite * 5 + coin * 5 + share * 2
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SNAP_CSV = ROOT.parent / "biliboard历史数据" / "snapshots.csv"
OUT_DB = ROOT / "data" / "daily.sqlite"

WEIGHTS = {"like": 1.0, "favorite": 5.0, "coin": 5.0, "share": 2.0}


def main() -> None:
    if not SNAP_CSV.exists():
        print(f"找不到快照文件: {SNAP_CSV}")
        sys.exit(1)
    df = pd.read_csv(SNAP_CSV)
    df["ts"] = pd.to_datetime(df["timestamp"])
    df["date_key"] = df["ts"].dt.strftime("%Y%m%d")
    for col in ("view", "favorite", "coin", "share", "like"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["score"] = (df["like"] * WEIGHTS["like"]
                   + df["favorite"] * WEIGHTS["favorite"]
                   + df["coin"] * WEIGHTS["coin"]
                   + df["share"] * WEIGHTS["share"]).round(1)

    db_path = OUT_DB
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)

    groups = df.groupby("date_key")
    for date_key, g in groups:
        g = g.sort_values("score", ascending=False).reset_index(drop=True)
        g = g.head(100)
        g = g.assign(rank=range(1, len(g) + 1))
        table = f"daily_{date_key}"
        conn.execute(f"""
            CREATE TABLE "{table}" (
                rank INTEGER, bvid TEXT, name TEXT,
                view INTEGER, favorite INTEGER, coin INTEGER, share INTEGER, like INTEGER,
                score REAL, date_key TEXT
            )
        """)
        conn.executemany(
            f'INSERT INTO "{table}" (rank, bvid, name, view, favorite, coin, share, like, score, date_key) '
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [tuple(r) for r in g[["rank", "bv", "name", "view", "favorite", "coin", "share", "like", "score", "date_key"]].itertuples(index=False)],
        )
    conn.commit()
    n = conn.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").fetchone()[0]
    conn.close()
    print(f"日榜快照构建完成：{n} 期 -> {db_path}")


if __name__ == "__main__":
    main()