/**
 * React Bits 风格组件移植（https://reactbits.dev）
 * 改写要点：motion/react、fx 门控、语义 token。
 * （项目已有的 TiltCard / 打字机 / 数字滚动在 lib/fx.tsx，此处补充文本拆分类动画。）
 */
import { useRef, type ReactNode } from "react"
import { motion, useInView, useSpring } from "motion/react"
import { cn } from "../../lib/utils"
import { useFx } from "../../lib/effects"

/* ------------------------------------------------------------------ */
/* Split Text —— 逐字符弹入（React Bits 招牌文本动画）                    */
/* ------------------------------------------------------------------ */
export function SplitText({
  text,
  className,
  delay = 60,
  staggerFrom = "start",
  once = true,
}: {
  text: string
  className?: string
  delay?: number
  staggerFrom?: "start" | "center" | "end" | "last"
  once?: boolean
}) {
  const on = useFx("textAnim")
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once, margin: "-30px" })
  const chars = Array.from(text)

  // staggerFrom：决定每个字符的入场延迟中心
  const centerIndex =
    staggerFrom === "center" ? Math.floor(chars.length / 2)
    : staggerFrom === "end" ? chars.length - 1
    : staggerFrom === "last" ? chars.length - 1
    : 0

  return (
    <span ref={ref} className={cn("inline-block", className)} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block will-change-transform"
          initial={on ? { opacity: 0, y: "0.35em", rotateX: -60 } : false}
          animate={inView && on ? { opacity: 1, y: 0, rotateX: 0 } : undefined}
          transition={{ duration: 0.45, delay: (Math.abs(i - centerIndex) * delay) / 1000, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {c === " " ? "\u00A0" : c}
        </motion.span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Blur Text —— 逐词模糊浮现                                             */
/* ------------------------------------------------------------------ */
export function BlurText({
  text,
  className,
  delay = 90,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const on = useFx("textAnim")
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-30px" })
  const words = text.split(" ")
  return (
    <span ref={ref} className={cn("inline", className)}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block will-change-transform"
          initial={on ? { opacity: 0, filter: "blur(10px)", y: 6 } : false}
          animate={inView && on ? { opacity: 1, filter: "blur(0px)", y: 0 } : undefined}
          transition={{ duration: 0.5, delay: (i * delay) / 1000, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {w}
          {i < words.length - 1 ? "\u00A0" : ""}
        </motion.span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Magnetic —— 磁吸容器（React Bits）：子元素向光标轻微吸附，离开回弹      */
/* ------------------------------------------------------------------ */
export function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode
  /** 吸附强度 0~1：偏移 = 中心距 × strength */
  strength?: number
  className?: string
}) {
  const on = useFx("cardMicro")
  const x = useSpring(0, { stiffness: 180, damping: 14, mass: 0.25 })
  const y = useSpring(0, { stiffness: 180, damping: 14, mass: 0.25 })

  if (!on) return <div className={cn("inline-block", className)}>{children}</div>

  return (
    <motion.div
      className={cn("inline-block", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        // 触摸设备不磁吸：手指拖经按钮时不应产生位移（滚动干扰）
        if (e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * strength)
        y.set((e.clientY - (r.top + r.height / 2)) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Marquee —— 无限跑马灯（React Bits 横向版）：内容复制一份做无缝循环      */
/* ------------------------------------------------------------------ */
export function Marquee({
  children,
  reverse = false,
  pauseOnHover = true,
  duration = 28,
  className,
  trackClassName,
}: {
  children: ReactNode
  reverse?: boolean
  pauseOnHover?: boolean
  /** 一圈的秒数（内容越多应越慢） */
  duration?: number
  className?: string
  trackClassName?: string
}) {
  const on = useFx("dataAnim")
  return (
    <div
      className={cn(
        "group relative flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className,
      )}
    >
      <div
        className={cn("fx-marquee-track flex w-max shrink-0 items-center gap-8 pr-8", trackClassName)}
        style={
          on
            ? {
                animation: `${reverse ? "rbts-marquee-rev" : "rbts-marquee"} ${duration}s linear infinite`,
                ...(pauseOnHover ? { animationPlayState: undefined } : null),
              }
            : undefined
        }
        onMouseEnter={on && pauseOnHover ? (e) => { e.currentTarget.style.animationPlayState = "paused" } : undefined}
        onMouseLeave={on && pauseOnHover ? (e) => { e.currentTarget.style.animationPlayState = "running" } : undefined}
      >
        {children}
        {on && children /* 无缝循环需要双份内容；关闭动画时只渲染一份 */}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Wavy Text —— 波浪文字（React Bits）：字符按正弦上下起伏（textAnim 门控）*/
/* ------------------------------------------------------------------ */
export function WavyText({
  text,
  className,
  amplitude = 4,
  speed = 2.2,
  delayStep = 0.07,
}: {
  text: string
  className?: string
  amplitude?: number
  /** 一个完整波形周期（秒） */
  speed?: number
  delayStep?: number
}) {
  const on = useFx("textAnim")
  const chars = Array.from(text)
  return (
    <span className={cn("inline-block", className)} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          animate={
            on
              ? { y: [0, -amplitude, 0] }
              : undefined
          }
          transition={
            on
              ? { duration: speed, repeat: Infinity, ease: "easeInOut", delay: i * delayStep }
              : undefined
          }
        >
          {c === " " ? "\u00A0" : c}
        </motion.span>
      ))}
    </span>
  )
}
export function GradientText({
  children,
  className,
  colors = ["#3b63d9", "#7b6bff 45%", "#c2188c"],
  angle = 90,
}: {
  children: ReactNode
  className?: string
  colors?: string[]
  angle?: number
}) {
  return (
    <span
      className={cn("inline bg-clip-text text-transparent", className)}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${colors.join(", ")})` }}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* SpotlightWrapper —— React Bits「spotlight-card」鼠标跟随高光            */
/* （与 aceternity.tsx 的 SpotlightCard 同源，这里提供带边框泛光变体）     */
/* ------------------------------------------------------------------ */
export function GlowingCard({ children, className }: { children: ReactNode; className?: string }) {
  const on = useFx("cardMicro")
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-300",
        on && "hover:border-[color:var(--accent)]/45 hover:shadow-[0_0_28px_-8px_var(--accent)]",
        className,
      )}
    >
      {children}
    </div>
  )
}
