import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import ParticlesBgGPU from "../lib/webgpu/ParticlesBgGPU"

/**
 * 全局动效层：
 * 1. 顶部滚动进度条（细强调色渐变线，随页面滚动填充）
 * 2. 卡片聚光灯光晕跟随光标（通过 CSS 变量 --mx/--my 驱动 .card/.ant-card 的 ::before）
 * 3. 粒子光效背景（可选）
 * 顶部进度条 / 光斑的开关门控在 CSS 中通过 <html> data-fx* 完成。
 */
export default function Effects() {
  const location = useLocation()
  const progressRef = useRef<HTMLDivElement>(null)

  // 路由切换后重置滚动进度（scaleX 合成器动画 + rAF 节流，移动端不掉帧）
  useEffect(() => {
    let raf = 0
    const apply = () => {
      raf = 0
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const p = max > 0 ? el.scrollTop / max : 0
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [location.pathname])

  // 卡片聚光灯：仅更新 CSS 变量，开销极低
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".card, .ant-card")
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty("--mx", `${e.clientX - r.left}px`)
      card.style.setProperty("--my", `${e.clientY - r.top}px`)
    }
    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [])

  return (
    <>
      <div className="glass-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <ParticlesBgGPU />
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
    </>
  )
}
