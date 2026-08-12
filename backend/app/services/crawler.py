"""B 站实时热度爬虫：通过公开 API 抓取术曲 BV 的实时播放/收藏/硬币/点赞/分享。

反爬策略：使用 scrapling 的 Fetcher（模拟 Chrome TLS 指纹 + 浏览器头部），
遇 -412 风控自动冷却重试。数据存 hot.sqlite 供排行接口读取。
"""
from __future__ import annotations

import json
import logging
import random
import re
import sqlite3
import threading
import time
from collections import OrderedDict
from pathlib import Path

from scrapling.fetchers import Fetcher

from ..core import config, db, robots as robots_mod

logger = logging.getLogger(__name__)

API_VIEW = "https://api.bilibili.com/x/web-interface/view"
# 诚实 UA：标识本项目身份（礼貌抓取，非隐蔽）。配合 scrapling chrome TLS 指纹使用，
# 既满足反爬稳定性，又对目标站透明可识别。
CRAWLER_UA = (
    "ShuliKouWeeklyBoard/1.0 "
    "(+local fan ranking project; respects robots.txt; contact via repo)"
)
HEADERS = {"Referer": "https://www.bilibili.com/", "User-Agent": CRAWLER_UA}

BOARD_PREFIXES = ("official_", "legend_", "annual_", "data")

MIN_INTERVAL = 0.35
JITTER = 0.25
RETRY_TIMES = 3
RETRY_BACKOFF = (1.0, 2.5, 6.0)
BLOCK_COOLDOWN = 60.0

ALLOWED_SORTS = {"score", "view", "favorite", "coin", "like", "share", "pubtime"}

# 综合分 = 播放 + 收藏×15 + 硬币×30 + 点赞×3（Biliboard 周榜权重，累计口径）
SCORE_SQL = "view + favorite * 15 + coin * 30 + like * 3"

# 标签（殿堂/传说/神话）播放量阈值区间 [lo, hi)
_TIER_RANGE = {
    "myth": (10_000_000, None),
    "legend": (1_000_000, 10_000_000),
    "hall": (100_000, 1_000_000),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS hot_cache (
    bvid TEXT PRIMARY KEY,
    title TEXT,
    title_cn TEXT,
    owner TEXT,
    pubtime INTEGER,
    view INTEGER, favorite INTEGER, coin INTEGER,
    like INTEGER, share INTEGER,
    status TEXT DEFAULT 'ok',
    fetch_time INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hot_status ON hot_cache(status);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    scope TEXT NOT NULL,
    count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshot_stats (
    snapshot_id INTEGER NOT NULL,
    bvid TEXT NOT NULL,
    title TEXT, owner TEXT, pubtime INTEGER,
    view INTEGER, favorite INTEGER, coin INTEGER, like INTEGER, share INTEGER,
    PRIMARY KEY (snapshot_id, bvid)
);
CREATE INDEX IF NOT EXISTS idx_snap_bvid ON snapshot_stats(bvid);

CREATE TABLE IF NOT EXISTS weekly_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_type TEXT NOT NULL DEFAULT 'weekly',
    issue INTEGER NOT NULL,
    start_snapshot INTEGER NOT NULL,
    end_snapshot INTEGER NOT NULL,
    top INTEGER NOT NULL DEFAULT 50,
    settled_at INTEGER NOT NULL,
    formula TEXT NOT NULL,
    UNIQUE(board_type, issue)
);
CREATE TABLE IF NOT EXISTS weekly_ranks (
    issue_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    bvid TEXT NOT NULL,
    title TEXT, owner TEXT, pubtime INTEGER,
    dv INTEGER, df INTEGER, dc INTEGER, dl INTEGER,
    t REAL NOT NULL DEFAULT 1.0,
    score REAL NOT NULL,
    weeks INTEGER,
    best_rank INTEGER,
    PRIMARY KEY (issue_id, bvid)
);
"""

TASK: dict = {
    "running": False,
    "scope": None,
    "total": 0,
    "done": 0,
    "ok": 0,
    "deleted": 0,
    "failed": 0,
    "started_at": None,
    "finished_at": None,
    "snapshot_id": None,
    "message": None,
}
TASK_LOCK = threading.Lock()


def _migrate(conn: sqlite3.Connection) -> None:
    """存量 hot.sqlite 的一次性结构迁移（幂等）。

    - weekly_issues 增加 board_type 列并将 UNIQUE(issue) 改为 UNIQUE(board_type, issue)；
      旧数据回填 board_type='weekly'，formula 补 version 键。
    - weekly_ranks 增加 weeks / best_rank 两列（仅聚合榜使用）。
    """
    cols = {r[1] for r in conn.execute("PRAGMA table_info(weekly_issues)")}
    if "board_type" not in cols:
        conn.execute(
            """CREATE TABLE weekly_issues_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_type TEXT NOT NULL DEFAULT 'weekly',
                issue INTEGER NOT NULL,
                start_snapshot INTEGER NOT NULL,
                end_snapshot INTEGER NOT NULL,
                top INTEGER NOT NULL DEFAULT 50,
                settled_at INTEGER NOT NULL,
                formula TEXT NOT NULL,
                UNIQUE(board_type, issue)
            )"""
        )
        conn.execute(
            """INSERT INTO weekly_issues_new
                (id, board_type, issue, start_snapshot, end_snapshot, top, settled_at, formula)
               SELECT id, 'weekly', issue, start_snapshot, end_snapshot, top, settled_at, formula
               FROM weekly_issues"""
        )
        # formula 补 version 键（旧数据缺 version）
        for r in conn.execute("SELECT id, issue, formula FROM weekly_issues_new").fetchall():
            try:
                f = json.loads(r["formula"])
            except (json.JSONDecodeError, TypeError):
                f = {}
            if not isinstance(f, dict) or "version" not in f:
                f = {
                    "version": "old" if r["issue"] < 54 else "new",
                    "weights": f.get("weights", {}) if isinstance(f, dict) else {},
                }
                conn.execute(
                    "UPDATE weekly_issues_new SET formula=? WHERE id=?",
                    (json.dumps(f, ensure_ascii=False), r["id"]),
                )
        conn.execute("DROP TABLE weekly_issues")
        conn.execute("ALTER TABLE weekly_issues_new RENAME TO weekly_issues")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_wi_type ON weekly_issues(board_type, issue DESC)")

    rcols = {r[1] for r in conn.execute("PRAGMA table_info(weekly_ranks)")}
    if "weeks" not in rcols:
        conn.execute("ALTER TABLE weekly_ranks ADD COLUMN weeks INTEGER")
    if "best_rank" not in rcols:
        conn.execute("ALTER TABLE weekly_ranks ADD COLUMN best_rank INTEGER")

    # snapshot_stats 增加 title_cn 列（旧库该表无此列，涨速榜需展示中文名）
    sscols = {r[1] for r in conn.execute("PRAGMA table_info(snapshot_stats)")}
    if "title_cn" not in sscols:
        conn.execute("ALTER TABLE snapshot_stats ADD COLUMN title_cn TEXT")


_hot_ensured = False


def ensure_hot_schema() -> None:
    global _hot_ensured
    if _hot_ensured:
        return
    config.ensure_dirs()
    path = Path(config.HOT_DB)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        # 索引依赖 board_type 列，必须等 _migrate 保证该列存在后再建（旧库 CREATE TABLE 跳过）
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_wi_type ON weekly_issues(board_type, issue DESC)"
        )
        conn.commit()
    finally:
        conn.close()
    _hot_ensured = True


def connect_hot(readonly: bool = False) -> sqlite3.Connection:
    config.ensure_dirs()
    ensure_hot_schema()
    path = Path(config.HOT_DB)
    if readonly:
        uri = path.resolve().as_uri() + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _table_names(conn: sqlite3.Connection, prefix: str) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", (f"{prefix}%",)
    ).fetchall()
    return sorted(r[0] for r in rows)


def collect_pool(scope: str, recent_n: int = 10) -> list[dict]:
    """收集待抓取 BV 池。scope=all 全量收录池；recent 取各板块最近 recent_n 期去重。"""
    pool: dict[str, str] = {}
    conn = db.connect_source()
    try:
        if scope == "all":
            for r in conn.execute("SELECT bvid, title_cn FROM songs_all"):
                pool[r["bvid"]] = r["title_cn"] or ""
            for prefix in BOARD_PREFIXES:
                for t in _table_names(conn, prefix):
                    try:
                        for r in conn.execute(f'SELECT DISTINCT bvid FROM "{t}"'):
                            pool.setdefault(r["bvid"], "")
                    except sqlite3.Error:
                        continue
        else:
            maps = {r["bvid"]: (r["title_cn"] or "") for r in conn.execute(
                "SELECT bvid, title_cn FROM songs_all"
            )}
            for prefix in BOARD_PREFIXES:
                tables = sorted(_table_names(conn, prefix), reverse=True)[: recent_n]
                for t in tables:
                    try:
                        for r in conn.execute(f'SELECT DISTINCT bvid FROM "{t}"'):
                            pool[r["bvid"]] = maps.get(r["bvid"], "")
                    except sqlite3.Error:
                        continue
        return [{"bvid": b, "title_cn": c} for b, c in pool.items()]
    finally:
        conn.close()


class Throttle:
    """全局节流：任意两次请求间隔不小于 min_interval + 随机抖动。

    min_interval 取 MIN_INTERVAL 与 robots.txt 的 Crawl-delay 之大者，
    从而自动尊重目标站的爬虫速率要求。
    """

    def __init__(self) -> None:
        self.last = 0.0
        self.lock = threading.Lock()
        cd = robots_mod.crawl_delay(API_VIEW, CRAWLER_UA)
        self.min_interval = max(MIN_INTERVAL, cd) if cd else MIN_INTERVAL

    def wait(self) -> None:
        with self.lock:
            delay = self.min_interval + random.random() * JITTER
            wait = delay - (time.time() - self.last)
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()


_ROBOTS_WARNED = False


def _robots_allowed() -> bool:
    """robots.txt 合规闸。返回是否允许继续抓取 api.bilibili.com。

    - api.bilibili.com robots.txt 为 `Disallow: /`（反索引指令，非使用禁令）。
    - 默认（ROBOTS_STRICT=False）：按「透明例外」继续，并在首次时明确记录日志。
    - 严格模式（ROBOTS_STRICT=1）：直接拒绝，外面按 blocked 处理，仅用历史快照。
    """
    global _ROBOTS_WARNED
    if robots_mod.can_fetch(API_VIEW, CRAWLER_UA):
        return True
    if not _ROBOTS_WARNED:
        _ROBOTS_WARNED = True
        if robots_mod.STRICT:
            logger.error(
                "robots: api.bilibili.com 禁止抓取 (Disallow: /)，已启用 ROBOTS_STRICT → 拒绝实时抓取，仅用历史快照"
            )
        else:
            logger.warning(
                "robots: api.bilibili.com robots.txt 为 Disallow: /（反搜索引擎索引指令，非使用禁令）。"
                "本项目实时热度榜依赖其公开接口且无等价替代源，按透明例外继续：诚实 UA + 严格节流 + 本地缓存。"
                "如需完全合规，设置环境变量 ROBOTS_STRICT=1 关闭实时抓取。"
            )
    return not robots_mod.STRICT


def fetch_view(bvid: str, throttle: Throttle) -> tuple[str, dict]:
    """抓取单个 BV 的 B站 view 接口原始 data。返回 (status, data)，status ∈ ok / deleted / error / blocked。"""
    if not _robots_allowed():
        return "blocked", {}
    for attempt in range(RETRY_TIMES):
        throttle.wait()
        try:
            resp = Fetcher.get(
                API_VIEW, params={"bvid": bvid}, headers=HEADERS,
                impersonate="chrome", timeout=15,
            )
            payload = resp.json()
        except Exception as exc:
            logger.warning("fetch %s 网络错误：%r", bvid, exc)
            if attempt < RETRY_TIMES - 1:
                time.sleep(RETRY_BACKOFF[attempt] + random.random())
            continue

        code = payload.get("code")
        if code == 0:
            return "ok", payload.get("data") or {}
        if code in (-404, -400):
            return "deleted", {}
        if code == -412:
            logger.warning("BV %s 触发风控 -412，冷却 %.0fs 后重试（第 %d 次）", bvid, BLOCK_COOLDOWN, attempt + 1)
            time.sleep(BLOCK_COOLDOWN)
            continue
        logger.warning("BV %s 返回 code=%s message=%s，重试 %d", bvid, code, payload.get("message"), attempt + 1)
    return "error", {}


def fetch_stat(bvid: str, throttle: Throttle) -> tuple[str, dict]:
    """抓取单个 BV（精简字段）。返回 (status, data)，status ∈ ok / deleted / error。"""
    status, data = fetch_view(bvid, throttle)
    if status != "ok":
        return status, {}
    stat = data.get("stat") or {}
    owner = data.get("owner") or {}
    return "ok", {
        "title": data.get("title") or "",
        "owner": owner.get("name") or "",
        "pubtime": data.get("pubdate") or 0,
        "view": stat.get("view") or 0,
        "favorite": stat.get("favorite") or 0,
        "coin": stat.get("coin") or 0,
        "like": stat.get("like") or 0,
        "share": stat.get("share") or 0,
    }


def _upsert(conn: sqlite3.Connection, entry: dict, status: str, data: dict) -> None:
    conn.execute(
        """INSERT INTO hot_cache (bvid, title, title_cn, owner, pubtime, view, favorite, coin,
            like, share, status, fetch_time)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(bvid) DO UPDATE SET
             title=excluded.title, owner=excluded.owner, pubtime=excluded.pubtime,
             view=excluded.view, favorite=excluded.favorite, coin=excluded.coin,
             like=excluded.like, share=excluded.share, status=excluded.status,
             fetch_time=excluded.fetch_time
        """,
        (
            entry["bvid"],
            data.get("title") or entry["title_cn"] or entry["bvid"],
            entry["title_cn"],
            data.get("owner") or "",
            data.get("pubtime") or 0,
            data.get("view") or 0,
            data.get("favorite") or 0,
            data.get("coin") or 0,
            data.get("like") or 0,
            data.get("share") or 0,
            status,
            int(time.time()),
        ),
    )
    # 注意：不再逐行 commit，由调用方 _run 批量提交（见 COMMIT_EVERY），
    # 千首级抓取可将千次事务提交降为数十次，显著降低开销。


def _save_snapshot(conn: sqlite3.Connection, scope: str) -> int:
    """把当前 hot_cache 中 status='ok' 的数据落为一份快照，返回快照 id。"""
    rows = conn.execute(
        "SELECT bvid, title, title_cn, owner, pubtime, view, favorite, coin, like, share "
        "FROM hot_cache WHERE status='ok'"
    ).fetchall()
    cur = conn.execute(
        "INSERT INTO snapshots (created_at, scope, count) VALUES (?,?,?)",
        (int(time.time()), scope, len(rows)),
    )
    sid = cur.lastrowid
    conn.executemany(
        """INSERT INTO snapshot_stats (snapshot_id, bvid, title, title_cn, owner, pubtime,
            view, favorite, coin, like, share)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        [(sid, r["bvid"], r["title"], r["title_cn"], r["owner"], r["pubtime"], r["view"],
          r["favorite"], r["coin"], r["like"], r["share"]) for r in rows],
    )
    conn.commit()
    return sid


def _run(scope: str, recent_n: int) -> None:
    started = time.time()
    with TASK_LOCK:
        TASK.update(running=True, scope=scope, total=0, done=0, ok=0, deleted=0, failed=0,
                    started_at=started, finished_at=None, message="收集榜单 BV 中…")
    try:
        pool = collect_pool(scope, recent_n)
        with TASK_LOCK:
            TASK["total"] = len(pool)
            TASK["message"] = None
        conn = connect_hot(readonly=False)
        throttle = Throttle()
        try:
            commit_every = 50
            for i, entry in enumerate(pool):
                status, data = fetch_stat(entry["bvid"], throttle)
                if status == "ok":
                    _upsert(conn, entry, "ok", data)
                    key = "ok"
                elif status == "deleted":
                    _upsert(conn, entry, "deleted", {})
                    key = "deleted"
                else:
                    _upsert(conn, entry, "error", {})
                    key = "failed"
                if (i + 1) % commit_every == 0:
                    conn.commit()  # 每 50 首落一次盘，平衡持久性与事务开销
                with TASK_LOCK:
                    TASK["done"] = i + 1
                    TASK[key] += 1
            conn.commit()  # 收尾提交剩余未落盘的写入
        except Exception:
            try:
                conn.commit()  # 出错也尽量保留已抓取的成果
            except Exception:
                pass
            raise
        finally:
            conn.close()
        with TASK_LOCK:
            TASK["message"] = "完成"
        try:
            conn = connect_hot(readonly=False)
            try:
                sid = _save_snapshot(conn, scope)
            finally:
                conn.close()
            with TASK_LOCK:
                TASK["snapshot_id"] = sid
                TASK["message"] = f"完成，已存快照 #{sid}（{TASK['ok']} 首）"
        except Exception as exc:
            logger.exception("快照落库失败")
            with TASK_LOCK:
                TASK["message"] = f"完成，但快照落库失败：{exc}"
    except Exception as exc:
        logger.exception("爬取任务异常")
        with TASK_LOCK:
            TASK["message"] = f"任务异常：{exc}"
    finally:
        with TASK_LOCK:
            TASK["running"] = False
            TASK["finished_at"] = time.time()


def start_refresh(scope: str = "recent", recent_n: int = 10) -> bool:
    with TASK_LOCK:
        if TASK["running"]:
            return False
    threading.Thread(target=_run, args=(scope, recent_n), daemon=True).start()
    return True


def get_status() -> dict:
    with TASK_LOCK:
        task = dict(TASK)
    conn = connect_hot(readonly=True)
    try:
        cache_count = conn.execute("SELECT COUNT(*) AS n FROM hot_cache").fetchone()["n"]
        ok_count = conn.execute("SELECT COUNT(*) AS n FROM hot_cache WHERE status='ok'").fetchone()["n"]
        last = conn.execute("SELECT MAX(fetch_time) AS t FROM hot_cache").fetchone()["t"]
    finally:
        conn.close()
    return {**task, "cache_count": cache_count, "ok_count": ok_count, "last_fetch": last}


def _baseline(conn: sqlite3.Connection) -> tuple[dict | None, float]:
    """取最近两份快照，返回 (旧快照指标映射, 间隔天数)。

    不足两份快照时返回 (None, 0)，调用方据此跳过增量计算。
    """
    snaps = conn.execute(
        "SELECT id, created_at FROM snapshots ORDER BY id DESC LIMIT 2"
    ).fetchall()
    if len(snaps) < 2:
        return None, 0.0
    old_id = snaps[1]["id"]
    window_days = round(max(1, snaps[0]["created_at"] - snaps[1]["created_at"]) / 86400, 2)
    old_map = {
        r["bvid"]: r
        for r in conn.execute(
            "SELECT bvid, view, favorite, coin, like, share FROM snapshot_stats WHERE snapshot_id=?",
            (old_id,),
        ).fetchall()
    }
    return old_map, window_days


def _attach_deltas(conn: sqlite3.Connection, items: list[dict]) -> None:
    """给歌曲列表每项附上「较上次快照」的增量（dv/df/dc/dl/ds/dscore/window_days）。

    无基线（歌曲不在旧快照中）时相关字段置 None。
    """
    old_map, window_days = _baseline(conn)
    for it in items:
        if old_map is None:
            it["dv"] = it["df"] = it["dc"] = it["dl"] = it["ds"] = it["dscore"] = None
            it["window_days"] = None
            continue
        o = old_map.get(it["bvid"])
        if o is None:
            it["dv"] = it["df"] = it["dc"] = it["dl"] = it["ds"] = it["dscore"] = None
            it["window_days"] = window_days
            continue
        dv = it["view"] - o["view"]
        df = it["favorite"] - o["favorite"]
        dc = it["coin"] - o["coin"]
        dl = it["like"] - o["like"]
        ds = it["share"] - o["share"]
        it["dv"] = dv
        it["df"] = df
        it["dc"] = dc
        it["dl"] = dl
        it["ds"] = ds
        it["dscore"] = dv + df * 15 + dc * 30 + dl * 3
        it["window_days"] = window_days


def get_momentum(metric: str = "view", limit: int = 50, offset: int = 0) -> dict:
    """涨速榜：对比最近两份快照，按各维度增量排序。

    metric = view/favorite/coin/like/share 按对应增量排序；score 按涨速综合分（同周榜权重）。
    仅统计两份快照中都存在的歌曲，避免新入库曲被误判为暴涨。
    """
    allowed = {"view", "favorite", "coin", "like", "share", "score"}
    if metric not in allowed:
        metric = "view"
    order_key = {
        "view": "dv", "favorite": "df", "coin": "dc", "like": "dl", "share": "ds", "score": "dscore",
    }[metric]

    conn = connect_hot(readonly=True)
    try:
        old_map, window_days = _baseline(conn)
        if old_map is None:
            return {
                "has_baseline": False, "window_days": 0, "total": 0, "items": [],
                "summary": {
                    "net_view": 0, "net_favorite": 0, "net_coin": 0,
                    "net_like": 0, "net_share": 0, "tracked": 0, "window_days": 0,
                },
            }
        new_id = conn.execute("SELECT id FROM snapshots ORDER BY id DESC LIMIT 1").fetchone()["id"]
        new_rows = conn.execute(
            "SELECT bvid, title, title_cn, owner, pubtime, view, favorite, coin, like, share "
            "FROM snapshot_stats WHERE snapshot_id=?", (new_id,)
        ).fetchall()

        items: list[dict] = []
        net = {"view": 0, "favorite": 0, "coin": 0, "like": 0, "share": 0}
        for r in new_rows:
            o = old_map.get(r["bvid"])
            if o is None:
                continue
            dv = r["view"] - o["view"]
            df = r["favorite"] - o["favorite"]
            dc = r["coin"] - o["coin"]
            dl = r["like"] - o["like"]
            ds = r["share"] - o["share"]
            dscore = dv + df * 15 + dc * 30 + dl * 3
            net["view"] += dv
            net["favorite"] += df
            net["coin"] += dc
            net["like"] += dl
            net["share"] += ds
            items.append({
                "bvid": r["bvid"], "title": r["title"], "title_cn": r["title_cn"],
                "owner": r["owner"], "pubtime": r["pubtime"],
                "view": r["view"], "favorite": r["favorite"], "coin": r["coin"],
                "like": r["like"], "share": r["share"],
                "dv": dv, "df": df, "dc": dc, "dl": dl, "ds": ds,
                "dscore": dscore,
                "day_view": round(dv / window_days, 1) if window_days else 0,
                "window_days": window_days,
            })

        items.sort(key=lambda x: x[order_key], reverse=True)
        total = len(items)
        page = items[offset: offset + limit]
        summary = {
            "net_view": net["view"], "net_favorite": net["favorite"],
            "net_coin": net["coin"], "net_like": net["like"], "net_share": net["share"],
            "tracked": total, "window_days": window_days,
        }
        return {
            "has_baseline": True, "window_days": window_days,
            "total": total, "items": page, "summary": summary,
        }
    finally:
        conn.close()


def get_rankings(sort: str = "score", q: str = "", tier: str | None = None,
                  limit: int = 50, offset: int = 0) -> dict:
    if sort not in ALLOWED_SORTS:
        sort = "score"
    order = SCORE_SQL if sort == "score" else sort

    conn = connect_hot(readonly=True)
    try:
        clauses = ["status='ok'"]
        params: list = []
        if q:
            ql = q.strip().lower()
            pat = "%" + ql.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            clauses.append(
                "(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(title_cn) LIKE ? ESCAPE '\\' "
                "OR LOWER(owner) LIKE ? ESCAPE '\\' OR LOWER(bvid) LIKE ? ESCAPE '\\')"
            )
            params += [pat, pat, pat, pat]
        if tier in _TIER_RANGE:
            lo, hi = _TIER_RANGE[tier]
            if hi is None:
                clauses.append("view >= ?")
                params.append(lo)
            else:
                clauses.append("view >= ? AND view < ?")
                params += [lo, hi]

        where = "WHERE " + " AND ".join(clauses)
        total = conn.execute(f"SELECT COUNT(*) AS n FROM hot_cache {where}", tuple(params)).fetchone()["n"]
        rows = conn.execute(
            f"""SELECT bvid, title, title_cn, owner, pubtime, view, favorite, coin, like, share,
                fetch_time, {SCORE_SQL} AS score
                FROM hot_cache {where} ORDER BY {order} DESC LIMIT ? OFFSET ?""",
            tuple(params + [limit, offset]),
        ).fetchall()

        # 全库聚合概览（不受 q/tier 筛选影响，用于顶部 KPI 卡）
        agg = conn.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(view),0) v, COALESCE(SUM(favorite),0) f, "
            "COALESCE(SUM(coin),0) c, COALESCE(SUM(like),0) l, COALESCE(SUM(share),0) s "
            "FROM hot_cache WHERE status='ok'"
        ).fetchone()
        summary = {
            "total": agg["n"],
            "view_sum": agg["v"],
            "favorite_sum": agg["f"],
            "coin_sum": agg["c"],
            "like_sum": agg["l"],
            "share_sum": agg["s"],
            "myth": conn.execute("SELECT COUNT(*) n FROM hot_cache WHERE status='ok' AND view>=10000000").fetchone()["n"],
            "legend": conn.execute("SELECT COUNT(*) n FROM hot_cache WHERE status='ok' AND view>=1000000 AND view<10000000").fetchone()["n"],
            "hall": conn.execute("SELECT COUNT(*) n FROM hot_cache WHERE status='ok' AND view>=100000 AND view<1000000").fetchone()["n"],
        }
        items = [dict(r) for r in rows]
        _attach_deltas(conn, items)
        return {"total": total, "items": items, "summary": summary}
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# 术曲思考：实时单曲深度洞察
# ----------------------------------------------------------------------------
_BV_RE = re.compile(r"BV[0-9A-Za-z]{10}")

# 详情缓存：避免同一 BV 短期内重复打 B站（风控友好）
_THINK_TTL = 120.0
_THINK_CACHE_MAX = 2000  # LRU 上限，防止长期运行内存无界增长
_THINK_CACHE: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_THINK_THROTTLE = Throttle()


def _lookup_meta(bvid: str) -> dict:
    """从收录池 / 缓存中查 BV 的展示元数据（标题、中文名、UP）。"""
    conn = db.connect_source()
    try:
        r = conn.execute("SELECT title, title_cn FROM songs_all WHERE bvid=?", (bvid,)).fetchone()
    finally:
        conn.close()
    if r:
        return {"title": r["title"] or "", "title_cn": r["title_cn"] or "", "owner": ""}
    conn = connect_hot(readonly=True)
    try:
        r = conn.execute("SELECT title, title_cn, owner FROM hot_cache WHERE bvid=?", (bvid,)).fetchone()
    finally:
        conn.close()
    if r:
        return {"title": r["title"] or "", "title_cn": r["title_cn"] or "", "owner": r["owner"] or ""}
    return {}


def think_search(query: str, limit: int = 10) -> list[dict]:
    """按 中文名 / 标题 / UP主 / BV号 / B站链接 解析候选曲。

    - 命中 BV（纯号或链接）→ 返回单条候选，前端可直接拉详情。
    - 文本 → 优先从收录池 songs_all 按 title/title_cn 模糊匹配，不足再补 hot_cache（含 owner）。
    """
    q = (query or "").strip()
    if not q:
        return []
    m = _BV_RE.search(q)
    if m:
        bvid = m.group(0)
        meta = _lookup_meta(bvid)
        return [{
            "bvid": bvid,
            "title": meta.get("title") or "",
            "title_cn": meta.get("title_cn") or "",
            "owner": meta.get("owner") or "",
            "matched": "bvid",
        }]
    ql = q.lower()
    pat = "%" + ql.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    conn = db.connect_source()
    try:
        rows = conn.execute(
            "SELECT bvid, title, title_cn FROM songs_all "
            "WHERE LOWER(title_cn) LIKE ? ESCAPE '\\' OR LOWER(title) LIKE ? ESCAPE '\\' "
            "LIMIT ?",
            (pat, pat, limit),
        ).fetchall()
    finally:
        conn.close()
    cands = [{"bvid": r["bvid"], "title": r["title"] or "", "title_cn": r["title_cn"] or "", "owner": "", "matched": "title"} for r in rows]
    if len(cands) < limit:
        conn = connect_hot(readonly=True)
        try:
            existing = {c["bvid"] for c in cands}
            rows2 = conn.execute(
                "SELECT bvid, title, title_cn, owner FROM hot_cache "
                "WHERE LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(title_cn) LIKE ? ESCAPE '\\' "
                "OR LOWER(owner) LIKE ? ESCAPE '\\' LIMIT ?",
                (pat, pat, pat, limit),
            ).fetchall()
        finally:
            conn.close()
        for r in rows2:
            if r["bvid"] in existing:
                continue
            cands.append({"bvid": r["bvid"], "title": r["title"] or "", "title_cn": r["title_cn"] or "", "owner": r["owner"] or "", "matched": "cache"})
            if len(cands) >= limit:
                break
    return cands[:limit]


def think_detail(bvid: str) -> dict | None:
    """抓取 BV 实时详情（播放/点赞/投币/收藏/评论/弹幕 + 元数据）。取不到返回 None。"""
    bvid = (bvid or "").strip()
    if not _BV_RE.fullmatch(bvid):
        return None
    now = time.time()
    cached = _THINK_CACHE.get(bvid)
    if cached is not None:
        if now - cached[0] < _THINK_TTL:
            _THINK_CACHE.move_to_end(bvid)  # 命中即刷新 LRU 位置
            return cached[1]
        _THINK_CACHE.pop(bvid, None)  # 过期项及时淘汰，避免陈旧数据滞留
    status, data = fetch_view(bvid, _THINK_THROTTLE)
    if status != "ok":
        return None
    stat = data.get("stat") or {}
    owner = data.get("owner") or {}
    meta = _lookup_meta(bvid)
    detail = {
        "bvid": bvid,
        "aid": data.get("aid"),
        "title": data.get("title") or "",
        "title_cn": meta.get("title_cn") or "",
        "owner": owner.get("name") or meta.get("owner") or "",
        "owner_mid": owner.get("mid"),
        "pubtime": data.get("pubdate") or 0,
        "duration": data.get("duration") or 0,
        "desc": data.get("desc") or "",
        "cover": data.get("pic") or "",
        "category": data.get("tname") or "",
        "view": int(stat.get("view") or 0),
        "danmaku": int(stat.get("danmaku") or 0),
        "reply": int(stat.get("reply") or 0),
        "favorite": int(stat.get("favorite") or 0),
        "coin": int(stat.get("coin") or 0),
        "share": int(stat.get("share") or 0),
        "like": int(stat.get("like") or 0),
        "fetched_at": int(now),
    }
    _THINK_CACHE[bvid] = (now, detail)
    _THINK_CACHE.move_to_end(bvid)
    if len(_THINK_CACHE) > _THINK_CACHE_MAX:
        _THINK_CACHE.popitem(last=False)  # 超出上限淘汰最久未用的条目
    return detail