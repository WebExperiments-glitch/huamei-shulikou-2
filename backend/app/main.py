from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from .api import ai, boards, hot, netease, selfbuilt, songs, stats, sync, translate, conversations
from .core import config

# ---------------------------------------------------------------------------
# 日志：结构化、带时间/级别，便于运维排查
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("main")

# ---------------------------------------------------------------------------
# 应用实例
# ---------------------------------------------------------------------------
app = FastAPI(
    title=config.APP_NAME,
    version=config.APP_VERSION,
    description="huamei术力口后端：直连 biliboard 官方数据 + 自建月榜/日榜/聚合榜",
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


app.include_router(boards.router)
app.include_router(songs.router)
app.include_router(stats.router)
app.include_router(selfbuilt.router)
app.include_router(hot.router)
app.include_router(translate.router)
app.include_router(sync.router)
app.include_router(ai.router)
app.include_router(netease.router)
app.include_router(conversations.router)


@app.on_event("startup")
async def _startup():
    logger.info("%s v%s starting up", config.APP_NAME, config.APP_VERSION)
    try:
        from .services import conv_store

        conv_store.init()
        logger.info("conversations table ready")
    except Exception as exc:  # noqa: BLE001
        logger.warning("conversations init failed: %s", exc)


@app.on_event("shutdown")
async def _shutdown():
    # 优雅关闭：终止本地拉起的 llama-server 子进程，避免显存泄漏/孤儿进程
    try:
        from .services import ai as ai_service

        n = ai_service.shutdown_models()
        logger.info("shutdown: cleaned %d model process(es)", n)
    except Exception as exc:  # noqa: BLE001
        logger.warning("shutdown cleanup failed: %s", exc)


@app.get("/")
def root():
    return {"app": config.APP_NAME, "version": config.APP_VERSION, "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": config.APP_VERSION}
