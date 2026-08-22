"""榜单服务核心逻辑测试：自建公式分代计算、期键合法性/表存在性防护、json 列解析容错。

通过内存 sqlite 构造最小 weekly 榜表验证逻辑，不依赖外部 SOURCE_DB、不触网。
"""
import sqlite3

import pytest

from app.core import db
from app.services import boards


def _mem_conn(*tables) -> sqlite3.Connection:
    """构造一个含多个独立表的内存连接（模拟官方库里的独立期表）。"""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    for sql in tables:
        conn.execute(sql)
    conn.commit()
    return conn


# 现行公式（≥issue 111）current 周榜表：
# score = Δ播放×t + 15Δ收藏 + 3Δ点赞 + 30Δ投币，anchor = 结算日 − 7 天
_current_schema = """
    CREATE TABLE official_20240818 (
        bvid TEXT PRIMARY KEY,
        title TEXT,
        rank INTEGER,
        view INTEGER, favorite INTEGER, coin INTEGER, like INTEGER,
        pubtime INTEGER,
        issue_id INTEGER
    )
"""

_OLD = """
    CREATE TABLE official_20200101 (
        bvid TEXT PRIMARY KEY,
        title TEXT,
        rank INTEGER,
        view INTEGER, favorite INTEGER, coin INTEGER, like INTEGER,
        pubtime INTEGER,
        issue_id INTEGER
    )
"""


# ---------------------------------------------------------------------------
# 期键/结算时间戳
# ---------------------------------------------------------------------------
def test_settle_ts_matches_utc_midnight():
    # 期键 YYYYMMDD → 结算日零点时间戳（本地时区无关，datetime 直接用）
    import datetime as _dt

    dt = _dt.datetime.strptime("20240818", "%Y%m%d")
    assert boards._settle_ts("20240818") == int(dt.timestamp())


def test_get_issue_rankings_rejects_bad_issue_key():
    conn = _mem_conn(_current_schema)
    # 非法期键（非 8 位数字）→ 空列表，不查库
    assert boards.get_issue_rankings(conn, "weekly", "badkey") == []


def test_get_issue_rankings_missing_table_returns_empty():
    conn = _mem_conn(_current_schema)
    # 合法期键但表不存在 → 空列表（AI 智能体可能传入格式合法但不存在期）
    assert boards.get_issue_rankings(conn, "weekly", "20991231") == []


def test_get_issue_rankings_current_formula_matches_174():
    conn = _mem_conn(
        _current_schema,
        "CREATE TABLE songs_all (bvid TEXT PRIMARY KEY, producers TEXT, vocalists TEXT)",
    )
    conn.execute(
        "INSERT INTO official_20240818 VALUES (?,?,?,?,?,?,?,?,?)",
        ("BV1", "老曲", 1, 1000, 10, 2, 5, 1500000000, 111),
    )
    conn.commit()
    # 老曲（投稿远早于周期起点）→ t=1.0 → score = 1000×1 + 10×15 + 5×3 + 2×30
    rows = boards.get_issue_rankings(conn, "weekly", "20240818")
    assert len(rows) == 1
    assert rows[0]["self_t"] == pytest.approx(1.0, abs=1e-4)
    assert rows[0]["self_score"] == pytest.approx(1000 + 150 + 15 + 60, abs=0.01)
    assert rows[0]["self_rank"] == 1


def test_list_issues_detects_multiple_weekly_tables():
    # 建两期 weekly 表 → list_issues 按日期降序列出，并推导分代/序号
    conn = _mem_conn(
        _current_schema,
        "CREATE TABLE official_20240811 (bvid TEXT PRIMARY KEY, rank INTEGER, view INTEGER, favorite INTEGER, coin INTEGER, like INTEGER, pubtime INTEGER, issue_id INTEGER)",
    )
    conn.execute("INSERT INTO official_20240818 (bvid, view, favorite, coin, like, pubtime, issue_id) VALUES ('BV2',0,0,0,0,0,111)")
    conn.commit()
    issues = boards._list_issues_real(conn, "weekly")
    assert [i["issue"] for i in issues] == ["20240818", "20240811"]
    assert issues[0]["seq"] == 2  # 最新期 seq = 总数
    assert issues[0]["formula_gen"] == "current"


def test_list_issues_old_formula_gen():
    conn = _mem_conn(_OLD)
    conn.execute("INSERT INTO official_20200101 (bvid, rank, view, favorite, coin, like, pubtime, issue_id) VALUES ('BV9',0,0,0,0,0,1500000000,40)")
    conn.commit()
    issues = boards._list_issues_real(conn, "weekly")
    assert issues[0]["formula_gen"] == "old"
    assert issues[0]["formula_version"] == "old"


# ---------------------------------------------------------------------------
# json 列解析容错
# ---------------------------------------------------------------------------
def test_parse_json_list_handles_bad_input():
    assert db.parse_json_list(None) == []
    assert db.parse_json_list("") == []
    assert db.parse_json_list("not json") == []
    assert db.parse_json_list('[{"a":1}]') == [{"a": 1}]