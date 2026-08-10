import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw, Loader2, CheckCircle2, XCircle, X } from "lucide-react"
import { api } from "../lib/api"

interface SyncSummary {
  all_up_to_date: boolean
  boards: Record<string, { new: number; remote_latest: string | null; local_latest: string | null; up_to_date: boolean }>
  songs: { added: number; remote_total: number; local_total: number; up_to_date: boolean } | null
  checked: string[]
  monthly_built: boolean
}
interface SyncStatus {
  running: boolean
  started_at: string | null
  finished_at: string | null
  log: string[]
  error: string | null
  summary: SyncSummary | null
}

export default function RefreshButton() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const poll = useCallback(async () => {
    try {
      const s = (await api.syncStatus()) as SyncStatus
      setStatus(s)
      if (!s.running && timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
        setRunning(false)
      }
    } catch {
      /* 轮询瞬错忽略 */
    }
  }, [])

  const start = useCallback(async () => {
    setOpen(true)
    setErrMsg(null)
    setStatus(null)
    try {
      await api.syncRefresh()
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      setErrMsg(msg.includes("409") ? "已有同步任务正在进行中" : "触发同步失败：" + msg)
      return
    }
    setRunning(true)
    poll()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = window.setInterval(poll, 1500)
  }, [poll])

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current)
    },
    [],
  )

  const BOARD_LABELS: Record<string, string> = {
    weekly: "周榜",
    legend: "传说曲周榜",
    annual: "年榜",
    songs: "歌曲库",
  }
  const summary = status?.summary
  const allUpToDate = !!summary?.all_up_to_date
  const boardEntries = summary ? Object.entries(summary.boards ?? {}) : []
  const songsInfo = summary?.songs ?? null

  return (
    <>
      <button
        className="sidebar-search"
        onClick={start}
        title="从 biliboard 拉取最新周/传说/年榜并重建月榜"
      >
        <RefreshCw size={13} className={running ? "spin" : ""} />
        <span>{running ? "同步中…" : "刷新数据"}</span>
      </button>

      {open && (
        <div className="sync-panel">
          <div className="sync-head">
            <span>数据同步 · biliboard.uk</span>
            <button className="sync-x" onClick={() => setOpen(false)} aria-label="关闭">
              <X size={14} />
            </button>
          </div>

          {errMsg && <div className="sync-err">{errMsg}</div>}

          <div className="sync-body">
            {status?.running && (
              <div className="sync-row">
                <Loader2 size={14} className="spin" />
                <span>正在拉取最新榜单…</span>
              </div>
            )}
            {status && !status.running && (
              <div className="sync-row">
                {status.error ? (
                  <XCircle size={14} className="c-red" />
                ) : (
                  <CheckCircle2 size={14} className="c-green" />
                )}
                <span>{status.error ? "同步出错" : "同步完成"}</span>
              </div>
            )}

            {summary && (
              <div className="sync-summary">
                {allUpToDate ? (
                  <div className="sync-uptodate">
                    <CheckCircle2 size={15} className="c-green" />
                    <span>
                      周榜和歌曲库已为最新
                      {summary.checked?.some((c) => c === "legend" || c === "annual") ? "（含传说/年榜）" : ""}
                    </span>
                  </div>
                ) : (
                  <>
                    {boardEntries.map(([k, v]) => (
                      <div key={k} className="sync-line">
                        {BOARD_LABELS[k] ?? k}：
                        {v.new > 0 ? (
                          <b className="c-green">新增 {v.new} 期（最新 {v.remote_latest ?? "—"}）</b>
                        ) : (
                          <span className="c-faint">
                            已为最新（最新 {v.remote_latest ?? v.local_latest ?? "—"}）
                          </span>
                        )}
                      </div>
                    ))}
                    {songsInfo && (
                      <div className="sync-line">
                        歌曲库：
                        {songsInfo.added > 0 ? (
                          <b className="c-green">新增 {songsInfo.added} 首</b>
                        ) : (
                          <span className="c-faint">
                            已为最新（本地 {songsInfo.local_total} / 远端 {songsInfo.remote_total}）
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {summary.monthly_built != null && (
                  <div className="sync-line c-faint">月榜重建：{summary.monthly_built ? "是" : "否"}</div>
                )}
              </div>
            )}

            {status?.error && <pre className="sync-error-pre">{status.error}</pre>}

            {status?.log && status.log.length > 0 && (
              <div className="sync-log">
                {status.log.slice(-9).map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
