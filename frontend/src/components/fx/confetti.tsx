/**
 * ConfettiBurst —— 手写 canvas 彩带礼花（无第三方依赖）。
 * 触发方式：<ConfettiBurst trigger={n} />，n 变化（且 >0）时播放一次。
 * 门控：dataAnim 开关 + prefers-reduced-motion + 页面不可见时跳过。
 */
import { useEffect, useRef } from "react"
import { useFx } from "../../lib/effects"

const COLORS = ["#3b63d9", "#7b6bff", "#c2188c", "#a6790a", "#0e8a5f", "#d93848", "#0086d6"]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
  life: number
  shape: 0 | 1 // 0=矩形彩带 1=圆点
}

export function ConfettiBurst({
  trigger,
  origin = { x: 0.5, y: 0.18 },
  count = 90,
  spread = 420,
  duration = 1900,
}: {
  /** 变化即触发（>0）；受 dataAnim 门控 */
  trigger: number
  origin?: { x: number; y: number }
  count?: number
  spread?: number
  duration?: number
}) {
  const on = useFx("dataAnim")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!on || trigger <= 0 || document.hidden) return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    ctx.scale(dpr, dpr)

    const cx = window.innerWidth * origin.x
    const cy = window.innerHeight * origin.y
    const particles: Particle[] = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = spread * (0.35 + Math.random() * 0.65) / 1000
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35, // 略微向上偏置，更像礼花
        size: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0]!,
        life: 1,
        shape: Math.random() < 0.6 ? 0 : 1,
      }
    })

    const t0 = performance.now()
    const tick = (now: number) => {
      const elapsed = now - t0
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        p.life = Math.max(0, 1 - elapsed / duration)
        if (p.life <= 0) continue
        alive = true
        // 简化物理：重力 + 线性阻尼
        p.vy += 0.00055 * 16
        p.vx *= 0.995
        p.vy *= 0.995
        p.x += p.vx * 16
        p.y += p.vy * 16
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.shape === 0) {
          // 彩带翻转的视觉近似：宽度按 cos 呼吸
          ctx.fillRect((-p.size * Math.abs(Math.cos(p.rot * 3))) / 2, -p.size / 4, p.size * Math.max(0.25, Math.abs(Math.cos(p.rot * 3))), p.size / 2)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      if (alive && elapsed < duration + 200) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [trigger, on, origin.x, origin.y, count, spread, duration])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 300,
        display: on && trigger > 0 ? "block" : "none",
      }}
    />
  )
}
