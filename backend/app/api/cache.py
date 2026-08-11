"""缓存管理端点：供后台查询 / 清理持久化 SQL 缓存。

- GET  /api/cache        → 缓存概况（总数 / 存活 / 过期 / 示例 key）
- POST /api/cache/clear  → 清空缓存（需 body {"confirm": true} 防误触）
- POST /api/cache/prune  → 仅清理已过期的条目
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..core import cache as cache_mod

router = APIRouter(prefix="/api/cache", tags=["cache"])


class ClearRequest(BaseModel):
    confirm: bool = False


@router.get("")
def get_cache_stats():
    return cache_mod.cache_stats()


@router.post("/clear")
def clear_cache(req: ClearRequest):
    if not req.confirm:
        return {"ok": False, "detail": "需携带 {\"confirm\": true} 才执行清空", "cleared": 0}
    n = cache_mod.clear_cache()
    return {"ok": True, "cleared": n}


@router.post("/prune")
def prune_cache():
    n = cache_mod.prune_expired()
    return {"ok": True, "pruned": n}
