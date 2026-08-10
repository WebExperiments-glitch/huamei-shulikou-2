"""数据同步接口：手动触发从 biliboard 拉取最新榜单并重建月榜。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..services import sync_runner

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("/refresh")
def refresh(songs: bool = True, rebuild_monthly: bool = True):
    """触发一次 biliboard 同步（周榜/传说曲周榜/年榜 + 歌曲库 + 重建月榜）。
    若已有同步在跑，返回 409。"""
    ok = sync_runner.trigger(songs=songs, rebuild_monthly=rebuild_monthly)
    if not ok:
        raise HTTPException(409, "已有同步任务正在进行中，请稍后再试")
    return {"status": "started", "message": "已开始从 biliboard 同步最新榜单"}


@router.get("/status")
def status():
    """轮询同步进度：running 为真时任务进行中，否则看 summary / error。"""
    return sync_runner.get_status()
