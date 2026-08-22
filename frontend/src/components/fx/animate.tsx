/**
 * Animate.css 封装（https://animate.style，MIT）
 * 提供 React 组件化用法，并接入项目 fx 门控 + prefers-reduced-motion：
 * 关闭对应开关或系统减动效时，直接静态渲染，不注入 animate__* 类。
 */
import { type ReactNode, type CSSProperties } from "react"
import { cn } from "../../lib/utils"
import { useFx, useEffects, type FxDensity } from "../../lib/effects"

export type AnimateName =
  | "fadeIn" | "fadeInUp" | "fadeInDown" | "fadeInLeft" | "fadeInRight"
  | "zoomIn" | "bounceIn" | "flipInX" | "flipInY" | "lightSpeedInLeft" | "rollIn"
  | "slideInUp" | "slideInDown" | "pulse" | "shake" | "headShake" | "rubberBand" | "jackInTheBox"
  | "heartBeat" | "swing" | "tada" | "wobble" | "jello"

const DENSITY_SPEED: Record<FxDensity, string> = {
  low: "0.8s",
  medium: "0.6s",
  high: "0.45s",
}

/** 一次性入场动画容器（animate__*；--animate-duration 由 fx 密度映射）。 */
export function AnimateIn({
  children,
  name = "fadeInUp",
  delay = 0,
  className,
  style,
  infinite = false,
  gate = "reveal",
}: {
  children: ReactNode
  name?: AnimateName
  delay?: number
  className?: string
  style?: CSSProperties
  infinite?: boolean
  gate?: Parameters<typeof useFx>[0]
}) {
  const on = useFx(gate)
  const density = useEffects((s) => s.density)
  const cls = on
    ? cn("animate__animated", `animate__${name}`, infinite && "animate__infinite")
    : undefined
  return (
    <div
      className={cn(className, cls)}
      style={{ ...style, ...(on ? { animationDelay: `${delay}ms`, ["--animate-duration" as string]: DENSITY_SPEED[density] } : null) }}
    >
      {children}
    </div>
  )
}

/** 预设徽标弹跳（榜单第 1 名等强调位）。 */
export function AnimateBadge({ children, className }: { children: ReactNode; className?: string }) {
  const on = useFx("dataAnim")
  return (
    <span className={cn(className, on && "animate__animated animate__bounceIn")}>{children}</span>
  )
}

/** 强调脉冲（用于「进行中 / 实时」等状态点）。 */
export function AnimatePulse({ children, className }: { children: ReactNode; className?: string }) {
  const on = useFx("dataAnim")
  return (
    <span className={cn(className, on && "animate__animated animate__pulse animate__infinite animate__slow")}>
      {children}
    </span>
  )
}
