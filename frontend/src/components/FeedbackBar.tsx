import { useEffect, useRef, useState } from "react"
import { ThumbsUp, ThumbsDown, X, Send } from "lucide-react"
import type { Feedback } from "../lib/conversations"

const BASE = import.meta.env.VITE_API_BASE ?? ""

function getClientId(): string {
  try {
    let id = localStorage.getItem("hb-agent-client-id")
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2)
      localStorage.setItem("hb-agent-client-id", id)
    }
    return id
  } catch {
    return "anon"
  }
}

type Props = {
  convId: string
  msgIdx: number
  feedback?: Feedback
  onChange: (fb: Feedback) => void
  onClear: () => void
}

export default function FeedbackBar({ convId, msgIdx, feedback, onChange, onClear }: Props) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const rating = feedback?.rating

  // 打开备注框时预填已有备注
  useEffect(() => {
    if (noteOpen) setNote(feedback?.note ?? "")
  }, [noteOpen, feedback])

  // 点击外部关闭备注框
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setNoteOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  async function pushBackend(r: "up" | "down", noteText: string | null) {
    // sidecar 上报：后端不可用时静默降级（本地字段已即时更新）
    try {
      await fetch(`${BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: getClientId(),
          conv_id: convId,
          msg_idx: msgIdx,
          rating: r,
          note: noteText,
        }),
      })
    } catch {
      /* 离线降级 */
    }
  }

  async function clearBackend() {
    try {
      await fetch(
        `${BASE}/api/feedback?client_id=${encodeURIComponent(getClientId())}&conv_id=${encodeURIComponent(convId)}&msg_idx=${msgIdx}`,
        { method: "DELETE" }
      )
    } catch {
      /* 离线降级 */
    }
  }

  async function rate(r: "up" | "down") {
    // 同一评分再次点击 = 取消
    if (rating === r) {
      onClear()
      setNoteOpen(false)
      void clearBackend()
      return
    }
    const fb: Feedback = { rating: r, at: Date.now() }
    if (feedback?.note) fb.note = feedback.note
    onChange(fb)
    void pushBackend(r, feedback?.note ?? null)
    if (r === "down") setNoteOpen(true)
  }

  async function submitNote() {
    const text = note.trim()
    const r = rating ?? "down"
    setSaving(true)
    onChange({ rating: r, note: text || undefined, at: Date.now() })
    void pushBackend(r, text || null)
    setNoteOpen(false)
    setSaving(false)
  }

  return (
    <div className={`feedback-bar ${rating ? `rated-${rating}` : ""}`} ref={boxRef}>
      <button
        className={`fb-btn ${rating === "up" ? "active up" : ""}`}
        title={rating === "up" ? "取消好评" : "这条回复有帮助"}
        onClick={() => void rate("up")}
      >
        <ThumbsUp size={12} />
      </button>
      <button
        className={`fb-btn ${rating === "down" ? "active down" : ""}`}
        title={rating === "down" ? "取消差评" : "这条回复有问题"}
        onClick={() => void rate("down")}
      >
        <ThumbsDown size={12} />
      </button>
      {rating ? (
        <button className="fb-note-trigger" title="查看/修改备注" onClick={() => setNoteOpen((v) => !v)}>
          {feedback?.note ? "备注" : "写备注"}
        </button>
      ) : null}
      {rating ? (
        <button className="fb-clear" title="清除评价" onClick={() => void rate(rating)}>
          <X size={11} />
        </button>
      ) : null}

      {noteOpen ? (
        <div className="fb-note-box">
          <textarea
            className="fb-note-input"
            placeholder="说说这条回复的问题或改进建议（可选）…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="fb-note-actions">
            <button className="fb-note-cancel" onClick={() => setNoteOpen(false)}>
              取消
            </button>
            <button className="fb-note-save" disabled={saving} onClick={() => void submitNote()}>
              <Send size={11} /> {saving ? "保存中…" : "保存备注"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
