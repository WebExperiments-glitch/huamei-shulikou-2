import { useEffect } from "react"
import { toCanvas } from "html-to-image"

// 同一时刻只允许一次整页快照：多个玻璃（顶栏 + 播放条）共享滚动事件，
// 避免并发触发重复的全页光栅化
let inflight = 0

/**
 * 「真·内容折射」：玻璃背后的任意滚动内容无法用 CSS 镜像，
 * 用 html-to-image 把 <main> 截成快照贴到镜像层，透镜滤镜折射真实页面像素。
 *
 * 策略：挂载即截一次；滚动 / 缩放停止 260ms 后补截（滚动期间沿用上一帧，
 * 镜像上层有磨砂，滞后基本不可辨）。pixelRatio 0.5 + skipFonts 压缩成本；
 * 截图失败静默降级为普通磨砂玻璃。
 */
export function useContentMirror(
  hostRef: React.RefObject<HTMLDivElement | null>,
  glassRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  bleed = 64,
): void {
  useEffect(() => {
    if (!enabled) return
    // 移动端性能保底：快照整页光栅化对手机 CPU/GPU 冲击大，触摸设备与窄屏直接跳过
    if (typeof matchMedia === "function") {
      if (matchMedia("(pointer: coarse)").matches || window.innerWidth < 768) return
    }
    let timer: number | undefined
    let busy = false
    let stopped = false
    const SCALE = 0.5

    const capture = async () => {
      const host = hostRef.current
      const glass = glassRef.current
      // 镜像层由 LiquidGlass 的 ResizeObserver 异步挂载：首跑时可能尚未存在，
      // 未就绪则延时重试（260ms），直到 host/glass 就位
      if (!host || !glass) {
        schedule()
        return
      }
      if (busy || document.hidden) return
      if (inflight > 0) {
        schedule()
        return
      }
      const main = document.querySelector("main")
      if (!main || !main.textContent) return
      busy = true
      inflight++
      try {
        const canvas = await toCanvas(main, {
          skipFonts: true,
          pixelRatio: SCALE,
          // 排除玻璃自身（避免递归入镜）、滚动条与跨域图片
          // （QQ音乐封面等 CDN 无 CORS 头，内联 fetch 会抛错导致整次快照失败）
          filter: (n) => {
            if (
              n instanceof HTMLElement &&
              (n.closest(".npl-bar") || n.closest(".topbar") || n.closest(".scroll-progress"))
            ) {
              return false
            }
            if (n instanceof HTMLImageElement) {
              try {
                return new URL(n.currentSrc || n.src, location.href).origin === location.origin
              } catch {
                return false
              }
            }
            return true
          },
        })
        if (stopped) return
        // 裁出玻璃背后区域（含出血）；getBoundingClientRect 相减即页面坐标（含滚动）
        const g = glass.getBoundingClientRect()
        const m = main.getBoundingClientRect()
        const sx = Math.max(0, (g.left - m.left - bleed) * SCALE)
        const sy = Math.max(0, (g.top - m.top - bleed) * SCALE)
        const sw = Math.min(canvas.width - sx, (g.width + bleed * 2) * SCALE)
        const sh = Math.min(canvas.height - sy, (g.height + bleed * 2) * SCALE)
        if (sw <= 1 || sh <= 1) return
        const out = document.createElement("canvas")
        out.width = Math.round(sw)
        out.height = Math.round(sh)
        const ctx = out.getContext("2d")
        if (!ctx) return
        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
        host.style.background = `url(${out.toDataURL("image/png")}) no-repeat`
        host.style.backgroundSize = "100% 100%"
      } catch {
        /* 静默：镜像层留空，玻璃退回磨砂 */
      } finally {
        busy = false
        inflight--
      }
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(capture, 260)
    }
    capture()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    const onVis = () => {
      if (!document.hidden) schedule()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [enabled, bleed, hostRef, glassRef])
}
