from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api import ai, boards, cache, feedback, hot, insights, jobs, netease, predict, qqmusic, selfbuilt, songs, stats, sync, translate, conversations, system
from .core import config, stats as runtime_stats

# ---------------------------------------------------------------------------
# 日志：结构化、带时间/级别，便于运维排查
# 除控制台输出外，另写入 {DATA_DIR}/logs/app.log（按大小轮转保留历史），
# 使服务重启后仍可回溯「昨天发生了什么」——这是排查线上问题的前提。
# ---------------------------------------------------------------------------
def _setup_logging() -> logging.Logger:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    fmt = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    root = logging.getLogger()
    root.setLevel(level)
    # 控制台 handler（仅在无 handler 时添加，避免热重载重复）
    if not root.handlers:
        root.addHandler(logging.StreamHandler())
    for h in root.handlers:
        h.setLevel(level)
        h.setFormatter(fmt)
    # 落盘：按大小轮转，重启后日志仍在，便于回溯历史
    try:
        from logging.handlers import RotatingFileHandler

        log_dir = config.DATA_DIR / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        max_bytes = int(os.environ.get("LOG_FILE_MAX_BYTES", str(5 * 1024 * 1024)))
        backup = int(os.environ.get("LOG_FILE_BACKUP", "10"))
        fh = RotatingFileHandler(
            log_dir / "app.log", maxBytes=max_bytes, backupCount=backup, encoding="utf-8"
        )
        fh.setLevel(level)
        fh.setFormatter(fmt)
        root.addHandler(fh)
        logging.getLogger("main").info(
            "日志已落盘: %s（按 %dKB 轮转，保留 %d 份）", log_dir / "app.log", max_bytes // 1024, backup
        )
    except Exception as exc:  # noqa: BLE001  落盘失败不应影响控制台输出
        logging.getLogger("main").warning("日志落盘初始化失败（控制台输出不受影响）: %s", exc)
    return logging.getLogger("main")


logger = _setup_logging()

# ---------------------------------------------------------------------------
# 应用生命周期钩子（替代已弃用的 @app.on_event）
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """启动/关闭钩子。

    - 启动时：汇报数据源与 robots 策略、初始化会话/反馈存储表。
    - 关闭时：优雅终止本地拉起的模型子进程，避免显存泄漏/孤儿进程。
    """
    logger.info("%s v%s starting up", config.APP_NAME, config.APP_VERSION)
    logger.info("source_db: %s", config.SOURCE_DB)
    logger.info("data_dir: %s", config.DATA_DIR)
    logger.info("cors_origins: %s", config.cors_origins())
    # robots.txt 合规自检：启动期汇报各外部数据源的策略，便于审计。
    try:
        from .core import robots as robots_mod

        for _h in ("biliboard.uk", "api.bilibili.com", "music.163.com", "www.bilibili.com"):
            logger.info("robots[%s]: %s", _h, robots_mod.summary(_h))
        if robots_mod.STRICT:
            logger.warning("robots: ROBOTS_STRICT=1 → 被禁 host 的实时抓取已禁用（仅用历史快照）")
    except Exception as exc:  # noqa: BLE001
        logger.warning("robots startup check failed: %s", exc)
    try:
        from .services import conv_store

        conv_store.init()
        logger.info("conversations table ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("conversations init failed: %s", exc)
    try:
        from .services import feedback_store

        feedback_store.init()
        logger.info("feedback table ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("feedback init failed: %s", exc)

    yield

    # 优雅关闭：终止本地拉起的 llama-server 子进程，避免显存泄漏/孤儿进程
    try:
        from .services import ai as ai_service

        n = ai_service.shutdown_models()
        logger.info("shutdown: cleaned %d model process(es)", n)
    except Exception as exc:  # noqa: BLE001
        logger.warning("shutdown cleanup failed: %s", exc)


# ---------------------------------------------------------------------------
# 应用实例
# ---------------------------------------------------------------------------
app = FastAPI(
    title=config.APP_NAME,
    version=config.APP_VERSION,
    description="huamei术力口后端：直连 biliboard 官方数据 + 自建月榜/日榜/聚合榜",
    lifespan=lifespan,
)

# CORS：默认仅放开本地前端开发源，生产可用环境变量 CORS_ORIGINS 收紧。
# 保持 allow_credentials=False（与具体源配合更安全，避免 * + credentials 的非法组合）。
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)

# 最大请求体（字节）：防止超大 payload 撑爆内存。AI 流式请求体（prompt+历史）通常远小于此。
_MAX_BODY = int(os.environ.get("MAX_BODY_BYTES", str(4 * 1024 * 1024)))  # 默认 4MB


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    # 流式接口（SSE）的响应体不限；这里只限制「请求」体大小。
    if request.method in ("POST", "PUT", "PATCH"):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > _MAX_BODY:
            return JSONResponse(
                status_code=413,
                content={"detail": f"请求体过大（上限 {_MAX_BODY} 字节）"},
            )
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    # 基础安全响应头（本地工具也该有，避免被轻易嵌入/嗅探）
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault(
        "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
    )
    resp.headers.setdefault("Cache-Control", "no-store")
    # 移除 Server 指纹（MutableHeaders 无 pop，用 del）
    try:
        del resp.headers["server"]
    except KeyError:
        pass
    return resp


@app.middleware("http")
async def request_id(request: Request, call_next):
    # 请求 ID 关联：接受上游 X-Request-ID 或自动生成，写入响应头便于日志/前端对账。
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
    request.state.request_id = rid
    resp = await call_next(request)
    resp.headers.setdefault("X-Request-ID", rid)
    return resp


# ---------------------------------------------------------------------------
# 请求访问日志：记录 method / path / 状态码 / 耗时，便于定位慢接口与排查问题。
# 轮询类高频接口（/api/sync/status 等）在 DEBUG 下才打印，避免刷屏。
# ---------------------------------------------------------------------------
_QUIET_PATHS = {"/api/health", "/api/sync/status", "/api/ai/health"}


@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    resp = await call_next(request)
    dur_ms = (time.perf_counter() - start) * 1000.0
    path = request.url.path
    # 采集运行时指标（供 /api/system/stats 与 AI 的 get_system_overview 使用）
    try:
        runtime_stats.record(request.method, path, resp.status_code, dur_ms)
    except Exception:  # noqa: BLE001
        pass
    rid = getattr(request.state, "request_id", "-")
    if path not in _QUIET_PATHS or logger.isEnabledFor(logging.DEBUG):
        logger.info(
            "%-6s %-3d %7.1fms %s [%s]", request.method, resp.status_code, dur_ms, path, rid,
        )
    return resp


# ---------------------------------------------------------------------------
# 全局异常处理：统一返回结构化 JSON，避免把 Python 堆栈明文泄漏给客户端，
# 同时保留完整 traceback 到服务端日志便于排查。含请求路径上下文。
# ---------------------------------------------------------------------------
def _err(status: int, detail, request: Request, exc: Exception | None = None,
         code: str | None = None) -> JSONResponse:
    if status >= 500:
        logger.exception("%s %s → %s: %s", request.method, request.url.path, status, exc)
    content: dict = {"detail": detail, "path": request.url.path}
    # 结构化错误码（借鉴 dsh 的 {code, message} 契约）：前端可据此路由差异化提示/监控分类。
    if code:
        content["code"] = code
    return JSONResponse(
        status_code=status,
        content=content,
    )


# HTTP 状态码 → 结构化错误码映射（便于机器路由；无映射的状态码不附加 code）
_HTTP_ERROR_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "bad_gateway",
    503: "service_unavailable",
}


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(request: Request, exc: RequestValidationError):
    # 保留原始 errors 列表（含字段/位置），前端可据此定位具体非法参数
    return _err(422, exc.errors(), request, exc, code=_HTTP_ERROR_CODES[422])


@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    return _err(exc.status_code, exc.detail, request, exc,
                code=_HTTP_ERROR_CODES.get(exc.status_code))


@app.exception_handler(Exception)
async def unhandled_exc_handler(request: Request, exc: Exception):
    return _err(500, "服务器内部错误", request, exc, code=_HTTP_ERROR_CODES[500])


app.include_router(boards.router)
app.include_router(songs.router)
app.include_router(stats.router)
app.include_router(selfbuilt.router)
app.include_router(hot.router)
app.include_router(predict.router)
app.include_router(insights.router)
app.include_router(translate.router)
app.include_router(sync.router)
app.include_router(ai.router)
app.include_router(jobs.router)
app.include_router(netease.router)
app.include_router(qqmusic.router)
app.include_router(conversations.router)
app.include_router(feedback.router)
app.include_router(cache.router)
app.include_router(system.router)


@app.get("/")
def root():
    return {"app": config.APP_NAME, "version": config.APP_VERSION, "docs": "/docs"}


@app.get("/api/health")
def health():
    info = {
        "status": "ok",
        "version": config.APP_VERSION,
        "app": config.APP_NAME,
        "docs": "/docs",
    }
    # 多重冗余·第四道防线：数据新鲜度哨兵。
    # 真源库最新周榜距今天数 > 8 天即标记 stale（静默同步失败的首要信号）。
    try:
        from .core import db as db_mod
        from .services import boards as boards_svc
        conn = db_mod.connect(config.SOURCE_DB)
        try:
            issues = boards_svc.list_issues(conn, "weekly")
            if issues:
                latest = issues[0]["issue"]  # YYYYMMDD，list_issues 已降序
                d = datetime.strptime(latest, "%Y%m%d")
                age_days = (datetime.now() - d).days
                info["data_freshness"] = {
                    "latest_weekly_issue": latest,
                    "age_days": age_days,
                    "stale": age_days > 8,
                }
        finally:
            conn.close()
    except Exception as e:  # noqa: BLE001
        info["data_freshness"] = {"error": str(e)}
    return info
