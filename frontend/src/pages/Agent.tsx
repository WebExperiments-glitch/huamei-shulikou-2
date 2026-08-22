import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Canvas } from "@react-three/fiber"
import { Bot, Send, Wrench, Loader2, AlertTriangle, Check, MessageSquarePlus, Trash2, Pencil, Pin, PinOff, Search, FileText, Plus, X, Copy, Zap, FoldHorizontal, ListTodo } from "lucide-react"
import { api } from "../lib/api"
import EmotionBall from "../airi/components/EmotionBall"
import { useFavorites } from "../lib/favorites"
import { useConversations } from "../lib/conversations"
import { usePromptTemplates } from "../lib/promptTemplates"
import JobsPanel from "../components/JobsPanel"
import FeedbackBar from "../components/FeedbackBar"
import type { AIMessage, Feedback, ToolCall, SourceItem, ChartSpec, CacheUsage, TodoItem } from "../lib/conversations"
import { Markdown } from "../lib/markdown"
import { ChartCard } from "./Agent/ChartCard"
import { TypewriterText } from "../lib/fx"
import { StaggerGroup, StaggerItem } from "../lib/motion"

const BASE = import.meta.env.VITE_API_BASE ?? ""

function prettyArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return `今天 ${hm}`
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  if (isYest) return `昨天 ${hm}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

const EXAMPLES = [
  "最新一期周榜 Top5 是谁？",
  "洛天依有哪些代表作？",
  "BV1fc386VE6n 这首曲子的互动健康度如何？",
  "2025 年榜冠军是哪首？",
  "查一下「千本樱」相关的术曲",
  "初音未来是谁？帮我联网搜一下她的资料",
  "把 BV1fc386VE6n 收藏起来",
  "最近有哪些歌要冲刺神话/传说/殿堂？帮我列个预警清单",
  "本周有什么新曲首秀？谁排名涨得最猛？",
]

type SlashCmd = { key: string; label: string; desc: string; prompt?: string; fn?: "thinking" | "new" }
const SLASH: SlashCmd[] = [
  { key: "insights", label: "/insights", desc: "预警洞察：冲刺神话/传说/殿堂 + 新曲 + 突进", prompt: "调用 get_insights 列出当前正在冲刺神话曲 / 传说曲 / 殿堂曲的歌曲预警，以及本周新曲首秀和排名突进。" },
  { key: "周报", label: "/周报", desc: "生成最新一期周榜的专业周报", prompt: "请基于最新一期周榜生成一份专业周报：Top10、新曲首秀、排名突进、P主与歌姬上榜情况。" },
  { key: "歌词", label: "/歌词 <歌名>", desc: "获取某首术曲的歌词", prompt: "查一下「」这首歌的歌词。" },
  { key: "fav", label: "/fav <歌名/BV号>", desc: "收藏一首歌", prompt: "帮我收藏「」这首歌。" },
  { key: "refresh", label: "/refresh", desc: "触发数据刷新", prompt: "刷新一下数据，看看有没有最新一期周榜或最新同步。" },
  { key: "thinking", label: "/thinking", desc: "切换思考链开关", fn: "thinking" },
  { key: "new", label: "/new", desc: "新建对话", fn: "new" },
]

function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export default function Agent() {
  const {
    conversations,
    activeId,
    createConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    togglePin,
    appendMessages,
    updateMessage,
  } = useConversations()

  const [input, setInput] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  // 思考链开关：开=深度推理（费 token）；关=调工具后直接作答（省钱）。发请求时随 body 传给后端。
  // 默认关=最省钱，需要深度推理时再手动打开。
  const [thinking, setThinking] = useState(false)

  // 提示词模板面板
  const templates = usePromptTemplates()
  const [tplOpen, setTplOpen] = useState(false)
  const [tplNew, setTplNew] = useState(false)
  const [tplTitle, setTplTitle] = useState("")
  const [tplText, setTplText] = useState("")
  const [jobsOpen, setJobsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // 快捷命令（/）与智能滚动
  const [cmdIdx, setCmdIdx] = useState(0)
  const stickRef = useRef(true)
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  const slashCmds = useMemo(() => {
    if (!input.startsWith("/") || input.length < 2) return []
    const raw = input.slice(1)
    const hasSpace = raw.includes(" ")
    const word = hasSpace ? raw.slice(0, raw.indexOf(" ")) : raw
    return SLASH.filter((c) => c.key.toLowerCase().startsWith(word.toLowerCase())).slice(0, 6)
  }, [input])
  const applySlash = (c: SlashCmd) => {
    setCmdIdx(0)
    if (c.fn === "thinking") {
      setThinking((v) => !v)
      setInput("")
      textareaRef.current?.focus()
      return
    }
    if (c.fn === "new") {
      setInput("")
      createConversation()
      textareaRef.current?.focus()
      return
    }
    setInput(c.prompt ?? "")
    textareaRef.current?.focus()
  }

  const aiIdx = useRef<number>(-1)
  const convIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingResumeRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const approvedRef = useRef<{ name: string; arguments: string }[]>([])
  // 发送防重入：loading 是异步 state，快速连按回车/双击按钮时两次调用都会读到 false，
  // 用同步 ref 拦住第二次，避免同一问题重复发送、消息成对重复。
  const sendingRef = useRef(false)

  const activeConv = conversations.find((c) => c.id === activeId)
  const messages: AIMessage[] = activeConv?.messages ?? []

  const healthQ = useQuery({
    queryKey: ["ai-health-agent"],
    queryFn: api.aiHealth,
    staleTime: 30_000,
  })
  const cloud = healthQ.data?.cloud === true

  useEffect(() => {
    if (!useConversations.getState().activeId && useConversations.getState().conversations.length === 0) {
      createConversation()
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function scrollToBottom(force = false) {
    if (!force && !stickRef.current) return // 用户向上翻阅时不要打断
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    })
  }

  function downloadReport() {
    const lines: string[] = ["# 术力口 AI 智能体对话报告", ""]
    for (const m of messages) {
      if (m.role === "user") {
        lines.push(`## 用户\n${m.content}\n`)
      } else {
        if (m.reasoning) lines.push(`> 思考：${m.reasoning}\n`)
        if (m.content) lines.push(`## 智能体\n${m.content}\n`)
        for (const t of m.tools || []) {
          lines.push(`- 工具 \`${t.name}\`(${t.arguments})`)
          if (t.result) lines.push(`  结果：${t.result}`)
        }
        lines.push("")
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `agent-report-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function clientExec(action: string, payload: Record<string, unknown>): string {
    const fav = useFavorites.getState()
    if (action === "fav_song") {
      fav.toggle({ bvid: payload.bvid as string, title: payload.title as string, title_cn: payload.title_cn as string })
      return `已收藏《${payload.title}》（${payload.bvid}）`
    }
    if (action === "unfav_song") {
      fav.remove(payload.bvid as string)
      return `已取消收藏 ${payload.bvid}`
    }
    if (action === "add_note") {
      fav.setNote(payload.bvid as string, payload.note as string)
      return `已为 ${payload.bvid} 添加笔记`
    }
    if (action === "list_favorites") {
      const items = fav.items
      const onlyNote = !!payload?.has_note
      const filtered = onlyNote ? items.filter((x) => x.note) : items
      if (!filtered.length) return onlyNote ? "用户收藏中暂无带笔记的歌曲" : "用户收藏列表为空"
      const lines = filtered.slice(0, 30).map((x, i) => {
        const note = x.note ? `｜笔记：${x.note}` : ""
        const when = x.added_at ? `｜${new Date(x.added_at).toLocaleDateString()}` : ""
        return `${i + 1}. ${x.title_cn || x.title}（${x.bvid}）${note}${when}`
      })
      const total = filtered.length > 30 ? `（共 ${filtered.length} 条，显示前 30）` : ""
      return `用户收藏${onlyNote ? "（有笔记）" : ""}共 ${filtered.length} 条${total}：\n${lines.join("\n")}`
    }
    return "未知客户端操作"
  }

  function patchAssistant(fn: (m: AIMessage) => AIMessage) {
    const id = convIdRef.current
    if (id && aiIdx.current >= 0) updateMessage(id, aiIdx.current, fn)
  }

  async function send(text: string, opts?: { approved?: { name: string; arguments: string }[] }) {
    const q = text.trim()
    if (!q || loading || sendingRef.current) return
    sendingRef.current = true

    let cid = useConversations.getState().activeId
    if (!cid) cid = createConversation()
    convIdRef.current = cid

    const userMsg: AIMessage = { role: "user", content: q }
    const placeholder: AIMessage = { role: "assistant", content: "", reasoning: "", tools: [] }
    appendMessages(cid, [userMsg, placeholder])

    const conv = useConversations.getState().conversations.find((c) => c.id === cid)
    if (conv && (conv.title === "新对话" || !conv.title)) {
      renameConversation(cid, q.slice(0, 24))
    }

    setInput("")
    setLoading(true)
    const len = useConversations.getState().conversations.find((c) => c.id === cid)!.messages.length
    aiIdx.current = len - 1
    scrollToBottom(true)

    const payloadMessages = useConversations
      .getState()
      .conversations.find((c) => c.id === cid)!
      .messages.slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }))

    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch(`${BASE}/api/ai/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages, max_steps: 8, approved: opts?.approved ?? [], thinking }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        patchAssistant((m) => ({ ...m, content: m.content + `\n\n⚠️ 请求失败（HTTP ${res.status})` }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = chunk.split("\n").find((l) => l.startsWith("data:"))
          if (!line) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === "[DONE]") continue
          let ev: unknown
          try {
            ev = JSON.parse(payload)
          } catch {
            continue
          }
          handleEvent(ev as Record<string, unknown>)
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        patchAssistant((m) => ({ ...m, content: m.content + `\n\n⚠️ 网络错误：${e.message ?? e}` }))
      }
    } finally {
      setLoading(false)
      abortRef.current = null
      sendingRef.current = false
      const pr = pendingResumeRef.current
      if (pr) {
        pendingResumeRef.current = null
        send(pr)
      }
    }
  }

  function handleEvent(ev: Record<string, unknown>) {
    const t = ev?.type as string
    if (t === "reasoning") {
      patchAssistant((m) => ({ ...m, reasoning: (m.reasoning || "") + (ev.text as string) }))
    } else if (t === "content") {
      patchAssistant((m) => ({ ...m, content: (m.content || "") + (ev.text as string) }))
    } else if (t === "tool_call") {
      patchAssistant((m) => ({
        ...m,
        tools: [
          ...(m.tools || []),
          { id: ev.id as string, name: ev.name as string, arguments: ev.arguments as string, result: undefined, status: "running", isClient: ev.client as boolean },
        ],
      }))
    } else if (t === "tool_result") {
      patchAssistant((m) => ({
        ...m,
        tools: (m.tools || []).map((tl) => (tl.id === ev.id ? { ...tl, result: ev.content as string, status: "done" } : tl)),
      }))
    } else if (t === "tool_error") {
      // 结构化错误码（借鉴 dsh {code,message} 契约）：前端可按 code 差异化展示
      patchAssistant((m) => ({
        ...m,
        tools: (m.tools || []).map((tl) =>
          tl.id === ev.id
            ? { ...tl, error: { code: ev.code as string, message: ev.message as string }, status: "done" }
            : tl
        ),
      }))
    } else if (t === "todo") {
      patchAssistant((m) => ({ ...m, todos: Array.isArray(ev.todos) ? (ev.todos as TodoItem[]) : [] }))
    } else if (t === "goal") {
      patchAssistant((m) => ({
        ...m,
        goalProgress: {
          rounds_used: Number(ev.rounds_used) || 0,
          max_rounds: Number(ev.max_rounds) || 0,
          objective: (ev.objective as string) || "",
        },
      }))
    } else if (t === "goal_exhausted") {
      patchAssistant((m) => ({
        ...m,
        goalProgress: {
          rounds_used: Number(ev.rounds_used) || 0,
          max_rounds: Number(ev.max_rounds) || 0,
          objective: (ev.objective as string) || "",
        },
        goalNote: `已达目标圆次预算（${Number(ev.max_rounds) || 0} 轮），已停止调用工具，基于已有结果作答。`,
      }))
    } else if (t === "client_action") {
      if (ev.need_confirm === false) {
        const res = clientExec(ev.action as string, (ev.payload as Record<string, unknown>) || {})
        patchAssistant((m) => ({
          ...m,
          tools: (m.tools || []).map((tl) =>
            tl.id === ev.id
              ? { ...tl, status: "confirmed", result: res, action: ev.action as string, payload: ev.payload, needConfirm: false, isClient: true }
              : tl
          ),
        }))
        pendingResumeRef.current = `[系统] 客户端只读操作「${ev.name}」结果：\n${res}`
      } else {
        patchAssistant((m) => ({
          ...m,
          tools: (m.tools || []).map((tl) =>
            tl.id === ev.id
              ? { ...tl, status: "pending_confirm", action: ev.action as string, payload: ev.payload, needConfirm: ev.need_confirm as boolean, isClient: true }
              : tl
          ),
        }))
      }
    } else if (t === "confirm_required") {
      patchAssistant((m) => ({
        ...m,
        tools: (m.tools || []).map((tl) =>
          tl.id === ev.id ? { ...tl, status: "pending_confirm", risk: ev.risk as string, isDanger: true } : tl
        ),
      }))
    } else if (t === "error") {
      patchAssistant((m) => ({ ...m, content: (m.content || "") + `\n\n⚠️ ${ev.text}` }))
    } else if (t === "sources") {
      const items: SourceItem[] = Array.isArray(ev.items) ? (ev.items as SourceItem[]) : []
      if (items.length) {
        patchAssistant((m) => {
          const prev = m.sources || []
          const seen = new Set(prev.map((s) => s.url))
          const merged = [...prev, ...items.filter((s) => !seen.has(s.url))]
          return { ...m, sources: merged }
        })
      }
    } else if (t === "chart") {
      const spec = { id: ev.id as string, title: ev.title as string, option: ev.option } as ChartSpec
      patchAssistant((m) => ({ ...m, charts: [...(m.charts || []), spec] }))
    } else if (t === "cache_usage") {
      const pr = ev.pricing && typeof ev.pricing === "object" ? (ev.pricing as Record<string, unknown>) : undefined
      const cu: CacheUsage = {
        hit: Number(ev.hit) || 0,
        miss: Number(ev.miss) || 0,
        total: Number(ev.total) || 0,
        pct: Number(ev.pct) || 0,
        est_input: Number(ev.est_input) || undefined,
        cost: Number(ev.cost) || undefined,
        pricing: pr
          ? {
              hit: Number(pr.hit) || 0,
              miss: Number(pr.miss) || 0,
              output: Number(pr.output) || 0,
            }
          : undefined,
      }
      patchAssistant((m) => ({ ...m, cacheUsage: cu }))
    } else if (t === "compaction") {
      const folded = Number(ev.folded_messages) || 0
      const kept = Number(ev.kept_messages) || 0
      patchAssistant((m) => ({
        ...m,
        compactNote: `上下文已压缩：早期 ${folded} 条消息已折叠为摘要，保留最近 ${kept} 条。`,
      }))
    } else if (t === "done") {
      // 结束由 finally 处理
    }
    scrollToBottom()
  }

  function onConfirm(tool: ToolCall) {
    if (tool.isClient) {
      if (tool.action === "export_report") {
        downloadReport()
        patchAssistant((m) => ({
          ...m,
          tools: (m.tools || []).map((tl) =>
            tl.id === tool.id ? { ...tl, status: "confirmed", result: "已导出对话报告（Markdown）" } : tl
          ),
        }))
        return
      }
      const res = clientExec(tool.action || "", (tool.payload as Record<string, unknown>) || {})
      patchAssistant((m) => ({
        ...m,
        tools: (m.tools || []).map((tl) => (tl.id === tool.id ? { ...tl, status: "confirmed", result: res } : tl)),
      }))
    } else if (tool.isDanger) {
      const approved = [...approvedRef.current, { name: tool.name, arguments: tool.arguments }]
      approvedRef.current = approved
      patchAssistant((m) => ({
        ...m,
        tools: (m.tools || []).map((tl) =>
          tl.id === tool.id ? { ...tl, status: "confirmed", result: "已确认，执行中…" } : tl
        ),
      }))
      send(`[系统] 用户已确认执行 ${tool.name}(${tool.arguments})，请继续执行并给出结果。`, { approved })
    }
  }

  function onCancel(tool: ToolCall) {
    patchAssistant((m) => ({
      ...m,
      tools: (m.tools || []).map((tl) => (tl.id === tool.id ? { ...tl, status: "canceled" } : tl)),
    }))
    if (tool.isDanger) {
      send(`[系统] 用户取消了 ${tool.name} 操作，请不要执行它。`)
    }
  }

  function stop() {
    abortRef.current?.abort()
    setLoading(false)
  }

  function startRename(id: string, current: string) {
    setEditingId(id)
    setEditingText(current)
  }
  function commitRename() {
    if (editingId) renameConversation(editingId, editingText.trim() || "新对话")
    setEditingId(null)
    setEditingText("")
  }

  const displayList = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.content.toLowerCase().includes(q))
        )
      : conversations
    return [...list].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
  }, [conversations, search])

  useEffect(() => {
    useConversations.getState().loadFromServer()
  }, [])

  return (
    <div className="agent-layout">
      <aside className="agent-sidebar">
        <div className="agent-search">
          <Search size={14} />
          <input
            className="agent-search-input"
            placeholder="搜索对话…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="agent-new" onClick={() => createConversation()}>
          <MessageSquarePlus size={15} /> 新建对话
        </button>
        <div className="agent-conv-list">
          {displayList.length === 0 && (
            <div className="agent-conv-empty">
              {search.trim() ? "没有匹配的对话" : "还没有对话"}
            </div>
          )}
          {displayList.map((c) => (
            <div
              key={c.id}
              className={`agent-conv ${c.id === activeId ? "active" : ""}`}
              onClick={() => selectConversation(c.id)}
            >
              <div className="agent-conv-main">
                {editingId === c.id ? (
                  <input
                    className="agent-conv-edit"
                    value={editingText}
                    autoFocus
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename()
                      if (e.key === "Escape") {
                        setEditingId(null)
                        setEditingText("")
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className="agent-conv-title">{c.title}</div>
                    <div className="agent-conv-time">{formatTime(c.updatedAt)}</div>
                  </>
                )}
              </div>
              {editingId !== c.id && (
                <div className="agent-conv-actions">
                  <button
                    className={`agent-conv-btn ${c.pinned ? "pinned" : ""}`}
                    title={c.pinned ? "取消置顶" : "置顶"}
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePin(c.id)
                    }}
                  >
                    {c.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button
                    className="agent-conv-btn"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(c.id, c.title)
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="agent-conv-btn danger"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`确定删除对话「${c.title}」？此操作不可恢复。`)) deleteConversation(c.id)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="card agent-wrap">
        <div className="agent-head">
          <div className="agent-title">
            <Bot size={18} />
            <span><TypewriterText text="术力口 AI 智能体" /></span>
            <div className="agent-avatar-ball" title="智能体情绪球（运行中会活跃）">
              <Canvas
                camera={{ position: [0, 1.1, -2.1], fov: 42 }}
                gl={{ alpha: true }}
                dpr={[1, 2]}
                style={{ width: 100, height: 100 }}
              >
                <ambientLight intensity={1.1} />
                <directionalLight position={[5, 5, 5]} intensity={1} />
                <pointLight position={[0, 1, 1]} intensity={0.8} color="#a29bfe" />
                <EmotionBall energy={loading ? 1 : thinking ? 0.65 : 0} scale={0.8} />
              </Canvas>
            </div>
            <span className={`agent-mode ${cloud ? "cloud" : "local"}`}>
              {cloud ? "云端智能体 · 工具可用" : "本地对话模式 · 工具已停用"}
            </span>
          </div>
          <p className="agent-sub">
            由云端大模型驱动（SenseNova · deepseek-v4-flash），可调用周榜 / 年榜 / 传说曲 / 单曲详情 / 检索 / 作者作品 / 趋势 / 对比 / 筛选等工具自主查证；
            还能联网搜索（web_search）与抓取网页正文（web_fetch）获取站外资料并标注来源；
            并能收藏歌曲、导出报告、触发数据刷新（写操作与系统任务需你确认后执行）。对话会自动保存，可随时新建 / 切换 / 重命名 / 删除。
          </p>
        </div>

        <div className="agent-msgs" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 && (
            <div className="agent-empty">
              <Bot size={40} />
              <p>问我任何关于术力口榜单与歌曲的问题，我会自己查数据再回答；也可让我收藏歌曲、导出报告或刷新数据。</p>
              <div className="agent-examples">
                <StaggerGroup stagger={0.05} className="agent-examples-inner">
                  {EXAMPLES.map((ex) => (
                    <StaggerItem key={ex} className="agent-examples-item">
                      <button className="chip" onClick={() => send(ex)}>
                        {ex}
                      </button>
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.role === "assistant" && m.content && (
                  <button
                    className="msg-copy"
                    title="复制本回复"
                    onClick={() => {
                      void copyText(m.content || "").then(() => {
                        const b = document.activeElement as HTMLElement
                        b?.blur()
                      })
                    }}
                  >
                    <Copy size={12} />
                  </button>
                )}
                {m.role === "assistant" && (m.reasoning || m.tools?.length) ? (
                  <details className="reasoning-box" open={false}>
                    <summary>
                      <Wrench size={13} /> 思考与工具调用
                      {m.tools?.length ? `（${m.tools.length} 次）` : ""}
                    </summary>
                    {m.reasoning ? <pre className="reasoning-text">{m.reasoning}</pre> : null}
                    {m.tools?.map((tl) => (
                      <div key={tl.id} className={`tool-card ${tl.isDanger ? "tool-danger" : ""}`}>
                        <div className="tool-head">
                          <Wrench size={13} />
                          <code>{tl.name}</code>
                          {tl.status === "running" && (
                            <span className="tool-pending">
                              <Loader2 size={12} className="spin" /> 执行中…
                            </span>
                          )}
                          {tl.status === "done" && <span className="tool-ok">完成</span>}
                          {tl.status === "confirmed" && (
                            <span className="tool-ok">
                              <Check size={12} /> 已执行
                            </span>
                          )}
                          {tl.status === "canceled" && <span className="tool-canceled">已取消</span>}
                        </div>
                        <pre className="tool-args">{prettyArgs(tl.arguments)}</pre>

                        {tl.status === "pending_confirm" && tl.isClient ? (
                          <div className="tool-confirm">
                            <span className="tool-confirm-hint">需在前端确认后执行：</span>
                            <div className="tool-confirm-btns">
                              <button className="chip confirm" onClick={() => onConfirm(tl)}>
                                确认执行
                              </button>
                              <button className="chip cancel" onClick={() => onCancel(tl)}>
                                取消
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {tl.status === "pending_confirm" && tl.isDanger ? (
                          <div className="tool-confirm danger">
                            <p className="tool-risk">
                              <AlertTriangle size={13} /> {tl.risk}
                            </p>
                            <div className="tool-confirm-btns">
                              <button className="chip confirm danger" onClick={() => onConfirm(tl)}>
                                确认执行（有副作用）
                              </button>
                              <button className="chip cancel" onClick={() => onCancel(tl)}>
                                取消
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {tl.result !== undefined && tl.status !== "pending_confirm" ? (
                          <pre className="tool-result">{tl.result}</pre>
                        ) : null}

                        {tl.error ? (
                          <div className="tool-error" title={`结构化错误码：${tl.error.code}`}>
                            <AlertTriangle size={12} />
                            <code>{tl.error.code}</code>
                            <span>{tl.error.message}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </details>
                ) : null}

                {m.role === "assistant" && m.todos && m.todos.length > 0 ? (
                  <div className="agent-todos">
                    <div className="agent-todos-header">
                      <ListTodo size={13} />
                      <span>待办清单</span>
                      <span className="agent-todos-stats">
                        {m.todos.filter((t) => t.status === "completed").length}/{m.todos.length} 已完成
                      </span>
                    </div>
                    <div
                      className="agent-todos-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={m.todos.length}
                      aria-valuenow={m.todos.filter((t) => t.status === "completed").length}
                    >
                      <span
                        className="agent-todos-fill"
                        style={{
                          width: `${m.todos.length ? (m.todos.filter((t) => t.status === "completed").length / m.todos.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="agent-todos-list">
                      {m.todos.map((t) => (
                        <div key={t.id} className={`todo-item ${t.status}`}>
                          <span className="todo-status">
                            {t.status === "completed" ? (
                              <Check size={11} />
                            ) : t.status === "in_progress" ? (
                              <Loader2 size={11} className="spin" />
                            ) : (
                              <span className="todo-dot" />
                            )}
                          </span>
                          <span className={`todo-content ${t.status === "completed" ? "done" : ""}`}>{t.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {m.role === "assistant" && m.goalProgress ? (
                  <div className="goal-progress">
                    <span className="goal-progress-label">目标预算</span>
                    <div
                      className="agent-todos-bar goal"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={m.goalProgress.max_rounds}
                      aria-valuenow={m.goalProgress.rounds_used}
                    >
                      <span
                        className="agent-todos-fill goal"
                        style={{
                          width: `${m.goalProgress.max_rounds ? Math.min(100, (m.goalProgress.rounds_used / m.goalProgress.max_rounds) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="goal-progress-ratio">
                      {m.goalProgress.rounds_used}/{m.goalProgress.max_rounds} 轮
                      {m.goalProgress.objective ? ` · ${m.goalProgress.objective}` : ""}
                    </span>
                  </div>
                ) : null}

                {m.role === "assistant" && !m.content && !m.reasoning && !m.tools?.length ? (
                  <span className="agent-typing">
                    <Loader2 size={14} className="spin" /> 思考中…
                  </span>
                ) : null}

                {m.content ? (
                  <div className="msg-content">
                    <Markdown text={m.content} />
                  </div>
                ) : null}

                {m.charts && m.charts.length > 0 ? (
                  <div className="agent-charts">
                    {m.charts.map((c) => (
                      <ChartCard key={c.id} spec={c} />
                    ))}
                  </div>
                ) : null}

                {m.sources && m.sources.length > 0 ? (
                  <div className="agent-sources">
                    <span className="agent-sources-label">来源</span>
                    <div className="agent-sources-list">
                      {m.sources.map((s, si) => (
                        <a
                          key={si}
                          className="agent-source"
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={s.url}
                        >
                          <span className="agent-source-idx">{si + 1}</span>
                          {s.title || s.url}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {m.role === "assistant" && m.compactNote ? (
                  <div className="compact-note" title="早期对话已折叠为摘要以控制上下文规模">
                    <FoldHorizontal size={11} /> {m.compactNote}
                  </div>
                ) : null}

                {m.role === "assistant" && m.goalNote ? (
                  <div className="compact-note" title="目标圆次预算耗尽，已停止调用工具">
                    <AlertTriangle size={11} /> {m.goalNote}
                  </div>
                ) : null}

                {m.role === "assistant" && m.cacheUsage ? (
                  <div
                    className="cache-usage"
                    title={`本次请求 KV 缓存命中 ${m.cacheUsage.hit} 词元 / 未命中 ${m.cacheUsage.miss} 词元 / 输入规模约 ${m.cacheUsage.est_input ?? m.cacheUsage.total} 词元\n定价参考：命中 ¥${m.cacheUsage.pricing?.hit ?? 0.2}/M · 未命中 ¥${m.cacheUsage.pricing?.miss ?? 2}/M\n保持 system 提示与工具 schema 前缀稳定可提升命中率、降低成本。`}
                  >
                    <Zap size={11} /> 缓存命中 {m.cacheUsage.pct}%
                    {m.cacheUsage.cost !== undefined ? (
                      <span className="cache-usage-cost">· 约 ¥{m.cacheUsage.cost.toFixed(4)}</span>
                    ) : null}
                  </div>
                ) : null}

                {m.role === "assistant" && m.content ? (
                  <FeedbackBar
                    convId={activeId ?? ""}
                    msgIdx={i}
                    feedback={m.feedback}
                    onChange={(fb: Feedback) => updateMessage(activeId ?? "", i, (mm) => ({ ...mm, feedback: fb }))}
                    onClear={() => updateMessage(activeId ?? "", i, (mm) => ({ ...mm, feedback: undefined }))}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="agent-input">
          {jobsOpen && <JobsPanel onClose={() => setJobsOpen(false)} />}
          {loading && (
            <button className="chip stop" onClick={stop}>
              <AlertTriangle size={13} /> 停止
            </button>
          )}
          <button
            className="chip"
            onClick={() => {
              setTplOpen((v) => !v)
              setTplNew(false)
            }}
            title="提示词模板库"
          >
            <FileText size={13} /> 模板
          </button>
          <button
            className="chip"
            onClick={() => setJobsOpen((v) => !v)}
            title="后台任务面板（同步/刷新/重算的进度与取消）"
          >
            <ListTodo size={13} /> 任务
          </button>
          {tplOpen && (
            <div className="tpl-panel">
              <div className="tpl-head">
                <span>提示词模板</span>
                <button className="tpl-new" onClick={() => setTplNew((v) => !v)}>
                  {tplNew ? <X size={12} /> : <Plus size={12} />}
                  {tplNew ? "关闭" : "新建"}
                </button>
              </div>
              {tplNew && (
                <div className="tpl-newform">
                  <input
                    value={tplTitle}
                    onChange={(e) => setTplTitle(e.target.value)}
                    placeholder="模板名称"
                  />
                  <textarea
                    value={tplText}
                    onChange={(e) => setTplText(e.target.value)}
                    placeholder="模板内容（可含“歌名 / 作者名”等占位，插入后自行替换）"
                    rows={3}
                  />
                  <button
                    className="chip confirm"
                    onClick={() => {
                      templates.add(tplTitle, tplText)
                      setTplTitle("")
                      setTplText("")
                      setTplNew(false)
                    }}
                  >
                    保存模板
                  </button>
                </div>
              )}
              <div className="tpl-list">
                {templates.all().map((t) => (
                  <div key={t.id} className="tpl-item">
                    <button
                      className="tpl-use"
                      onClick={() => {
                        setInput(t.text)
                        setTplOpen(false)
                        textareaRef.current?.focus()
                      }}
                    >
                      <span className="tpl-name">{t.title}</span>
                      <span className="tpl-preview">{t.text}</span>
                    </button>
                    {!t.builtin && (
                      <button
                        className="tpl-del"
                        onClick={() => templates.remove(t.id)}
                        title="删除该模板"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            className={thinking ? "chip thinking on" : "chip thinking"}
            onClick={() => setThinking((v) => !v)}
            title={thinking ? "思考链开启：深度推理，消耗更多 token" : "思考链关闭：调工具后直接作答，更省钱"}
          >
            <Bot size={13} /> 思考链{thinking ? "·开" : "·关"}
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            placeholder="输入 / 查看快捷命令（Ctrl+K 聚焦）"
            onChange={(e) => {
              setInput(e.target.value)
              setCmdIdx(0)
            }}
            onKeyDown={(e) => {
              if (slashCmds.length) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setCmdIdx((i) => (i + 1) % slashCmds.length)
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setCmdIdx((i) => (i - 1 + slashCmds.length) % slashCmds.length)
                  return
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault()
                  const cmd = slashCmds[cmdIdx]
                  if (cmd) applySlash(cmd)
                  return
                }
                if (e.key === "Escape") {
                  setInput("")
                  return
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={2}
          />
          {slashCmds.length > 0 && (
            <div className="slash-panel">
              {slashCmds.map((c, i) => (
                <button
                  key={c.key}
                  className={"slash-item" + (i === cmdIdx ? " on" : "")}
                  onMouseEnter={() => setCmdIdx(i)}
                  onClick={() => applySlash(c)}
                >
                  <span className="slash-key">{c.label}</span>
                  <span className="slash-desc">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          <button className="send-btn" onClick={() => send(input)} disabled={loading || !input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
