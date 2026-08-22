"""后台任务 Jobs 接口（参考 dsh jobs 子系统）。

- GET    /api/jobs?limit=N        列出最近任务
- GET    /api/jobs/{id}           查询单个任务（状态/错误/结果摘要）
- GET    /api/jobs/{id}/log?offset=N  增量读取日志（返回新行 + 当前总行数）
- POST   /api/jobs/{id}/cancel    请求取消任务
- POST   /api/jobs                （预留）提交任务
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import jobs as jobs_svc

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _view(j: jobs_svc.Job) -> dict:
    return j.summary


@router.get("")
def list_jobs(limit: int = 20):
    return {"jobs": [_view(j) for j in jobs_svc.list_jobs(limit)]}


@router.get("/{job_id}")
def get_job(job_id: str):
    j = jobs_svc.get(job_id)
    if j is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"job": _view(j)}


@router.get("/{job_id}/log")
def get_log(job_id: str, offset: int = 0):
    if offset < 0:
        offset = 0
    lines, total = jobs_svc.get_log(job_id, offset)
    return {"lines": lines, "offset": total}


class SubmitReq(BaseModel):
    name: str
    args: dict = {}


@router.post("")
def submit(req: SubmitReq):
    try:
        j = jobs_svc.submit(req.name, req.args)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"job": _view(j)}


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    j = jobs_svc.cancel(job_id)
    if j is None:
        raise HTTPException(status_code=409, detail="任务不可取消（不存在或已结束）")
    return {"ok": True, "job": _view(j)}
