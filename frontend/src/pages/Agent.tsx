import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bot, Send, Wrench, Loader2, AlertTriangle, Check, MessageSquarePlus, Trash2, Pencil, Pin, PinOff, Search } from "lucide-react"
import { api } from "../lib/api"
import { useFavorites } from "../lib/favorites"
import { useConversations } from "../lib/conversations"
import type { AIMessage, ToolCall, SourceItem, ChartSpec } from "../lib/conversations"
import { Markdown } from "../lib/markdown"
import { ChartCard } from "./Agent/ChartCard"

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8010"

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
]

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

  const aiIdx = useRef<number>(-1)
  const convIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingResumeRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const approvedRef = useRef<{ name: string; arguments: string }[]>([])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToBottom() {
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
    if (!q || loading) return

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
    scrollToBottom()

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
        body: JSON.stringify({ messages: payloadMessages, max_steps: 8, approved: opts?.approved ?? [] }),
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
            <span>术力口 AI 智能体</span>
            <span className={`agent-mode ${cloud ? "cloud" : "local"}`}>
              {cloud ? "云端智能体 · 工具可用" : "本地对话模式 · 工具已停用"}
            </span>
          </div>
          <p className="agent-sub">
            由 DeepSeek 云端模型驱动，可调用周榜 / 年榜 / 传说曲 / 单曲详情 / 检索 / 作者作品 / 趋势 / 对比 / 筛选等工具自主查证；
            还能联网搜索（web_search）与抓取网页正文（web_fetch）获取站外资料并标注来源；
            并能收藏歌曲、导出报告、触发数据刷新（写操作与系统任务需你确认后执行）。对话会自动保存，可随时新建 / 切换 / 重命名 / 删除。
          </p>
        </div>

        <div className="agent-msgs" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="agent-empty">
              <Bot size={40} />
              <p>问我任何关于术力口榜单与歌曲的问题，我会自己查数据再回答；也可让我收藏歌曲、导出报告或刷新数据。</p>
              <div className="agent-examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" onClick={() => send(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">
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
                      </div>
                    ))}
                  </details>
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
              </div>
            </div>
          ))}
        </div>

        <div className="agent-input">
          {loading && (
            <button className="chip stop" onClick={stop}>
              <AlertTriangle size={13} /> 停止
            </button>
          )}
          <textarea
            value={input}
            placeholder="例如：把这首收藏 / 最新一期周榜 Top5 / 刷新一下数据"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={2}
          />
          <button className="send-btn" onClick={() => send(input)} disabled={loading || !input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
