"""企业级系统管理端点：健康/就绪/信息/端点注册表/运行时指标/配置预览。

作为「预留数据接口」的统一入口，供运维、监控探针、前端管理页与 AI 智能体调用。
所有端点均为只读、轻量、无副作用；带响应的缓存头为 no-store（实时数据）。

端点一览：
- GET /api/system/info       应用与运行环境基本信息（版本/入口/环境/启动时间）
- GET /api/system/health     存活探针（liveness，附带关键依赖自检摘要）
- GET /api/system/readiness  就绪探针（readiness：DB/缓存/数据新鲜度深度检查）
- GET /api/system/endpoints  已注册路由注册表（method/path/name/tags）
- GET /api/system/stats      运行时指标（请求量/耗时/慢请求 + 缓存 + 各库状态 + 新鲜度）
- GET /api/system/env        配置预览（敏感项脱敏）
"""
from __future__ import annotations

import os
import platform
import sys
import time
from datetime import datetime

from fastapi import APIRouter, Request

from ..core import cache as cache_mod
from ..core import config, db, stats
from ..services import boards as boards_svc

router = APIRouter(prefix="/api/system", tags=["system"])


def _data_freshness() -> dict:
    """真源库最新周榜距今天数（stale 哨兵），与 /api/health 口径一致。"""
    try:
        conn = db.connect_source()
        try:
            issues = boards_svc.list_issues(conn, "weekly")
            if not issues:
                return {"latest_weekly_issue": None, "age_days": None, "stale": True}
            latest = issues[0]["issue"]
            age = (datetime.now() - datetime.strptime(latest, "%Y%m%d")).days
            return {"latest_weekly_issue": latest, "age_days": age, "stale": age > 8}
        finally:
            conn.close()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e), "stale": True}


@router.get("/info")
def system_info():
    return {
        "app": config.APP_NAME,
        "version": config.APP_VERSION,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "source_db": str(config.SOURCE_DB),
        "data_dir": str(config.DATA_DIR),
        "env": os.environ.get("APP_ENV", "development"),
        "started_at": stats.snapshot().get("started_at"),
        "docs": "/docs",
    }


@router.get("/health")
def system_health():
    """存活探针：进程存活即 200；附关键依赖自检，供监控聚合。"""
    src_ok = db.check(config.SOURCE_DB)
    cache_ok = True
    try:
        cache_mod.cache_size()
    except Exception:  # noqa: BLE001
        cache_ok = False
    overall = "ok" if (src_ok and cache_ok) else "degraded"
    return {
        "status": overall,
        "version": config.APP_VERSION,
        "checks": {"source_db": src_ok, "cache": cache_ok},
        "uptime_s": round(stats.uptime(), 1),
        "timestamp": time.time(),
    }


@router.get("/readiness")
def system_readiness():
    """就绪探针：深度检查各可读库与数据新鲜度，供负载均衡/健康探针使用。"""
    dbs = db.db_stats()
    freshness = _data_freshness()
    ready = dbs["source"].get("readable", False) and not freshness.get("stale", True)
    return {
        "ready": ready,
        "status": "ready" if ready else "not_ready",
        "dbs": dbs,
        "data_freshness": freshness,
    }


@router.get("/endpoints")
def system_endpoints(request: Request):
    """路由注册表：基于 OpenAPI schema 列出所有 method + path，便于文档化/审计/前端导航。"""
    try:
        paths = request.app.openapi().get("paths", {})
    except Exception:  # noqa: BLE001
        return {"total": 0, "items": [], "error": "openapi 生成失败"}
    out = []
    for p, methods in paths.items():
        for m in methods:
            if m.upper() in ("HEAD", "OPTIONS"):
                continue
            info = methods[m]
            out.append(
                {
                    "method": m.upper(),
                    "path": p,
                    "summary": info.get("summary"),
                    "operation_id": info.get("operationId"),
                }
            )
    out.sort(key=lambda r: (r["path"], r["method"]))
    return {"total": len(out), "items": out}


@router.get("/stats")
def system_stats():
    """运行时指标总览：请求量/耗时 + 缓存 + 各库 + 数据新鲜度。"""
    return {
        "runtime": stats.snapshot(),
        "cache": cache_mod.cache_stats(),
        "dbs": db.db_stats(),
        "data_freshness": _data_freshness(),
    }


# 脱敏项：含这些关键词的环境变量不回显（如 key/secret/token/password）
_SENSITIVE = ("key", "secret", "token", "password", "pwd", "auth", "api_key")


@router.get("/env")
def system_env():
    """配置预览：返回环境变量，敏感键脱敏；供前端/运维确认运行时配置。"""
    public = {}
    for k in sorted(os.environ):
        v = os.environ[k]
        if any(s in k.lower() for s in _SENSITIVE):
            public[k] = "***redacted***"
        else:
            public[k] = v
    return {"count": len(public), "vars": public}
