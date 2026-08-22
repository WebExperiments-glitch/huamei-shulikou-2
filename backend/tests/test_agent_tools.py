"""Agent 新增能力纯函数测试（借鉴 dsh：todo / goal / 结构化错误码）。

不依赖数据库/网络，回归保护：
- _tool_todo_write / _todo_summary：待办整表替换与摘要
- _tool_error / _parse_tool_error：结构化错误码契约
- AGENT_TOOLS 里存在 todo_write；_execute_tool 对未知工具/非法参数返回结构化错误
"""
import json

import pytest

from app.services.ai import (
    AGENT_TOOLS,
    AgentErrCode,
    _execute_tool,
    _parse_tool_error,
    _todo_summary,
    _tool_error,
    _tool_todo_write,
)


# ---------------------------------------------------------------------------
# Todo 待办清单（借鉴 dsh tool-todo）
# ---------------------------------------------------------------------------
def test_todo_write_replaces_whole_list():
    first = {"todos": [
        {"content": "查最新周榜", "status": "in_progress"},
        {"content": "整理 Top5", "status": "pending"},
    ]}
    out = _tool_todo_write(first, [])
    assert [t["status"] for t in out] == ["in_progress", "pending"]
    assert out[0]["id"] == "t1"

    # 第二次调用整体替换（last-write-wins），旧项消失
    second = {"todos": [
        {"content": "查最新周榜", "status": "completed"},
        {"content": "整理 Top5", "status": "completed"},
        {"content": "生成周报", "status": "in_progress"},
    ]}
    out2 = _tool_todo_write(second, out)
    assert [t["content"] for t in out2] == ["查最新周榜", "整理 Top5", "生成周报"]
    assert [t["status"] for t in out2] == ["completed", "completed", "in_progress"]


def test_todo_write_drops_invalid_and_normalizes_status():
    bad = {"todos": [
        {"content": "", "status": "pending"},          # 空内容丢弃
        "not-a-dict",                                   # 非对象丢弃
        {"content": "合法项", "status": "weird"},       # 非法状态归为 pending
    ]}
    out = _tool_todo_write(bad, [])
    assert len(out) == 1
    assert out[0]["content"] == "合法项"
    assert out[0]["status"] == "pending"


def test_todo_write_non_list_keeps_previous():
    prev = [{"id": "t1", "content": "保留", "status": "pending"}]
    assert _tool_todo_write({"todos": "oops"}, prev) is prev
    assert _tool_todo_write({}, prev) is prev


def test_todo_summary_counts():
    todos = [
        {"id": "t1", "content": "a", "status": "completed"},
        {"id": "t2", "content": "b", "status": "in_progress"},
        {"id": "t3", "content": "c", "status": "pending"},
    ]
    s = _todo_summary(todos)
    assert "3" in s and "1 完成" in s and "1 进行中" in s and "1 待办" in s
    assert "（待办清单已清空）" == _todo_summary([])


# ---------------------------------------------------------------------------
# 结构化错误码（借鉴 dsh 的 {code, message} 契约）
# ---------------------------------------------------------------------------
def test_tool_error_roundtrip():
    text = _tool_error(AgentErrCode.TOOL_NOT_FOUND, "未知工具：x")
    parsed = _parse_tool_error(text)
    assert parsed == {"code": "tool_not_found", "message": "未知工具：x"}


def test_parse_tool_error_rejects_plain_results():
    assert _parse_tool_error("1. 洛天依…") is None
    assert _parse_tool_error("") is None
    assert _parse_tool_error('{"foo": 1}') is None      # 无 error 键
    assert _parse_tool_error("{bad json") is None


def test_execute_unknown_tool_returns_structured_error():
    res = _execute_tool("no_such_tool", "{}")
    assert _parse_tool_error(res)["code"] == AgentErrCode.TOOL_NOT_FOUND


def test_execute_tool_malformed_args_returns_structured_error():
    res = _execute_tool("get_weekly_ranking", "{not-json")
    assert _parse_tool_error(res)["code"] == AgentErrCode.TOOL_INVALID_ARGS


def test_agent_tools_contains_todo_write():
    names = {t["function"]["name"] for t in AGENT_TOOLS}
    assert "todo_write" in names


# ---------------------------------------------------------------------------
# goal 预算辅助（run_agent 内联逻辑，这里只验证可用性与钳制可复现）
# ---------------------------------------------------------------------------
def test_goal_max_rounds_clamp_formula():
    # 与 run_agent 相同钳制式：max(1, min(int(max_rounds), steps))
    steps = 6
    assert max(1, min(int("3"), steps)) == 3
    assert max(1, min(int("99"), steps)) == 6
    assert max(1, min(int("0"), steps)) == 1


def test_agent_tools_all_json_serializable():
    # 工具 schema 必须能被 json.dumps（OpenAI 协议要求），防止手写笔误
    assert json.dumps(AGENT_TOOLS, ensure_ascii=False)
