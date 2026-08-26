import { useEffect, useRef, useState } from "react"
import { Play, Square, RefreshCw, ChevronDown, ChevronRight, XCircle, Loader2, CheckCircle2, ListTodo } from "lucide-react"
import { BASE } from "../lib/apis/request"

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export type JobStatus = "pending" | "running" | "stopping" | "completed" | "killed" | "failed"

export interface JobItem {
  id: string
  name: string
  status: JobStatus
  created_at: number
  started_at?: number | null
  finished_at?: number | null
  log: string[]
  error?: string | null
  result?: string | null
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "等待中",
  running: "运行中",
  stopping: "取消中",
  completed: "已完成",
  killed: "已取消",
  failed: "失败",
}

const NAME_LABEL: Record<string, string> = {
  sync_official: "同步官方榜单",
  refresh_data: "实时热度采集",
  recalc_scores: "批量重算",
  translate_all: "批量翻译歌曲",
}

function fmtTime(ts?: number | null): string {
  if (!ts) return "—"
  const d = new Date(ts * 1000)
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function JobsPanel({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function refresh() {
    try {
      const data = await req<{ jobs: JobItem[] }>("/api/jobs?limit=10")
      setJobs(data.jobs || [])
      setError("")
    } catch {
      setError("无法连接任务服务（后端未启动？）")
    }
  }

  useEffect(() => {
    void refresh()
    timerRef.current = setInterval(() => void refresh(), 2500)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function cancelJob(id: string) {
    try {
      await req(`/api/jobs/${id}/cancel`, { method: "POST" })
      void refresh()
    } catch {
      setError("取消失败")
    }
  }

  const live = jobs.some((j) => j.status === "running" || j.status === "pending" || j.status === "stopping")

  return (
    <div className="jobs-panel">
      <div className="jobs-head">
        <span className="jobs-title">
          <ListTodo size={14} /> 后台任务
          {live && <Loader2 size={13} className="spin" />}
        </span>
        <span className="jobs-actions">
          <button className="jobs-refresh" title="刷新" onClick={() => void refresh()}>
            <RefreshCw size={13} />
          </button>
          <button className="jobs-close" title="关闭" onClick={onClose}>
            <XCircle size={13} />
          </button>
        </span>
      </div>
      {error ? <div className="jobs-error">{error}</div> : null}
      <div className="jobs-list">
        {jobs.length === 0 && !error ? (
          <div className="jobs-empty">暂无任务。可让智能体「同步官方榜单」或「刷新实时数据」来启动后台任务。</div>
        ) : (
          jobs.map((j) => (
            <div key={j.id} className={`job-card status-${j.status}`}>
              <div className="job-row" onClick={() => setExpanded((e) => ({ ...e, [j.id]: !e[j.id] }))}>
                <span className="job-status-dot" />
                <span className="job-name">{NAME_LABEL[j.name] || j.name}</span>
                <span className="job-id" title={j.id}>{j.id}</span>
                <span className="job-state">{STATUS_LABEL[j.status]}</span>
                {j.status === "running" || j.status === "pending" || j.status === "stopping" ? (
                  <button
                    className="job-cancel"
                    title="取消任务"
                    onClick={(e) => {
                      e.stopPropagation()
                      void cancelJob(j.id)
                    }}
                  >
                    <Square size={11} />
                  </button>
                ) : j.status === "completed" ? (
                  <CheckCircle2 size={13} className="job-ok" />
                ) : j.status === "failed" ? (
                  <XCircle size={13} className="job-fail" />
                ) : null}
                <span className="job-time">{fmtTime(j.created_at)}</span>
                <span className="job-chev">{expanded[j.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
              </div>
              {expanded[j.id] ? (
                <div className="job-detail">
                  {j.result ? (
                    <div className="job-result">
                      <CheckCircle2 size={12} /> {j.result}
                    </div>
                  ) : null}
                  {j.error ? <div className="job-error">{j.error}</div> : null}
                  <pre className="job-log">{(j.log.length ? j.log : ["（暂无输出）"]).join("\n")}</pre>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      <div className="jobs-foot">
        <Play size={11} /> 也可在对话中让智能体查询进度（get_job / list_jobs / cancel_job）
      </div>
    </div>
  )
}
