import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, X, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react"
import { api } from "../lib/api"

interface Props {
  open: boolean
  onClose: () => void
}

export default function ManualIngest({ open, onClose }: Props) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ bvid: string; title: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // 打开时重置并聚焦；ESC 关闭
  useEffect(() => {
    if (open) {
      setInput("")
      setError(null)
      setDone(null)
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = async () => {
    const val = input.trim()
    if (!val) {
      setError("请输入 B站视频链接或 BV 号")
      return
    }
    setLoading(true)
    setError(null)
    setDone(null)
    try {
      const song = await api.ingestSong(val)
      setDone({
        bvid: song.bvid,
        title: song.title_cn || song.title || song.bvid,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "入库失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) submit()
  }

  return (
    <div className="ingest-backdrop" onClick={onClose} role="presentation">
      <div
        className="ingest-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="手动入库"
      >
        <div className="ingest-head">
          <div className="ingest-title">
            <Plus size={16} />
            手动入库
          </div>
          <button className="ingest-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="ingest-body">
            <div className="ingest-success">
              <CheckCircle2 size={18} />
              <div>
                <div className="ingest-success-title">已加入收录池</div>
                <div className="ingest-success-sub">{done.title}</div>
                <div className="ingest-success-bv">{done.bvid}</div>
              </div>
            </div>
            <div className="ingest-actions">
              <button
                className="btn-primary"
                onClick={() => {
                  const bv = done.bvid
                  onClose()
                  navigate(`/song/${bv}`)
                }}
              >
                <ExternalLink size={14} /> 查看歌曲
              </button>
              <button className="btn-ghost" onClick={() => { setDone(null); setInput(""); inputRef.current?.focus() }}>
                再入一首
              </button>
            </div>
          </div>
        ) : (
          <div className="ingest-body">
            <label className="ingest-label" htmlFor="ingest-input">
              粘贴 B站视频链接或 BV 号
            </label>
            <input
              id="ingest-input"
              ref={inputRef}
              className="ingest-input"
              placeholder="https://www.bilibili.com/video/BV1xxxx 或 BV1xxxx"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
            />
            <p className="ingest-hint">
              已上榜的歌曲会自动借榜单信息补全；未在榜单上的歌曲将尝试回源 B站。
            </p>
            {error && (
              <div className="ingest-error">
                <AlertTriangle size={14} />
                {error}
              </div>
            )}
            <div className="ingest-actions">
              <button className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {loading ? "入库中…" : "确认入库"}
              </button>
              <button className="btn-ghost" onClick={onClose} disabled={loading}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
