import { useEffect, useRef, useState } from "react"
import { Send, Square, Sparkles } from "lucide-react"
import type { SongThink, AiTurn } from "../../lib/types"
import { api } from "../../lib/api"
import { MarkdownLite } from "../../components/MarkdownLite"

const AI_PRESETS = [
  { label: "🩺 互动健康度", ask: "请重点分析这首曲子的互动健康度：点赞率、投币率、收藏率、评论率、弹幕率各处于什么水平，哪些指标异常，说明原因。" },
  { label: "🚀 破圈潜力", ask: "请重点评估这首曲子的破圈潜力：有没有可能被搬运、翻唱或二创，走向圈外，依据数据说明理由。" },
  { label: "📣 运营建议", ask: "请给 UP 主一些可落地的运营建议：针对这首曲子的数据短板，具体该做哪些事来提升热度。" },
  { label: "⚠️ 风险提示", ask: "请评估这首曲子当前的风险：是否存在热度见顶、数据异常、受众错位等问题，以及如何应对。" },
]

export function SongAIAnalysis({ d }: { d: SongThink }) {
  const [conv, setConv] = useState<AiTurn[]>([])
  const [question, setQuestion] = useState("")
  const [pending, setPending] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReasoning, setShowReasoning] = useState(true)
  const [cacheHit, setCacheHit] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bufRef = useRef("")
  const rBufRef = useRef("")
  const errRef = useRef(false)
  const doneRef = useRef(false)
  const cacheHitRef = useRef(false)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  const [modelInfo, setModelInfo] = useState<{ model?: string; active?: string; cloud?: boolean }>({})

  useEffect(() => {
    let alive = true
    api
      .aiHealth()
      .then((r) => {
        if (!alive) return
        setModelReady(r.ready)
        setModelInfo({ model: r.model, active: r.active, cloud: r.cloud })
      })
      .catch(() => alive && setModelReady(false))
    return () => { alive = false }
  }, [])

  const modelLabel =
    modelInfo.cloud === true
      ? `云端模型 ● ${modelInfo.model || ""}`
      : modelInfo.active === "2b"
        ? `本地模型 ● 2B（降级）`
        : `本地模型 ● 4B`

  useEffect(() => {
    setConv([])
    setPending("")
    setReasoning("")
    setError(null)
    setQuestion("")
    setCacheHit(false)
    bufRef.current = ""
    rBufRef.current = ""
    errRef.current = false
    doneRef.current = false
    cacheHitRef.current = false
  }, [d.bvid])

  const run = (prefilled?: string) => {
    if (loading) return
    const text = (prefilled ?? question).trim()
    if (conv.length > 0 && !text) return
    const userTurn: AiTurn = {
      role: "user",
      content: text || "请对该曲做一次全面的互动健康度与传播力分析。",
    }
    const history = [...conv, userTurn]
    setConv(history)
    setQuestion("")
    setPending("")
    setReasoning("")
    setShowReasoning(true)
    setError(null)
    setCacheHit(false)
    cacheHitRef.current = false
    setLoading(true)
    bufRef.current = ""
    rBufRef.current = ""
    errRef.current = false
    doneRef.current = false
    const ctrl = new AbortController()
    abortRef.current = ctrl
    api.aiStreamSong(d.bvid, history, {
      signal: ctrl.signal,
      onContent: (t) => {
        bufRef.current += t
        setPending(bufRef.current)
      },
      onReasoning: (t) => {
        rBufRef.current += t
        setReasoning(rBufRef.current)
      },
      onCache: (hit) => {
        cacheHitRef.current = hit
        setCacheHit(hit)
      },
      onError: (msg) => {
        errRef.current = true
        setError(msg)
        setLoading(false)
        abortRef.current = null
      },
      onDone: () => {
        if (doneRef.current) return
        doneRef.current = true
        if (!errRef.current) {
          setConv((c) => [
            ...c,
            {
              role: "assistant",
              content: bufRef.current,
              reasoning: rBufRef.current,
              cached: cacheHitRef.current,
            },
          ])
        }
        setPending("")
        setLoading(false)
        abortRef.current = null
      },
    })
  }

  const stop = () => {
    abortRef.current?.abort()
    setLoading(false)
  }

  const canSend = !loading && (conv.length === 0 || question.trim().length > 0)

  const renderAi = (r: string, c: string, isLive: boolean) => (
    <div className="ai-bubble ai">
      {r && (
        <details className="ai-think" open={showReasoning} onToggle={(e) => setShowReasoning((e.target as HTMLDetailsElement).open)}>
          <summary>🧠 模型思考链</summary>
          <div className="ai-reasoning-body">{r}</div>
        </details>
      )}
      <div className="ai-bubble-main">
        {c ? <MarkdownLite text={c} /> : isLive && <span className="ai-cursor-only">▍</span>}
        {isLive && c && <span className="ai-cursor">▍</span>}
      </div>
    </div>
  )

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div className="ai-title">
          <Sparkles size={15} style={{ color: "var(--accent)", verticalAlign: -2 }} />
          AI 分析师
          <span className={`ai-dot ${modelReady === true ? "ok" : modelReady === false ? "bad" : ""}`} title={modelReady ? "本地模型已就绪" : "本地模型离线"}>
            {modelReady === true ? modelLabel : modelReady === false ? "模型离线 ○" : "检测中…"}
          </span>
        </div>
        <div className="ai-sub">基于上方真实互动数据，由 AI 大模型深度分析 · 可连续追问</div>
      </div>

      <div className="ai-presets">
        {AI_PRESETS.map((p) => (
          <button key={p.label} className="chip" disabled={loading} onClick={() => run(p.ask)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="ai-chat">
        {conv.length === 0 && !pending && (
          <div className="ai-empty">输入问题或点上方预设，AI 就会基于该曲真实数据给出深度分析 👇</div>
        )}
        {conv.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ai-bubble user">{t.content}</div>
          ) : (
            <div key={`a-${i}`}>
              {t.cached && <span className="ai-cache-badge">⚡ 命中缓存</span>}
              {renderAi(t.reasoning || "", t.content, false)}
            </div>
          ),
        )}
        {(pending || reasoning) && (
          <div key="ai-live">
            {cacheHit && <span className="ai-cache-badge">⚡ 命中缓存 · 秒回</span>}
            {renderAi(reasoning, pending, true)}
          </div>
        )}
        {loading && !pending && !reasoning && (
          <div className="ai-thinking">
            {modelInfo.cloud
              ? "AI 正在生成分析…（云端模型，通常数秒内返回）"
              : "AI 正在深入思考并生成分析…（本地模型不限制思考长度，通常需要 1–4 分钟）"}
          </div>
        )}
      </div>

      {error && <div className="callout callout-err">分析失败：{error}（请确认本地模型服务已启动）</div>}

      <div className="ai-input-row">
        <textarea
          className="ai-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (canSend) run()
            }
          }}
          placeholder={conv.length === 0 ? "想让 AI 重点关注什么？如：它为什么能火 / 和同类术曲相比如何（留空则全面分析）" : "继续追问…（Enter 发送，Shift+Enter 换行）"}
          rows={2}
        />
        {!loading ? (
          <button className="chip primary" disabled={!canSend} onClick={() => run()}>
            <Send size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            发送
          </button>
        ) : (
          <button className="chip" onClick={stop}>
            <Square size={12} style={{ marginRight: 5, verticalAlign: -2, fill: "currentColor" }} />
            停止
          </button>
        )}
      </div>
    </div>
  )
}
