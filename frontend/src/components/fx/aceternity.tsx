/**
 * Aceternity UI 风格组件移植（https://ui.aceternity.com）
 * 按 MIT 许可的原始实现改写：motion/react + 本项目 fx 门控 + 语义 token。
 */
import { createElement, useEffect, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { cn } from "../../lib/utils"
import { useFx } from "../../lib/effects"

/* ------------------------------------------------------------------ */
/* Spotlight —— 悬停聚光灯卡片（Aceternity 招牌组件）                     */
/* ------------------------------------------------------------------ */
export function Spotlight({
  className,
  spotColor = "rgba(59, 99, 217, 0.18)",
}: {
  className?: string
  spotColor?: string
}) {
  const on = useFx("cardMicro")
  if (!on) return null
  return (
    <svg
      className={cn("pointer-events-none absolute z-10 h-full w-full", className)}
      viewBox="0 0 366 366"
      fill="none"
      aria-hidden
    >
      <defs>
        <radialGradient id="acet-spot" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.16" />
          <stop offset="100%" stopColor={spotColor} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="acet-spot-2" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stopColor={spotColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <g style={{ mixBlendMode: "plus-lighter" }}>
        <ellipse cx="183" cy="120" rx="150" ry="110" fill="url(#acet-spot-2)" />
      </g>
      <rect width="366" height="366" fill="url(#acet-spot)" style={{ mixBlendMode: "plus-lighter" }} />
    </svg>
  )
}

/** 悬停时鼠标跟随高光的卡片容器（Aceternity spotlight-card） */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(59, 99, 217, 0.16)",
}: {
  children: ReactNode
  className?: string
  spotlightColor?: string
}) {
  const on = useFx("cardMicro")
  const [pos, setPos] = useState({ x: -400, y: -400 })
  const [hover, setHover] = useState(false)
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-border bg-card", className)}
      onMouseEnter={on ? () => setHover(true) : undefined}
      onMouseLeave={on ? () => setHover(false) : undefined}
      onMouseMove={on ? (e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
      } : undefined}
    >
      {on && (
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
          style={{
            background: `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 70%)`,
            opacity: hover ? 1 : 0,
          }}
          aria-hidden
        />
      )}
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hover Border Gradient —— 悬停时沿边框流动的渐变按钮                     */
/* ------------------------------------------------------------------ */
const HB_DIRS = ["top", "left", "bottom", "right"] as const
type HBDir = (typeof HB_DIRS)[number]

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as = "button",
  duration = 1,
  clockwise = true,
  ...props
}: Omit<React.ComponentProps<"button">, "onMouseEnter" | "onMouseLeave"> & {
  containerClassName?: string
  as?: "button" | "div" | "span"
  duration?: number
  clockwise?: boolean
}) {
  const on = useFx("cardMicro")
  const [hovered, setHovered] = useState(false)
  const [activeDir, setActiveDir] = useState<HBDir | null>(null)

  useEffect(() => {
    if (!on || !hovered) {
      setActiveDir(null)
      return
    }
    const order = clockwise ? [...HB_DIRS] : [...HB_DIRS].reverse()
    let i = 0
    setActiveDir(order[0] ?? null)
    const t = setInterval(() => {
      i = (i + 1) % order.length
      setActiveDir(order[i] ?? null)
    }, duration * 1000)
    return () => clearInterval(t)
  }, [hovered, on, clockwise, duration])

  const rotateMap: Record<HBDir, string> = {
    top: "0deg",
    left: "90deg",
    bottom: "180deg",
    right: "-90deg",
  }

  // 多态标签用 createElement 绕开 JSX 对联合 intrinsic 的 never 推断
  return createElement(
    as,
    {
      className: cn("relative flex h-min w-fit flex-col flex-nowrap content-center justify-center overflow-visible p-[1px] decoration-clone", containerClassName),
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      ...props,
    } as React.ComponentProps<"div">,
    <>
      {on && hovered && (
        <>
          {HB_DIRS.map((dir) => (
            <div
              key={dir}
              aria-hidden
              className="absolute inset-0 z-10 h-px w-px rounded-full bg-[radial-gradient(var(--accent)_0%,transparent_60%)] opacity-60"
              /* 用独立 rotate/scale 属性合成：inline transform 会整体覆盖类的 scale，导致光点永不缩放 */
              style={{
                rotate: rotateMap[dir],
                scale: activeDir === dir ? "250" : "0",
                opacity: activeDir === dir ? 1 : 0.4,
                transition: "scale 350ms ease, opacity 350ms ease",
              }}
            />
          ))}
        </>
      )}
      <div className={cn("z-10 w-auto rounded-[inherit] bg-card text-foreground", className)}>{children}</div>
    </>,
  )
}

/* ------------------------------------------------------------------ */
/* Text Generate Effect —— 文字逐词淡入（进视口触发）                     */
/* ------------------------------------------------------------------ */
export function TextGenerateEffect({
  text,
  className,
  wordsClassName,
  stagger = 0.06,
  blur = true,
}: {
  text: string
  className?: string
  wordsClassName?: string
  stagger?: number
  blur?: boolean
}) {
  const on = useFx("reveal")
  const words = text.split(" ")
  if (!on) return <p className={className}>{text}</p>
  return (
    <p className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className={wordsClassName}
          initial={{ opacity: 0, filter: blur ? "blur(8px)" : undefined }}
          whileInView={{ opacity: 1, filter: blur ? "blur(0px)" : undefined }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{ duration: 0.5, delay: i * stagger, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {w}{" "}
        </motion.span>
      ))}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Background Beams —— 斜射光束背景（Aceternity 化简版，纯 SVG+CSS）      */
/* ------------------------------------------------------------------ */
export function BackgroundBeams({ className }: { className?: string }) {
  const on = useFx("glassBg")
  if (!on) return null
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]", className)} aria-hidden>
      {[20, 35, 50, 65, 80].map((left, i) => (
        <div
          key={left}
          className="absolute top-[-18%] h-[150%] w-px bg-gradient-to-b from-transparent via-[color:var(--accent)]/25 to-transparent"
          style={{
            left: `${left}%`,
            transform: "rotate(18deg)",
            animation: `acet-beam ${4 + i * 1.3}s ease-in-out ${i * 0.4}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Aurora Background —— 极光背景（Aceternity 化简版：3 团模糊光斑漂移）   */
/* ------------------------------------------------------------------ */
export function AuroraBackground({
  className,
  colors = ["rgba(59, 99, 217, 0.22)", "rgba(123, 107, 255, 0.16)", "rgba(194, 24, 140, 0.12)"],
}: {
  className?: string
  colors?: [string, string, string] | string[]
}) {
  const on = useFx("glassBg")
  if (!on) return null
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className="acet-blob absolute -top-[35%] left-[8%] h-[80%] w-[45%] rounded-full"
        style={{ background: colors[0], animation: "acet-aurora-1 16s ease-in-out infinite alternate" }}
      />
      <div
        className="acet-blob absolute top-[10%] right-[5%] h-[70%] w-[40%] rounded-full"
        style={{ background: colors[1], animation: "acet-aurora-2 20s ease-in-out infinite alternate" }}
      />
      <div
        className="acet-blob absolute bottom-[-30%] left-[30%] h-[65%] w-[45%] rounded-full"
        style={{ background: colors[2], animation: "acet-aurora-3 24s ease-in-out infinite alternate" }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Card Hover Effect —— 悬停时下沉网格 + 高亮当前卡（Aceternity 列表卡）  */
/* ------------------------------------------------------------------ */
export function CardHoverEffect({ items, className }: {
  items: { title: string; description: string; icon?: ReactNode }[]
  className?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const on = useFx("cardMicro")
  return (
    <div className={cn("relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it, i) => (
        <div
          key={it.title}
          className={cn(
            "group relative rounded-xl border bg-card p-5 transition-all duration-300",
            on && hovered === i ? "border-transparent shadow-lg" : "border-border",
          )}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          {on && (
            <div
              className={cn(
                "pointer-events-none absolute inset-0 rounded-xl bg-[color:var(--accent)]/6 opacity-0 transition-opacity duration-300",
                hovered === i && "opacity-100",
              )}
              aria-hidden
            />
          )}
          <div className="relative z-10 space-y-1.5">
            {it.icon && <div className="mb-2 text-primary [&_svg]:size-5">{it.icon}</div>}
            <div className="text-sm font-semibold">{it.title}</div>
            <div className="text-xs leading-relaxed text-muted-foreground">{it.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
