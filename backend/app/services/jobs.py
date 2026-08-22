"""后台任务 Jobs（参考 dsh jobs 子系统）。

管理长时间运行任务的生命周期：
  - 状态机：pending → running → completed / killed / failed（stopping 为取消中的瞬态）
  - 线程执行：每个 job 在守护线程中运行，输出按行追加到 job.log（支持 offset 增量读取）
  - 取消：cancel() 置 stopping 标志，runner 在批次间检查 should_stop() 优雅退出
  - 可观测：list / get / get_log 供前端轮询进度，agent 也可通过工具查询

自带 3 个真实任务（复用现有业务逻辑，均可取消）：
  - sync_official  ：同步官方榜单数据（biliboard 下载，逐榜检查取消）
  - refresh_data   ：触发实时热度采集并监控到完成（监控可取消，后台爬取线程会跑完）
  - recalc_scores  ：按现行公式批量重算榜单得分（逐期检查取消）
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import logging
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field

from ..core import db as _db

logger = logging.getLogger(__name__)

# 最多保留的任务数（FIFO 淘汰旧任务，避免内存无限增长）
_JOBS_CAP = 50

_lock = threading.Lock()
_jobs: dict[str, "Job"] = {}

# 状态：pending / running / stopping / completed / killed / failed
STATUS_LIVE = ("pending", "running", "stopping")
STATUS_TERMINAL = ("completed", "killed", "failed")


@dataclass
class Job:
    id: str
    name: str
    args: dict = field(default_factory=dict)
    status: str = "pending"
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    log: list[str] = field(default_factory=list)
    error: str | None = None
    result: str | None = None
    _stop: threading.Event = field(default_factory=threading.Event, repr=False)

    def __post_init__(self) -> None:
        self.id = self.id or _new_id()

    @property
    def summary(self) -> dict:
        """供 API / agent 返回的视图（不含内部 _stop）。"""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "log": list(self.log),
            "error": self.error,
            "result": self.result,
        }


def _new_id() -> str:
    return time.strftime("%y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]


def log(job: Job, line: str) -> None:
    with _lock:
        job.log.append(line)


def should_stop(job: Job) -> bool:
    return job._stop.is_set()


# ---------------------------------------------------------------------------
# 输出捕获：把 runner 里 print 的进度逐行写进 job.log
# ---------------------------------------------------------------------------
class _LineWriter(io.TextIOBase):
    """把写入的文本按行拆分，完整行追加到 job.log（模拟行缓冲 stdout）。"""

    def __init__(self, job: Job) -> None:
        super().__init__()
        self.job = job
        self._buf = ""

    def write(self, s: str) -> int:
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            self._emit(line.rstrip())
        return len(s)

    def flush(self) -> None:
        if self._buf:
            self._emit(self._buf.rstrip())
            self._buf = ""

    def _emit(self, line: str) -> None:
        if line:
            log(self.job, line)


@contextlib.contextmanager
def _capture(job: Job):
    """把 runner 的 print 输出重定向到 job.log。"""
    old = sys.stdout
    sys.stdout = _LineWriter(job)
    try:
        yield
    finally:
        try:
            sys.stdout.flush()
        except Exception:  # noqa: BLE001
            pass
        sys.stdout = old


# ---------------------------------------------------------------------------
# 具体任务 runner（每个都会在批次间检查 should_stop 实现可取消）
# ---------------------------------------------------------------------------
def _runner_sync_official(job: Job, types: list[str] | None = None,
                          songs: bool = False, rebuild_monthly: bool = True) -> str:
    from . import sync_runner

    mod = sync_runner._load_sync_module()
    types = list(types or ["weekly"])
    summary: dict = {"boards": {}, "songs": None, "monthly_built": False,
                     "checked": [], "all_up_to_date": False}
    import sqlite3
    import httpx

    with _capture(job):
        rb = mod.robots_mod.summary("biliboard.uk")
        print(f"[robots] biliboard.uk: {rb.get('allows_root') and 'Allow / (合规)' or rb}")
        mod.backup_mod.backup_database(mod.SOURCE_DB)
        conn = sqlite3.connect(mod.SOURCE_DB)
        try:
            with httpx.Client(headers={"User-Agent": mod.SYNC_UA}) as client:
                for bt in types:
                    if should_stop(job):
                        print("已请求取消，跳过剩余同步")
                        break
                    print(f"→ 开始同步 {bt} …")
                    summary["boards"][bt] = mod.sync_one(client, conn, bt)
                    mod.boards_svc.invalidate_issues_cache(bt)
                    summary["checked"].append(bt)
                if songs and not should_stop(job):
                    print("→ 开始同步收录池 …")
                    summary["songs"] = mod.sync_songs(client, conn)
                    summary["checked"].append("songs")
        finally:
            conn.close()
        if rebuild_monthly and not should_stop(job):
            try:
                spec = importlib.util.spec_from_file_location(
                    "build_monthly", str(mod.Path(__file__).resolve().parent / "build_monthly.py")
                )
                bm = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(bm)
                bm.main()
                summary["monthly_built"] = True
                print("[monthly] 月榜已重建")
            except Exception as e:  # noqa: BLE001
                print(f"[monthly] 重建失败: {e}")
    sync_runner._invalidate_caches()
    return json.dumps(summary, ensure_ascii=False, default=str)


def _runner_refresh_data(job: Job, scope: str = "recent", recent_n: int = 10) -> str:
    from . import crawler

    with _capture(job):
        if not crawler.start_refresh(scope, recent_n):
            print("已有刷新任务正在进行中，本次仅作监控")
        print(f"已触发刷新（scope={scope}, recent_n={recent_n}），开始监控进度…")
        last = None
        while not should_stop(job):
            st = crawler.get_status()
            if not st.get("running"):
                ok = st.get("ok", 0)
                failed = st.get("failed", 0)
                deleted = st.get("deleted", 0)
                print(f"刷新完成：成功 {ok}，失败 {failed}，删除 {deleted}")
                if st.get("started_at") and st.get("finished_at"):
                    print(f"耗时 {st['finished_at'] - st['started_at']:.0f}s")
                return f"刷新完成（成功 {ok} / 失败 {failed} / 删除 {deleted}）"
            msg = f"进度 {st.get('done', 0)}/{st.get('total', 0)} · 成功 {st.get('ok', 0)} · 失败 {st.get('failed', 0)}"
            if msg != last:
                print(msg)
                last = msg
            time.sleep(1)
        print("监控已取消（后台爬取线程仍会跑完并落快照）")
        return "已取消监控"


def _runner_recalc_scores(job: Job, board_type: str = "weekly", top: int = 50) -> str:
    from . import boards

    conn = _db.connect_source()
    try:
        issues = boards.list_issues(conn, board_type)
        if not issues:
            log(job, f"暂无 {board_type} 榜单")
            return f"暂无 {board_type} 榜单"
        total = len(issues)
        done = 0
        for it in issues:
            if should_stop(job):
                log(job, f"已取消（已完成 {done}/{total}）")
                return f"已取消（已完成 {done}/{total} 期）"
            key = it["issue"]
            items = boards.get_issue_rankings(conn, board_type, key, top=top)
            if items:
                boards._recalc(items, board_type, key)
            done += 1
            if done % 5 == 0 or done == total:
                log(job, f"进度 {done}/{total}（当前期 {key}）")
        return f"完成 {board_type} 全 {total} 期重算（每期 Top{top} 交叉核验列已刷新，只读不改库）"
    finally:
        conn.close()


def _runner_translate_all(job: Job, target: str = "zh", sleep: float = 0.3,
                          limit: int | None = None) -> str:
    """批量翻译全部歌曲译名到 song_i18n（复用官方 title_cn / 本地球名表 / Google 免费接口）。

    断点续传：only_missing=True 跳过已缓存条目，任务中断后重跑只翻译缺失部分。
    Google 免费接口按 sleep 限速（默认 0.3s/次）避免 429。
    """
    from . import translate as tr_svc

    with _capture(job):
        print(f"开始批量翻译所有歌曲（target={target}，限速 {sleep}s/次，断点续传已启用）")

        def _progress(i, total, reused, translated, failed):
            print(f"进度 {i}/{total} · 复用 {reused} · 翻译 {translated} · 失败 {failed}")

        result = tr_svc.backfill_all(
            target=target,
            only_missing=True,
            sleep=sleep,
            limit=limit,
            stop_check=lambda: should_stop(job),
            progress=_progress,
        )
        print(
            f"翻译完成：共 {result['total']} 首 · 复用 {result['reused']} · "
            f"翻译 {result['translated']} · 失败 {result['failed']}"
        )
        return json.dumps(result, ensure_ascii=False)


_RUNNERS = {
    "sync_official": _runner_sync_official,
    "refresh_data": _runner_refresh_data,
    "recalc_scores": _runner_recalc_scores,
    "translate_all": _runner_translate_all,
}

_JOB_HINT = {
    "sync_official": "同步官方榜单数据（可选 types=[weekly,legend,annual]、songs、rebuild_monthly）",
    "refresh_data": "触发实时热度采集并监控到完成（可选 scope、recent_n）",
    "recalc_scores": "按现行公式批量重算榜单得分（可选 board_type、top）",
    "translate_all": "用免费接口批量翻译全部歌曲（可选 target=[zh,en]、sleep 限速），断点续传可取消",
}


# ---------------------------------------------------------------------------
# 公共 API
# ---------------------------------------------------------------------------
def submit(name: str, args: dict | None = None) -> Job:
    """提交一个后台任务并立即启动线程执行。未知任务类型抛 ValueError。"""
    if name not in _RUNNERS:
        raise ValueError(f"未知任务类型：{name}，可用：{', '.join(_RUNNERS)}")
    job = Job(id=_new_id(), name=name, args=args or {})
    with _lock:
        _jobs[job.id] = job
        if len(_jobs) > _JOBS_CAP:
            for k in sorted(_jobs)[: len(_jobs) - _JOBS_CAP]:
                _jobs.pop(k, None)
    threading.Thread(target=_run_job, args=(job,), daemon=True).start()
    return job


def _run_job(job: Job) -> None:
    with _lock:
        job.started_at = time.time()
        job.status = "running"
    runner = _RUNNERS[job.name]
    try:
        result = runner(job, **job.args)
        with _lock:
            job.status = "killed" if job._stop.is_set() else "completed"
            job.result = result
    except Exception as exc:  # noqa: BLE001
        logger.exception("job %s failed", job.name)
        with _lock:
            job.status = "failed"
            job.error = str(exc)
    finally:
        with _lock:
            job.finished_at = time.time()


def cancel(job_id: str) -> Job | None:
    """请求取消一个任务（置 stopping；runner 在批次间退出）。"""
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job.status not in STATUS_LIVE:
            return None
        job._stop.set()
        job.status = "stopping"
        return job


def get(job_id: str) -> Job | None:
    with _lock:
        job = _jobs.get(job_id)
        return job


def get_log(job_id: str, offset: int = 0) -> tuple[list[str], int]:
    """返回从 offset 开始的新日志行与当前总行数（供增量轮询）。"""
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return [], 0
        return list(job.log[offset:]), len(job.log)


def list_jobs(limit: int = 20) -> list[Job]:
    with _lock:
        items = sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)
        return items[: max(1, min(limit, 50))]


def describe_jobs() -> str:
    """给 agent 的工具说明：可用任务类型与参数。"""
    return "\n".join(f"- {name}: {hint}" for name, hint in _JOB_HINT.items())
