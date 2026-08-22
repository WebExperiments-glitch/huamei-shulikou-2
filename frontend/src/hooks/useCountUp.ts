import { useEffect, useRef, useState } from "react"

/**
 * 数字滚动动画：从 0 平滑递增到 target（easeOutCubic）。
 * 组件挂载或 target 变化时自动重播，配合 AntD Statistic 使用。
 */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const cancel = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(Math.round(target * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    cancel()
    rafRef.current = requestAnimationFrame(tick)
    return cancel
  }, [target, duration])

  return value
}
