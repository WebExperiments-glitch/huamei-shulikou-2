"""应用级冒烟测试：导入、路由注册、健康检查、统一错误响应。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    # with 会触发 startup（初始化会话/反馈表等），模拟真实启动流程
    with TestClient(app) as c:
        yield c


def test_root_returns_app_info(client):
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["app"]
    assert "version" in data
    assert "/docs" in data["docs"]


def test_health_ok(client):
    # 即使数据新鲜度哨兵出错，健康检查仍应 200 + status ok
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_openapi_docs_available(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_unknown_route_returns_json_404(client):
    r = client.get("/api/definitely-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert "detail" in body


def test_response_has_request_id(client):
    # request-id 中间件应把请求 ID 写回响应头，便于前后端对账
    r = client.get("/api/health")
    assert r.headers.get("X-Request-ID")


def test_core_routers_registered(client):
    # 核心业务路由已挂载（依赖 SOURCE_DB 存在；缺失时 boards 也会返回 JSON，不抛 500）
    r = client.get("/api/boards")
    assert r.status_code in (200, 500)  # 500 表示数据源缺失，但不应是空栈崩溃
    body = r.json()
    assert isinstance(body, dict)
