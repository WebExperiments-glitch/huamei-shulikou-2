import { create } from "zustand"
import type { EChartsCoreOption } from "echarts/core"

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

export type AIMessage = {
  role: "user" | "assistant"
  content: string
  reasoning?: string
  tools?: ToolCall[]
  sources?: SourceItem[]
  charts?: ChartSpec[]
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
const BASE = import.meta.env.VITE_API_BASE ?? ""

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
    const merged = [...remote].sort((a, b) => b.updatedAt - a.updatedAt)
    useConversations.setState({ conversations: merged, activeId: merged[0]?.id ?? null })
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
