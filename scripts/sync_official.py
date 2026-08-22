"""官方 API 同步脚本（biliboard.uk v2 — 新 API）
官方数据源已迁移：旧 s5.biliboard.uk/api/x/board 已失效，
新 API 与官网同域（biliboard.uk/api/public/...），至今每周仍在更新（2026-08 已验证）。

用法:
    python scripts/sync_official.py            # 只同步周榜首榜（推荐日常）
    python scripts/sync_official.py --all      # 同步周榜+传说曲榜+年榜
    python scripts/sync_official.py --songs    # 同步收录池（songs_all，无二创全池）
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
# 让脚本能复用后端统一的 robots.txt 合规层（biliboard.uk 为允许，仅作透明校验/日志）。
sys.path.insert(0, str(ROOT / "backend"))
from app.core import robots as robots_mod  # noqa: E402
from app.services import backup as backup_mod  # noqa: E402
from app.services import boards as boards_svc  # noqa: E402

SYNC_UA = (
    "ShuliKouWeeklyBoard-Sync/1.0 "
    "(+local fan ranking project; respects robots.txt)"
)
SOURCE_DB = Path(r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\biliboard-database\表格写入sqlite\biliboard (11).db")

BOARD_IDS = {"weekly": 1, "legend": 2, "annual": 3}
PREFIXES = {"weekly": "official_", "legend": "legend_", "annual": "annual_"}

# 榜单表统一结构（sync_one / 暂存交换共用）
TABLE_SCHEMA = """(rank INTEGER, bvid TEXT, title TEXT, view INTEGER, favorite INTEGER,
    coin INTEGER, like INTEGER, score REAL, pubtime INTEGER, issue_id INTEGER,
    weeks_on_board INTEGER, peak_rank INTEGER)"""

API = "https://biliboard.uk/api/public"
SONGS_URI = "/songs"
BOARDS_URI = "/boards"
ISSUES_URI = "/boards/{bid}/issues"
RANKINGS_URI = "/boards/{bid}/issues/{iid}/rankings"

SONGS_COLS = ["id", "bvid", "pubtime", "title", "title_cn",
              "first_recorded_at", "producers", "vocalists"]


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    """判断本地是否已存在该榜单表。"""
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def existing_issues(conn: sqlite3.Connection, prefix: str) -> set[int]:
    """已同步过的期号（以 issue_id 为准，跨表去重）。"""
    known: set[int] = set()
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    ).fetchall()
    for (name,) in rows:
        try:
            for (iid,) in conn.execute(f'SELECT DISTINCT issue_id FROM "{name}" WHERE issue_id IS NOT NULL'):
                known.add(iid)
        except sqlite3.Error:
            continue
    return known


def get_json(client: httpx.Client, url: str, **params) -> dict | list:
    resp = client.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()


def _local_latest_date(conn: sqlite3.Connection, prefix: str) -> str | None:
    """本地已同步表名中最大的日期后缀（official_20260803 → 20260803）。"""
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    ).fetchall()
    dates = []
    for (name,) in rows:
        suffix = name[len(prefix):]
        if len(suffix) == 8 and suffix.isdigit():
            dates.append(suffix)
    return max(dates) if dates else None


def sync_one(client: httpx.Client, conn: sqlite3.Connection, board_type: str,
             max_lookback: int = 8) -> dict:
    """按 issues 列表增量同步某榜。

    自动判断：先比对本地已有哪些期号，只下载远端有、本地没有的期次（增量）。
    返回 {new, remote_latest, local_latest, up_to_date}：
      new          - 本次新增期数
      remote_latest- biliboard 最新一期日期(YYYYMMDD)
      local_latest - 本地最新一期日期(YYYYMMDD) 或 None
      up_to_date   - 本地是否已与 biliboard 一致（无新增）
    """
    bid = BOARD_IDS[board_type]
    prefix = PREFIXES[board_type]
    known = existing_issues(conn, prefix)

    issues = get_json(client, f"{API}{ISSUES_URI.format(bid=bid)}")
    if not isinstance(issues, list) or not issues:
        print(f"  [{board_type}] 无 issues 数据")
        return {"new": 0, "remote_latest": None, "local_latest": None, "up_to_date": True}
    issues.sort(key=lambda x: x.get("id") or 0, reverse=True)

    remote_latest_date = None
    if issues[0].get("end_date"):
        remote_latest_date = datetime.fromtimestamp(
            issues[0]["end_date"], tz=timezone.utc
        ).strftime("%Y%m%d")
    local_latest = _local_latest_date(conn, prefix)

    synced = 0
    for issue in issues[:max_lookback]:
        iid = issue.get("issue_id") or issue.get("id")
        if not iid:
            continue
        end_ts = issue.get("end_date") or 0
        date_key = datetime.fromtimestamp(end_ts, tz=timezone.utc).strftime("%Y%m%d")
        # 增量判定：已按 issue_id 同步过，或本地已有对应日期表。
        # 后者兜底 legend / 新式 annual 等无 issue_id 列的 legacy 表（existing_issues 读不到），
        # 否则每次都会全量重下传说榜且 up_to_date 恒为 False。
        if iid in known or _table_exists(conn, f"{prefix}{date_key}"):
            continue
        try:
            board = get_json(client, f"{API}{RANKINGS_URI.format(bid=bid, iid=iid)}")
        except httpx.HTTPStatusError:
            continue
        if not isinstance(board, list) or not board:
            continue
        table = f"{prefix}{date_key}"
        rows = []
        for r in board:
            stats = r.get("stats") or {}
            rows.append((
                r.get("rank"), r.get("bvid"), r.get("title"),
                stats.get("views") or 0, stats.get("favorites") or 0,
                stats.get("coins") or 0, stats.get("likes") or 0,
                r.get("score"), r.get("pubtime") or 0,
                iid,
                r.get("weeksOnBoard"), r.get("peakRank"),
            ))
        # —— 多重冗余·第二道防线：摄入逐行校验（剔除明显损坏行，保留可疑行并告警）——
        from app.services import data_quality as dq_mod  # 懒导入，避免脚本启动重依赖
        clean, warns = dq_mod.validate_issue_rows(rows, board_type)
        for w in warns:
            print(f"  [{board_type}] 校验告警 {date_key}: {w}")
        if not clean:
            print(f"  [{board_type}] {date_key} 全部行校验失败，跳过该期（保留旧表/无表，不写脏数据）")
            continue
        # —— 多重冗余·原子交换：先写暂存表，校验通过再 DROP 真表+RENAME，杜绝半成品表 ——
        staging = f"_stg_{table}"
        try:
            conn.execute(f'DROP TABLE IF EXISTS "{staging}"')
            conn.execute(f'CREATE TABLE "{staging}" {TABLE_SCHEMA}')
            conn.executemany(f'INSERT INTO "{staging}" VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', clean)
            conn.execute(f'DROP TABLE IF EXISTS "{table}"')
            conn.execute(f'ALTER TABLE "{staging}" RENAME TO "{table}"')
            conn.commit()
        except sqlite3.Error as e:
            # ⚠️ DROP 真表已被纳入当前未提交事务，若失败必须回滚否则后续 commit 会连带提交 DROP，
            # 导致本该保留的原表被永久删除！只有先回滚才能保证原表还在。
            conn.rollback()
            try:
                # 回滚后 staging 肯定不存在（整个事务已撤销），无需再删；这里为了兜底避免孤立文件
                conn.execute(f'DROP TABLE IF EXISTS "{staging}"')
                conn.commit()
            except sqlite3.Error:
                pass
            print(f"  [{board_type}] {date_key} 写入失败已回滚暂存: {e}")
            continue
        synced += 1
        dropped = len(rows) - len(clean)
        print(f"  [{board_type}] 同步 {date_key}: {len(clean)} 条" + (f"（校验剔除 {dropped}）" if dropped else ""))
        # —— 多重冗余·第三道防线：用本地公式重算与官方 score 交叉核验（偏差超阈告警）——
        try:
            cc = dq_mod.cross_check_issue(conn, board_type, date_key)
            if cc.get("warn"):
                print(f"  [{board_type}] ⚠ 交叉核验偏差率 {cc['mismatch_rate']*100:.1f}% 超阈值，请核查数据源/公式口径")
        except Exception as e:  # noqa: BLE001
            print(f"  [{board_type}] 交叉核验跳过(非致命): {e}")
    return {
        "new": synced,
        "remote_latest": remote_latest_date,
        "local_latest": local_latest,
        "up_to_date": synced == 0,
    }


def sync_songs(client: httpx.Client, conn: sqlite3.Connection, per_page: int = 100) -> dict:
    """拉取官方收录池（无二创全池）增量写入 songs_all。

    修复过的三个坑（2026-08-21 数据停更事故复盘）：
      1) 分页截断：官方 /songs 每页实际最多返回 100 条（请求 per_page=200 也只回 100），
         旧逻辑 `len(items) < per_page` 会把第一页误判成最后一页 → 每次同步只处理
         第一页就退出。现在 per_page 对齐 100，终止条件改为 items 为空 + 页数上限保险。
      2) 行数跳过误判：官方下架歌曲时 total 会缩水，本地含历史残留行时 local_total
         恒 >= remote_total → 新歌长期进不来。现在改为「第一页无新歌 且 行数也追平」
         才跳过（第一页本来就是官方按收录时间降序的最新 100 首，零额外请求）。
      3) 主键冲突丢行：本地 songs_all.id 历史上直接沿用官方 id（=rowid）。官方下架
         重排后新歌 id 会与本地老行撞 PRIMARY KEY，被 INSERT OR IGNORE 静默丢弃，
         缺口永远补不上。现在插入不再写官方 id，让 rowid 自增（id 与官方脱钩，
         排序/关联均按 bvid，不受影响）。
    返回 {added, remote_total, local_total, up_to_date}。"""
    # 插入列：刻意排除官方 id（见 docstring 第 3 点），避免与本地历史行主键冲突
    insert_cols = [c for c in SONGS_COLS if c != "id"]

    # 确保收录池表存在（缺失则建表，避免后续查询/插入静默失败或全量跳过）
    conn.execute(f"CREATE TABLE IF NOT EXISTS songs_all ({', '.join(SONGS_COLS)})")
    local_total = 0
    try:
        local_total = conn.execute("SELECT COUNT(*) FROM songs_all").fetchone()[0]
    except sqlite3.Error:
        local_total = 0

    # 第一页：官方按收录时间降序，第一条即最新收录；同时拿 total
    try:
        first = get_json(client, f"{API}{SONGS_URI}", per_page=per_page, page=1)
    except Exception:  # noqa: BLE001
        first = None
    remote_total = first.get("total", 0) if isinstance(first, dict) else 0
    first_items = (first.get("data") or []) if isinstance(first, dict) else []

    def _has_new(items: list) -> bool:
        """items 里是否存在本地未收录的 bvid。"""
        for s in items:
            bvid = s.get("bvid")
            if not bvid:
                continue
            try:
                if not conn.execute(
                    "SELECT 1 FROM songs_all WHERE bvid=?", (bvid,)
                ).fetchone():
                    return True
            except sqlite3.Error:
                return True  # 查询异常按有新歌处理，进入逐页模式兜底
        return False

    # 跳过条件（双保险）：第一页无新歌 且 行数也已追平远端
    if first_items and not _has_new(first_items) and local_total >= remote_total > 0:
        print(f"  [songs] 已为最新（本地 {local_total} / 远端 {remote_total}）")
        return {"added": 0, "remote_total": remote_total,
                "local_total": local_total, "up_to_date": True}

    added = 0
    page = 1
    max_pages = 400  # 保险上限：400 页 × 100 条 = 4 万条，防接口异常空转
    while page <= max_pages:
        if page == 1 and first_items:
            items = first_items  # 复用已拉取的第一页，省一次请求
        else:
            try:
                payload = get_json(client, f"{API}{SONGS_URI}", per_page=per_page, page=page)
            except Exception as e:  # noqa: BLE001
                print(f"  [songs] 第 {page} 页拉取失败，中止翻页：{e}")
                break
            items = payload.get("data") or [] if isinstance(payload, dict) else payload
        if not items:
            break
        for s in items:
            bvid = s.get("bvid")
            if not bvid:
                continue
            try:
                exists = conn.execute(
                    "SELECT 1 FROM songs_all WHERE bvid=?", (bvid,)
                ).fetchone()
            except sqlite3.Error:
                exists = False  # 表已确保存在；查询异常视为未收录，尝试插入
            if exists:
                continue
            try:
                conn.execute(
                    f"INSERT OR IGNORE INTO songs_all ({', '.join(insert_cols)}) "
                    f"VALUES ({','.join('?' * len(insert_cols))})",
                    tuple(_as_text(s.get(c)) if c in ("producers", "vocalists")
                          else s.get(c) for c in insert_cols),
                )
                conn.commit()
                added += 1
            except sqlite3.Error as e:
                print(f"  [songs] 插入失败 {bvid}: {e}")
                conn.rollback() if hasattr(conn, "rollback") else None
        if len(items) < per_page:
            # 官方实际上限就是 100，正常最后一页必然 < 100；
            # 但 per_page 已对齐 100，此处能安全作为「数据翻完」的信号
            break
        page += 1
    print(f"  [songs] 收录池新增 {added} 条（本地 {local_total} → {local_total + added}）")
    return {"added": added, "remote_total": remote_total,
            "local_total": local_total, "up_to_date": added == 0}


def _as_text(v) -> str | None:
    if v is None:
        return None
    return json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v


def run_pipeline(types: list[str] | tuple[str, ...] = ("weekly", "legend", "annual"),
                 songs: bool = False, rebuild_monthly: bool = True) -> dict:
    """执行完整同步流水线：增量拉取指定期次榜单 + 可选收录池 + 重建月榜。

    返回汇总：
      {
        boards:        {board: {new, remote_latest, local_latest, up_to_date}},
        songs:         {added, remote_total, local_total, up_to_date} | None,
        monthly_built: bool,
        checked:       [board, ...],
        all_up_to_date:bool,   # 所有已检查项均无新增时为 True
      }
    """
    import importlib.util

    summary: dict = {"boards": {}, "songs": None, "monthly_built": False,
                     "checked": [], "all_up_to_date": False}
    # robots.txt 透明校验：biliboard.uk 对 /api/public 为 Allow，确认无违规后再同步。
    rb = robots_mod.summary("biliboard.uk")
    print(f"[robots] biliboard.uk: {rb.get('allows_root') and 'Allow / (合规)' or rb}")
    # —— 多重冗余·第一道防线：写入前对不可逆真源库做时间点备份 ——
    backup_mod.backup_database(SOURCE_DB)
    conn = sqlite3.connect(SOURCE_DB)
    try:
        with httpx.Client(headers={"User-Agent": SYNC_UA}) as client:
            for bt in types:
                summary["boards"][bt] = sync_one(client, conn, bt)
                boards_svc.invalidate_issues_cache(bt)  # 写库后立即失效 list_issues 缓存
                summary["checked"].append(bt)
            if songs:
                summary["songs"] = sync_songs(client, conn)
                summary["checked"].append("songs")
    finally:
        conn.close()

    if rebuild_monthly:
        try:
            spec = importlib.util.spec_from_file_location(
                "build_monthly", str(Path(__file__).resolve().parent / "build_monthly.py")
            )
            bm = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(bm)
            bm.main()
            summary["monthly_built"] = True
            print("[monthly] 月榜已重建")
        except Exception as e:  # noqa: BLE001
            print(f"[monthly] 重建失败: {e}")

    board_all_ok = all(b.get("up_to_date", False) for b in summary["boards"].values())
    songs_ok = True
    if songs and summary["songs"] is not None:
        songs_ok = summary["songs"].get("up_to_date", False)
    summary["all_up_to_date"] = board_all_ok and songs_ok
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="同步全部三榜")
    parser.add_argument("--songs", action="store_true", help="同步收录池 songs_all")
    parser.add_argument("--no-monthly", action="store_true", help="不同步后重建月榜")
    args = parser.parse_args()

    types = list(BOARD_IDS) if args.all else ["weekly"]
    summary = run_pipeline(
        types=types,
        songs=args.songs or args.all,
        rebuild_monthly=not args.no_monthly,
    )
    print("汇总:", json.dumps(summary, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()