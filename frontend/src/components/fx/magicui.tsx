/**
 * Magic UI 风格组件移植（https://magicui.design）
 * 按 MIT 许可的原始实现改写：motion/react + 本项目 fx 门控 + 语义 token。
 * 所有组件读取特效设置（useEffects），总开关/对应开关关闭后退化为静态。
 */
import { useEffect, useRef, type ReactNode } from "react"
import { motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react"
import { cn } from "../../lib/utils"
import { useFx } from "../../lib/effects"

/* ------------------------------------------------------------------ */
/* Animated Gradient Text — 流光渐变文字（ Magic UI 招牌组件）            */
/* ------------------------------------------------------------------ */
export function AnimatedGradientText({
  children,
  className,
  colors = ["#3b63d9", "#7b6bff", "#c2188c", "#3b63d9"],
  speed = 6,
}: {
  children: ReactNode
  className?: string
  colors?: string[]
  speed?: number
}) {
  const on = useFx("textAnim")
  const background = on
    ? `linear-gradient(90deg, ${colors.join(", ")})`
    : `linear-gradient(90deg, ${colors[0]}, ${colors[colors.length - 1]})`
  return (
    <span
      className={cn("inline bg-clip-text text-transparent", className)}
      style={{ backgroundImage: background, backgroundSize: "250% 100%", animation: on ? `mgui-grad-slide ${speed}s linear infinite` : undefined }}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Shine Border — 环绕流光边框                                          */
/* ------------------------------------------------------------------ */
export function ShineBorder({
  children,
  className,
  borderRadius = 12,
  borderWidth = 1.5,
  duration = 12,
  color = ["#3b63d9", "#7b6bff", "#c2188c"],
}: {
  children: ReactNode
  className?: string
  borderRadius?: number
  borderWidth?: number
  duration?: number
  color?: string | string[]
}) {
  const on = useFx("cardMicro")
  const colors = Array.isArray(color) ? color.join(",") : color
  return (
    <div className={cn("relative grid place-items-stretch", className)} style={{ borderRadius }}>
      <div
        aria-hidden
        style={{
          borderRadius,
          padding: borderWidth,
          background: on
            ? `conic-gradient(from var(--mgui-shine-angle, 0deg), transparent 0%, ${colors} 16%, transparent 26%)`
            : "var(--border)",
          animation: on ? `mgui-shine-rot ${duration}s linear infinite` : undefined,
        }}
      >
        <div className="h-full w-full" style={{ borderRadius: Math.max(2, borderRadius - borderWidth), background: "var(--bg-card)" }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Border Beam — 沿边框巡游的光束（motion 驱动，offsetPath 走矩形路径）    */
/* ------------------------------------------------------------------ */
export function BorderBeam({
  className,
  size = 60,
  duration = 6,
  delay = 0,
  colorFrom = "#3b63d9",
  colorTo = "#7b6bff",
  reverse = false,
}: {
  className?: string
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  reverse?: boolean
}) {
  const on = useFx("cardMicro")
  if (!on) return null
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect]" aria-hidden>
      <motion.div
        className={cn("absolute aspect-square", className)}
        style={{
          width: size,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
          borderRadius: "inherit",
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
        }}
        initial={{ offsetDistance: reverse ? "100%" : "0%" }}
        animate={{ offsetDistance: reverse ? "0%" : "100%" }}
        transition={{ repeat: Infinity, ease: "linear", duration, delay: -delay }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dot Pattern / Grid Pattern — 背景点阵 / 网格                          */
/* ------------------------------------------------------------------ */
export function DotPattern({
  className,
  width = 16,
  height = 16,
  cx = 1,
  cy = 1,
  cr = 1,
  glow = false,
  ...props
}: React.ComponentProps<"svg"> & { width?: number; height?: number; cx?: number; cy?: number; cr?: number; glow?: boolean }) {
  const id = useRef(`mgui-dot-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full fill-[color:var(--text-faint)]/40", className)} {...props}>
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse">
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      {glow && (
        <rect width="100%" height="100%" fill={`url(#${id})`} style={{ filter: "blur(6px) opacity(0.35)" }} />
      )}
    </svg>
  )
}

export function GridPattern({
  className,
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = "none",
  ...props
}: React.ComponentProps<"svg"> & { width?: number; height?: number; x?: number; y?: number; strokeDasharray?: string }) {
  const id = useRef(`mgui-grid-${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full stroke-[color:var(--border)] fill-none", className)} {...props}>
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeDasharray={strokeDasharray} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Meteors — 流星雨背景                                                  */
/* ------------------------------------------------------------------ */
export function Meteors({ number = 14, className }: { number?: number; className?: string }) {
  const on = useFx("particles")
  const meteors = useRef(
    Array.from({ length: number }, (_, i) => ({
      id: i,
      left: Math.floor(Math.random() * 100),
      top: -Math.floor(Math.random() * 40),
      delay: `${(Math.random() * 8).toFixed(2)}s`,
      duration: `${(Math.random() * 6 + 4).toFixed(2)}s`,
    })),
  ).current
  if (!on) return null
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {meteors.map((m) => (
        <span
          key={m.id}
          className="absolute size-0.5 rotate-[215deg] rounded-full bg-[color:var(--accent)] shadow-[0_0_0_1px_rgba(255,255,255,.06)] before:absolute before:top-1/2 before:h-px before:w-[60px] before:-translate-y-1/2 before:bg-gradient-to-r before:from-[color:var(--accent)] before:to-transparent"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            animation: `mgui-meteor ${m.duration} linear ${m.delay} infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Number Ticker — 数字滚动（进视口触发，与项目 useCountUp 互补）          */
/* ------------------------------------------------------------------ */
export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  decimalPlaces = 0,
  className,
  locale = "zh-CN",
}: {
  value: number
  startValue?: number
  delay?: number
  decimalPlaces?: number
  className?: string
  locale?: string
}) {
  const on = useFx("countUp")
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-30px" })
  const mv = useMotionValue(startValue)
  const spring = useSpring(mv, { damping: 26, stiffness: 140 })
  const display = useTransform(spring, (v) =>
    Intl.NumberFormat(locale, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(
      Number.isFinite(v) ? v : 0,
    ),
  )
  useEffect(() => {
    if (on && inView) {
      const t = setTimeout(() => mv.set(value), delay * 1000)
      return () => clearTimeout(t)
    }
    mv.set(value)
  }, [inView, value, delay, on, mv])
  return (
    <span ref={ref} className={cn("inline-block tabular-nums tracking-tight", className)}>
      {on ? <motion.span>{display}</motion.span> : Intl.NumberFormat(locale).format(value)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Sparkles / Shimmer Text — 闪烁微光文字                                */
/* ------------------------------------------------------------------ */
export function ShimmerText({
  children,
  className,
  colors = ["#8b94a3", "#ffffff", "#8b94a3"],
  duration = 2.5,
}: {
  children: ReactNode
  className?: string
  colors?: string[]
  duration?: number
}) {
  const on = useFx("textAnim")
  return (
    <span
      className={cn("inline bg-clip-text text-transparent", className)}
      style={{
        backgroundImage: `linear-gradient(110deg, ${colors.join(", ")}, ${colors[0]})`,
        backgroundSize: "220% 100%",
        animation: on ? `mgui-shimmer ${duration}s linear infinite` : undefined,
      }}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Animated Badge —— 带呼吸光晕的徽标（Magic UI animated-shiny-badge 简化）*/
/* ------------------------------------------------------------------ */
export function AnimatedBadge({ children, className }: { children: ReactNode; className?: string }) {
  const on = useFx("cardMicro")
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {on && (
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
      )}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Bento Grid —— 便当盒网格（子项 Reveal 交错由外层 StaggerGroup 承担）    */
/* ------------------------------------------------------------------ */
export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-3", className)}>{children}</div>
  )
}

export function BentoCard({
  children,
  className,
  title,
  description,
}: {
  children?: ReactNode
  className?: string
  title?: ReactNode
  description?: ReactNode
}) {
  return (
    <div
      className={cn(
        "group relative col-span-1 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md",
        className,
      )}
    >
      {(title || description) && (
        <div className="mb-3">
          {title && <div className="text-sm font-semibold">{title}</div>}
          {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/** 导出统一 hooks 供外部使用 */
export { useMotionValue, useSpring }
