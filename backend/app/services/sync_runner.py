"""biliboard 同步流水线运行器（后端侧）

- 在后台线程中执行 scripts/sync_official.py 的 run_pipeline，避免阻塞 HTTP 请求。
- 维持全局 _status，供 /api/sync/status 轮询进度。
- 完成后清理进程内缓存，使新榜单立即对查询可见。
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..core import cache as cache_svc

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"

_lock = threading.Lock()
_status: dict = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "log": [],
    "error": None,
    "summary": None,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_sync_module():
    spec = importlib.util.spec_from_file_location(
        "sync_official", str(SCRIPTS_DIR / "sync_official.py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _invalidate_caches() -> None:
    """清空进程内缓存，让新数据立即生效。"""
    n = cache_svc.clear_cache()
    if n:
        logger.info("cache cleared: %d entries", n)


def _run(types: tuple[str, ...], songs: bool, rebuild_monthly: bool) -> None:
    buf = io.StringIO()
    try:
        mod = _load_sync_module()
        with contextlib.redirect_stdout(buf):
            summary = mod.run_pipeline(
                types=types, songs=songs, rebuild_monthly=rebuild_monthly
            )
        with _lock:
            _status["log"] = buf.getvalue().splitlines()
            _status["summary"] = summary
            _status["error"] = None
        _invalidate_caches()
    except Exception as e:  # noqa: BLE001
        import traceback

        with _lock:
            _status["error"] = f"{e}\n{traceback.format_exc()}"
            _status["log"] = buf.getvalue().splitlines()
    finally:
        with _lock:
            _status["running"] = False
            _status["finished_at"] = _now()


def trigger(
    types: tuple[str, ...] = ("weekly", "legend", "annual"),
    songs: bool = True,
    rebuild_monthly: bool = True,
) -> bool:
    """启动一次同步。若已有任务在跑，返回 False。"""
    global _status
    with _lock:
        if _status["running"]:
            return False
        _status = {
            "running": True,
            "started_at": _now(),
            "finished_at": None,
            "log": [],
            "error": None,
            "summary": None,
        }
    t = threading.Thread(
        target=_run, args=(types, songs, rebuild_monthly), daemon=True
    )
    t.start()
    return True


def get_status() -> dict:
    with _lock:
        return dict(_status)