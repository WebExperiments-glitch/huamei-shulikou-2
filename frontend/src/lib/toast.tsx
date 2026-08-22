import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { ReactNode } from "react"
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"

export type ToastType = "success" | "error" | "warning" | "info"

interface ToastItem {
  id: number
  type: ToastType
  message: string
  leaving?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** 在 ToastProvider 内获取轻提示方法。 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast 必须在 <ToastProvider> 内使用")
  return ctx
}

const TYPE_ICON: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
}

let nextId = 1
const LEAVE_MS = 200
const MAX_STACK = 5

/**
 * 轻量 Toast 通知系统：
 * - 主题感知：全部使用设计令牌（var(--...)），自动适配深浅色；
 * - 玻璃质感：背板模糊 + 半透明，仅用于浮动层，不增加常驻 GPU 开销；
 * - 动效克制：进入/离开各 0.2s，尊重 prefers-reduced-motion。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, leaving: true } : it)))
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
    window.setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id))
    }, LEAVE_MS)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = "info", duration = 2600) => {
      const id = nextId++
      setItems((prev) => [...prev.slice(-(MAX_STACK - 1)), { id, type, message }])
      const t = window.setTimeout(() => dismiss(id), duration)
      timers.current.set(id, t)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((it) => (
          <div
            key={it.id}
            className={`toast toast-${it.type}${it.leaving ? " leaving" : ""}`}
            onClick={() => dismiss(it.id)}
            title="点击关闭"
          >
            <span className="toast-icon">{TYPE_ICON[it.type]}</span>
            <span className="toast-msg">{it.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
