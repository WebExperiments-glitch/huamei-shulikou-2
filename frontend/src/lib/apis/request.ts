/**
 * API 共享基础设施：统一请求入口 + 结构化错误 + 前后端 request-id 关联。
 *
 * 设计要点（便于排查 BUG）：
 * - 每个请求自动生成 X-Request-ID 并转发给后端；后端 access_log / 异常日志会带同一 id，
 *   前端控制台与后端日志可按 id 对账。
 * - 非 2xx 时尝试解析后端返回的 detail（字符串 / 对象 / FastAPI 422 校验数组），
 *   抛出带 status/path/detail/requestId 的 ApiError，UI 可直接展示 readable message。
 * - 开发环境打印每个请求的方法/路径/状态码/耗时，慢接口一眼可见。
 */
import type { Producer, RankEntry, RankRaw, Vocalist } from "../types"

// 请求基础地址。默认空串：走 vite proxy 的相对 /api 前缀（浏览器开发模式）。
// Electron 桌面态下，经 initApiBase() 在启动早期改为直连本地后端的 http://127.0.0.1:<port>，
// 因此用可变活绑定而非 const，供全站统一引用（含各模块 import 的 BASE）。
export let BASE = import.meta.env.VITE_API_BASE ?? ""

/** 设置请求基础地址（供 initApiBase 在运行时更新）。 */
export function setApiBase(base: string): void {
  BASE = base
}

/**
 * 初始化 API 基础地址，须在应用渲染前调用一次。
 * - 显式配置了 VITE_API_BASE 时保持不变（浏览器/自定义部署优先）；
 * - Electron 桌面态（window.desktop）下直连后端子进程实际端口，去掉对 vite proxy 的依赖。
 *
 * 注意：IPC（getBackendPort）无响应时必须兜底放行，否则主进程异常时
 * 渲染进程将永远停留在 initApiBase → 首屏白屏。超时/失败保持默认相对路径。
 */
export async function initApiBase(timeoutMs = 3000): Promise<void> {
  if (import.meta.env.VITE_API_BASE) return
  const w = window as unknown as {
    desktop?: { isDesktop?: boolean; getBackendPort?: () => Promise<number> }
  }
  if (w.desktop?.isDesktop && typeof w.desktop.getBackendPort === "function") {
    const port = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(0), timeoutMs)
      w.desktop!.getBackendPort!()
        .then((p) => {
          clearTimeout(timer)
          resolve(typeof p === "number" && Number.isFinite(p) ? p : 0)
        })
        .catch(() => {
          clearTimeout(timer)
          resolve(0)
        })
    })
    if (port > 0) setApiBase(`http://127.0.0.1:${port}`)
  }
}

const DEBUG = import.meta.env.DEV

let seq = 0
/** 生成浏览器侧请求 ID（仅用于关联，无需跨页面唯一） */
export function nextRequestId(): string {
  seq += 1
  return `fe-${Date.now().toString(36)}-${seq.toString(36)}`
}

function logDebug(...args: unknown[]): void {
  if (DEBUG) console.debug("[api]", ...args)
}

/** 结构化 API 错误：status=0 表示网络层失败（后端未启动/断网/超时）。code 为后端结构化错误码。 */
export class ApiError extends Error {
  readonly status: number
  readonly path: string
  readonly detail: unknown
  readonly requestId?: string
  readonly code?: string

  constructor(
    message: string,
    opts: { status: number; path: string; detail?: unknown; requestId?: string; code?: string },
  ) {
    super(message)
    this.name = "ApiError"
    this.status = opts.status
    this.path = opts.path
    this.detail = opts.detail
    this.requestId = opts.requestId
    this.code = opts.code
  }
}

/** 把后端返回的 detail 归一化成可读文案（可能是字符串 / 对象 / 422 校验数组）。 */
export function extractDetail(detail: unknown, fallback = ""): string {
  if (detail == null) return fallback
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const msg = (item as { msg?: unknown }).msg
        if (typeof msg === "string") return msg
      }
    }
    return fallback || "请求参数校验失败"
  }
  if (typeof detail === "object") {
    const d = detail as { detail?: unknown; message?: unknown; msg?: unknown }
    if (typeof d.detail === "string") return d.detail
    if (typeof d.message === "string") return d.message
    if (typeof d.msg === "string") return d.msg
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return fallback
  }
}

async function readErrorDetail(res: Response): Promise<{ detail: unknown; code?: string }> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === "object") {
      const b = body as { detail?: unknown; code?: unknown }
      return { detail: b.detail, code: typeof b.code === "string" ? b.code : undefined }
    }
    return { detail: body }
  } catch {
    return { detail: null } // 非 JSON 错误体（如网关 502 的纯文本）
  }
}

/** 统一 JSON 请求。自动附加 X-Request-ID、开发期打印访问日志、解析后端 detail。 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const rid = nextRequestId()
  const headers = new Headers(init?.headers)
  headers.set("X-Request-ID", rid)
  const start = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, headers })
    const ms = Math.round(performance.now() - start)
    const respRid = res.headers.get("X-Request-ID") ?? rid
    logDebug(`${init?.method ?? "GET"} ${path} → ${res.status} ${ms}ms rid=${respRid}`)
    if (!res.ok) {
      const { detail, code } = await readErrorDetail(res)
      const msg = extractDetail(detail) || `API ${res.status}: ${path}`
      throw new ApiError(msg, { status: res.status, path, detail, requestId: respRid, code })
    }
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    // 网络层失败：常见原因是后端未启动 / 跨域 / 断网
    logDebug(`${init?.method ?? "GET"} ${path} FAILED: ${msg} (rid=${rid})`)
    throw new ApiError(msg, { status: 0, path, requestId: rid })
  }
}

// ---- 本地大模型 SSE 流式读取 ----
export interface AIStreamHandlers {
  onContent?: (text: string) => void
  onReasoning?: (text: string) => void
  onDone?: () => void
  onError?: (msg: string) => void
  onCache?: (hit: boolean) => void
  signal?: AbortSignal
}

export interface AIStreamOptions extends AIStreamHandlers {
  system?: string | null
  prompt: string
  maxTokens?: number
  temperature?: number
}

/** SSE 流式读取（OpenAI 兼容），同样带上 request-id 便于对账。 */
export async function streamSSE(
  path: string,
  body: Record<string, unknown>,
  opts: AIStreamHandlers,
): Promise<void> {
  const rid = nextRequestId()
  const start = performance.now()
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": rid },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok) {
      const { detail } = await readErrorDetail(res)
      opts.onError?.(extractDetail(detail) || `服务返回 ${res.status}`)
      return
    }
    if (!res.body) {
      opts.onError?.(`服务返回 ${res.status}（无响应体）`)
      return
    }
    logDebug(`POST ${path} SSE 开始 rid=${res.headers.get("X-Request-ID") ?? rid}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    let doneFired = false
    const fireDone = () => {
      if (!doneFired) {
        doneFired = true
        opts.onDone?.()
      }
    }
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const events = buf.split("\n\n")
      buf = events.pop() ?? ""
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data:"))
        if (!line) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const obj = JSON.parse(payload)
          if (obj.type === "content") opts.onContent?.(obj.text)
          else if (obj.type === "reasoning") opts.onReasoning?.(obj.text)
          else if (obj.type === "cache") opts.onCache?.(obj.hit === true)
          else if (obj.type === "done") fireDone()
          else if (obj.type === "error") opts.onError?.(obj.text)
        } catch {
          /* 忽略不完整分片 */
        }
      }
    }
    fireDone()
    logDebug(`POST ${path} SSE 结束 ${Math.round(performance.now() - start)}ms rid=${rid}`)
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return
    opts.onError?.(e instanceof Error ? e.message : String(e))
  }
}

/**
 * 把后端榜单原始条目（字段名有历史变体、可能缺省）归一化为前端标准 RankEntry。
 * 保持防御式取值：任一字段缺失都不应抛错。
 */
export function normalizeRankEntry(raw: RankRaw): RankEntry {
  return {
    rank: raw.rank ?? 0,
    bvid: raw.bvid ?? "",
    title: raw.title ?? "",
    title_cn: raw.title_cn ?? null,
    view: raw.view ?? raw.views ?? 0,
    favorite: raw.favorite ?? raw.favorites ?? 0,
    coin: raw.coin ?? raw.coins ?? 0,
    like: raw.like ?? raw.likes ?? 0,
    share: raw.share ?? 0,
    score: raw.score ?? raw.sum_score ?? 0,
    pubtime: raw.pubtime ?? undefined,
    first_recorded_at: raw.first_recorded_at ?? undefined,
    last_rank: raw.last_rank ?? null,
    weeks_on_board: raw.weeks_on_board ?? undefined,
    peak_rank: raw.peak_rank ?? undefined,
    rate: raw.rate ?? null,
    producers: raw.producers as Producer[] | undefined,
    vocalists: raw.vocalists as Vocalist[] | undefined,
    issue: raw.issue,
    issue_date: raw.issue_date,
    name: raw.name,
    best_rank: raw.best_rank ?? undefined,
  }
}
