import { create } from "zustand"
import type { EChartsCoreOption } from "echarts/core"
import { BASE } from "./apis/request"

export type ToolCall = {
  id: string
  name: string
  arguments: string
  result?: string
  status?: "running" | "pending_confirm" | "confirmed" | "canceled" | "done"
  action?: string
  payload?: unknown
  needConfirm?: boolean
  risk?: string
  isClient?: boolean
  isDanger?: boolean
  error?: { code: string; message: string } // 结构化错误码（tool_error 事件，借鉴 dsh {code,message}）
}

/** 待办清单项（todo_write 工具，借鉴 dsh tool-todo：整表替换 + last-write-wins） */
export type TodoItem = {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

/** 目标圆次预算（借鉴 dsh goal 的 maxGoalRounds：限制工具调用轮次防失控） */
export type AgentGoal = {
  objective: string
  max_rounds: number
}

export type SourceItem = {
  title: string
  url: string
  content?: string
}

export type ChartSpec = {
  id: string
  title?: string
  option: EChartsCoreOption
}

export type CacheUsage = {
  hit: number
  miss: number
  total: number
  pct: number
  est_input?: number   // 离线估算的输入 token 数
  cost?: number        // 本次输入估算成本（元）
  pricing?: {           // 定价参考（元/百万 tokens）
    hit: number
    miss: number
    output: number
  }
}

export type Feedback = {
  rating: "up" | "down"
  note?: string
  at?: number // 提交时间（毫秒）
}

export type AIMessage = {
  role: "user" | "assistant"
  content: string
  reasoning?: string
  tools?: ToolCall[]
  todos?: TodoItem[] // 待办清单快照（todo 事件，前端渲染进度条）
  goalProgress?: { rounds_used: number; max_rounds: number; objective: string } // 目标圆次预算实时进度（goal 事件）
  goalNote?: string // 目标圆次预算提示（goal_exhausted 事件）
  sources?: SourceItem[]
  charts?: ChartSpec[]
  cacheUsage?: CacheUsage
  compactNote?: string // 上下文压缩提示（后端 compaction 事件）
  feedback?: Feedback // 用户对这条回复的评价（👍/👎 + 备注）
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinned?: boolean
  messages: AIMessage[]
}

const KEY = "hb-agent-conversations"

function load(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Conversation[]
  } catch {
    /* ignore */
  }
  return []
}

function save(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 容量超限等场景静默失败，不阻塞交互 */
  }
}

// 流式输出期间会高频更新，用 400ms 防抖合并写盘；关闭前强制落盘避免丢尾。
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave() {
  const list = useConversations.getState().conversations
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    save(list)
    saveTimer = null
  }, 400)
}
function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  save(useConversations.getState().conversations)
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushSave()
    // 关闭前把未同步的会话尽力上报一次
    void flushSync()
  })
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSave()
      void flushSync()
    }
  })
}

// ---------------------------------------------------------------------------
// 后端持久化（服务端备份）：按匿名 client_id 隔离，无账号体系。
// 前端仍用 localStorage 作离线缓存；变更后防抖上报后端，启动时拉取合并。
// 后端不可用时静默降级，全部退化为纯前端 localStorage。
// ---------------------------------------------------------------------------
const CLIENT_KEY = "hb-agent-client-id"

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2)
      localStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    return "anon"
  }
}

let syncTimer: ReturnType<typeof setTimeout> | null = null
const pendingSync = new Set<string>()
function scheduleSync(id: string) {
  pendingSync.add(id)
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void flushSync()
  }, 600)
}
async function flushSync() {
  const ids = [...pendingSync]
  pendingSync.clear()
  syncTimer = null
  if (!ids.length) return
  const clientId = getClientId()
  const list = ids
    .map((id) => useConversations.getState().conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => Boolean(c))
  if (!list.length) return
  try {
    await fetch(`${BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, conversations: list }),
    })
  } catch {
    /* 离线降级：保留 localStorage */
  }
}
async function deleteOnServer(id: string) {
  const clientId = getClientId()
  try {
    await fetch(
      `${BASE}/api/conversations/${encodeURIComponent(id)}?client_id=${encodeURIComponent(clientId)}`,
      { method: "DELETE" }
    )
  } catch {
    /* 离线降级 */
  }
}
async function loadFromServer() {
  const clientId = getClientId()
  try {
    const res = await fetch(
      `${BASE}/api/conversations?client_id=${encodeURIComponent(clientId)}`
    )
    if (!res.ok) return
    const data = await res.json()
    const remote: Conversation[] = data.conversations ?? []
    if (remote.length === 0) {
      // 服务端无记录：把本地已有会话一次性上报（首迁），之后以服务端为准
      const local = useConversations.getState().conversations
      if (local.length) {
        void fetch(`${BASE}/api/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, conversations: local }),
        }).catch(() => {})
      }
      return
    }
    // 按 id 合并：本地与服务端逐会话取 updatedAt 较新者。整体覆盖会在服务端响应晚到时
    // （慢网络 / StrictMode 双调用）抹掉本地刚写入或流式进行中的消息，并打断当前选中的会话。
    const local = useConversations.getState().conversations
    const byId = new Map<string, Conversation>()
    for (const c of remote) byId.set(c.id, c)
    for (const c of local) {
      const r = byId.get(c.id)
      if (!r || c.updatedAt >= r.updatedAt) byId.set(c.id, c)
    }
    const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    const cur = useConversations.getState().activeId
    useConversations.setState({
      conversations: merged,
      activeId: merged.some((c) => c.id === cur) ? cur : merged[0]?.id ?? null,
    })
    scheduleSave()
  } catch {
    /* 离线降级：保留本地 */
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

const initial = load()
const initialActive = initial.length
  ? [...initial].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
  : null

interface ConvStore {
  conversations: Conversation[]
  activeId: string | null
  createConversation: (title?: string) => string
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  appendMessages: (id: string, msgs: AIMessage[]) => void
  updateMessage: (id: string, idx: number, fn: (m: AIMessage) => AIMessage) => void
  saveMessages: (id: string, msgs: AIMessage[]) => void
  getConversation: (id: string | null) => Conversation | undefined
  loadFromServer: () => Promise<void>
  syncConv: (id: string) => void
}

export const useConversations = create<ConvStore>((set, get) => ({
  conversations: initial,
  activeId: initialActive,

  createConversation: (title) => {
    const id = uid()
    const now = Date.now()
    const conv: Conversation = {
      id,
      title: title || "新对话",
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    set((st) => ({ conversations: [conv, ...st.conversations], activeId: id }))
    scheduleSave()
    scheduleSync(id)
    return id
  },

  selectConversation: (id) => {
    set({ activeId: id })
  },

  deleteConversation: (id) => {
    set((st) => {
      const conversations = st.conversations.filter((c) => c.id !== id)
      const activeId =
        st.activeId === id ? (conversations[0]?.id ?? null) : st.activeId
      return { conversations, activeId }
    })
    scheduleSave()
    void deleteOnServer(id)
  },

  renameConversation: (id, title) => {
    set((st) => ({
      conversations: st.conversations.map((c) =>
        c.id === id ? { ...c, title: title || c.title, updatedAt: Date.now() } : c
      ),
    }))
    scheduleSave()
    scheduleSync(id)
  },

  togglePin: (id) => {
    set((st) => ({
      conversations: st.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c
      ),
    }))
    scheduleSave()
    scheduleSync(id)
  },

  appendMessages: (id, msgs) => {
    set((st) => ({
      conversations: st.conversations.map((c) =>
        c.id === id
          ? { ...c, messages: [...c.messages, ...msgs], updatedAt: Date.now() }
          : c
      ),
    }))
    scheduleSave()
    scheduleSync(id)
  },

  updateMessage: (id, idx, fn) => {
    set((st) => ({
      conversations: st.conversations.map((c) => {
        if (c.id !== id) return c
        const messages = c.messages.map((m, i) => (i === idx ? fn(m) : m))
        return { ...c, messages, updatedAt: Date.now() }
      }),
    }))
    scheduleSave()
    scheduleSync(id)
  },

  saveMessages: (id, msgs) => {
    set((st) => ({
      conversations: st.conversations.map((c) =>
        c.id === id ? { ...c, messages: msgs, updatedAt: Date.now() } : c
      ),
    }))
    scheduleSave()
    scheduleSync(id)
  },

  getConversation: (id) =>
    id ? get().conversations.find((c) => c.id === id) : undefined,
  loadFromServer,
  syncConv: (id) => scheduleSync(id),
}))
