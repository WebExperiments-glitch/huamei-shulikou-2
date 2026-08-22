import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties, MouseEvent, ReactNode } from "react"
import { useEffects } from "./effects"

/**
 * 新增动画原语（灵感来自 React Bits / Magic UI，自研适配到本项目）。
 * 所有组件都读取特效设置：关闭对应开关后自动退化为静态渲染，尊重 prefers-reduced-motion。
 */

/** 数字滚动动画：从 0（或旧值）平滑滚到新值（easeOutCubic），支持 startDelay 错峰与自定义格式化。 */
export function AnimatedNumber({
  value,
  formatter = (n: number) => String(Math.round(n)),
  duration = 650,
  startDelay = 0,
  className,
  style,
}: {
  value: number
  formatter?: (n: number) => string
  duration?: number
  startDelay?: number
  className?: string
  style?: CSSProperties
}) {
  const on = useEffects((s) => s.master && s.countUp)
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (!on || reduced) {
      fromRef.current = value
      setDisplay(value)
      return
    }
    const from = fromRef.current
    fromRef.current = value
    if (from === value) {
      setDisplay(value)
      return
    }
    let raf = 0
    const timer = window.setTimeout(() => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        setDisplay(Math.round(from + (value - from) * eased))
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, startDelay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [value, on, reduced, duration, startDelay])

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {formatter(display)}
    </span>
  )
}

/** 打字机文本：逐字浮现 + 闪烁光标，读完自动停止。 */
export function TypewriterText({
  text,
  speed = 42,
  startDelay = 0,
  className,
  style,
}: {
  text: string
  speed?: number
  startDelay?: number
  className?: string
  style?: CSSProperties
}) {
  const on = useEffects((s) => s.master && s.textAnim)
  const reduced = useReducedMotion()
  const [n, setN] = useState(() => (on && !reduced ? 0 : text.length))
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!on || reduced) {
      setN(text.length)
      return
    }
    setN(0)
    let i = 0
    const start = setTimeout(() => {
      ivRef.current = setInterval(() => {
        i++
        setN(i)
        if (i >= text.length && ivRef.current) clearInterval(ivRef.current)
      }, speed)
    }, startDelay)
    return () => {
      clearTimeout(start)
      if (ivRef.current) clearInterval(ivRef.current)
    }
  }, [text, on, reduced, speed, startDelay])

  const typing = on && !reduced && n < text.length
  return (
    <span className={`${className ?? ""}${typing ? " tw-typing" : ""}`} style={style}>
      {text.slice(0, n)}
      {typing && <span className="tw-caret" aria-hidden />}
    </span>
  )
}

/** 渐变闪烁文本：文字流光（背景裁剪到文字）。关闭时退化为普通文本。 */
export function ShimmerText({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const on = useEffects((s) => s.master && s.textAnim)
  return (
    <span className={`shimmer-text${on ? "" : " off"} ${className ?? ""}`.trim()} style={style}>
      {children}
    </span>
  )
}

/** 3D 倾斜卡片：跟随鼠标俯仰 + 反光聚光，退出时归位。 */
export function TiltCard({
  children,
  className,
  max = 7,
  scale = 1.015,
  glare = true,
  style,
}: {
  children: ReactNode
  className?: string
  max?: number
  scale?: number
  glare?: boolean
  style?: CSSProperties
}) {
  const on = useEffects((s) => s.master && s.cardMicro)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const srx = useSpring(rx, { stiffness: 260, damping: 22 })
  const sry = useSpring(ry, { stiffness: 260, damping: 22 })

  if (!on || reduced) {
    return (
      <div className={`tilt-card ${className ?? ""}`.trim()} style={style}>
        {children}
      </div>
    )
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 触摸设备跳过倾斜跟随：手指经过卡片时不应触发 3D 姿态（手感 & 性能）
    if (e.pointerType !== "mouse") return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    rx.set((py - 0.5) * -2 * max)
    ry.set((px - 0.5) * 2 * max)
    if (glare) {
      el.style.setProperty("--gx", `${px * 100}%`)
      el.style.setProperty("--gy", `${py * 100}%`)
    }
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={`tilt-card ${className ?? ""}`.trim()}
      style={{
        rotateX: srx,
        rotateY: sry,
        transformPerspective: 820,
        transformStyle: "preserve-3d",
        scale,
        ...style,
      }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </motion.div>
  )
}

/** 点击涟漪按钮包装：点击处扩散一个圆环。 */
export function RippleButton({
  children,
  className,
  onClick,
  style,
  ...rest
}: {
  children: ReactNode
  className?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  style?: CSSProperties
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "style" | "className">) {
  const on = useEffects((s) => s.master && s.cardMicro)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)

  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    if (!on || reduced) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const size = Math.max(r.width, r.height) * 2
    const span = document.createElement("span")
    span.className = "ripple-ink"
    span.style.width = span.style.height = `${size}px`
    span.style.left = `${e.clientX - r.left - size / 2}px`
    span.style.top = `${e.clientY - r.top - size / 2}px`
    el.appendChild(span)
    span.addEventListener("animationend", () => span.remove())
  }

  return (
    <button
      ref={ref}
      className={`ripple-btn ${className ?? ""}`.trim()}
      onClick={handle}
      style={style}
      {...rest}
    >
      {children}
    </button>
  )
}

/** 榜单排名徽标：排名 + 涨跌方向 + 新上榜，配合 data 动画弹入。 */
export function RankBadge({
  rank,
  rate,
  lastRank,
  weeksOnBoard,
  className,
}: {
  rank: number
  rate?: string | null
  lastRank?: number | null
  /** 上榜周数：=1 视为新上榜（后端榜单接口不返回 last_rank，用周数作代理） */
  weeksOnBoard?: number
  className?: string
}) {
  const on = useEffects((s) => s.master && s.dataAnim)
  const isNew = lastRank == null && weeksOnBoard === 1
  let dir = "flat"
  if (rate && /^[+-]/.test(rate)) dir = rate.startsWith("+") ? "up" : "down"
  const cls = ["rank-no", className, on ? "rank-badge" : "", on ? `rank-dir-${dir}` : "", on && isNew ? "rank-new" : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <span className={cls}>
      {rank}
      {on && isNew && <span className="rank-new-tag" aria-label="新上榜">NEW</span>}
    </span>
  )
}

/** 轻量粒子背景：少量漂浮光点，随密度变化，关闭或减弱动效时暂停。 */
export function ParticlesBg() {
  const on = useEffects((s) => s.master && s.particles)
  const density = useEffects((s) => s.density)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (!on || reduced) {
      canvas.style.opacity = "0"
      return
    }
    canvas.style.opacity = "1"
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const count = density === "high" ? 54 : density === "low" ? 22 : 36
    const dots = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.00022,
      vy: (Math.random() - 0.5) * 0.00022,
      a: 0.18 + Math.random() * 0.3,
    }))

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        d.x += d.vx * dt * 60
        d.y += d.vy * dt * 60
        if (d.x < -0.05) d.x = 1.05
        if (d.x > 1.05) d.x = -0.05
        if (d.y < -0.05) d.y = 1.05
        if (d.y > 1.05) d.y = -0.05
        ctx.beginPath()
        ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(120, 160, 240, ${d.a})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [on, reduced, density])

  return (
    <canvas
      ref={ref}
      className="particles-bg"
      aria-hidden
      style={{ transition: "opacity .6s ease" }}
    />
  )
}
