/**
 * Lottie 播放器（lottie-react v2，MIT）—— lottiefiles.com 生态接入。
 * v2 API：<Lottie src={url | object} loop autoplay />，组件自行加载。
 * - 装饰性动画默认挂 cardMicro 门控 + prefers-reduced-motion 降级
 * - 内置动画放 public/lottie/，新增文件后在 LottieName/LOTTA_PATHS 登记
 */
import type { CSSProperties } from "react"
import { Lottie } from "lottie-react"
import { cn } from "../../lib/utils"
import { useFx } from "../../lib/effects"

export type LottieName = "pulse-ring" | "equalizer" | "loading-dots"

export const LOTTA_PATHS: Record<LottieName, string> = {
  "pulse-ring": "/lottie/pulse-ring.json",
  equalizer: "/lottie/equalizer.json",
  "loading-dots": "/lottie/loading-dots.json",
}

export interface LottiePlayerProps {
  /** 内置动画名（public/lottie/ 下）或自定义路径/animationData */
  name?: LottieName
  src?: string | object
  /** 宽高（正方形） */
  size?: number
  className?: string
  style?: CSSProperties
  loop?: boolean | number
  autoplay?: boolean
  /** 装饰性动画在特效关闭时直接不渲染；非装饰（如加载态）保留但静止 */
  decorative?: boolean
  /** 特效门控键（默认 cardMicro） */
  gate?: Parameters<typeof useFx>[0]
}

export function LottiePlayer({
  name = "pulse-ring",
  src,
  size = 64,
  className,
  style,
  loop = true,
  autoplay = true,
  decorative = true,
  gate = "cardMicro",
}: LottiePlayerProps) {
  const on = useFx(gate)
  const source = src ?? LOTTA_PATHS[name]
  if (!on && decorative) return null
  return (
    <div
      className={cn("pointer-events-none select-none", className)}
      style={{ width: size, height: size, ...style }}
      aria-hidden
    >
      <Lottie src={source} loop={loop} autoplay={on ? autoplay : false} className="h-full w-full" />
    </div>
  )
}
