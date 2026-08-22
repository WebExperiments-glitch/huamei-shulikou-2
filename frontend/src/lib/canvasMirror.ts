import { useEffect } from "react"

/**
 * 3D 可视化控制条的液态玻璃镜像：每帧把 WebGL canvas 中「玻璃背后区域
 * （含出血）」拷贝到玻璃内的 2D 镜像画布，供 SDF 透镜滤镜折射。
 *
 * 前提：R3F Canvas 需开启 preserveDrawingBuffer，否则 GL 缓冲跨任务读取为黑。
 * 小区域 GPU blit（约千像素宽），逐帧成本可忽略；页面隐藏时跳过。
 */
export function useCanvasMirror(
  /** 含 WebGL <canvas> 的容器 */
  sourceRef: React.RefObject<HTMLElement | null>,
  /** 玻璃内的 2D 镜像画布 */
  hostRef: React.RefObject<HTMLCanvasElement | null>,
  glassRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  bleed = 64,
): void {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const host = hostRef.current
      const glass = glassRef.current
      const gl = sourceRef.current?.querySelector("canvas")
      if (!host || !glass || !gl || document.hidden) return
      const g = glass.getBoundingClientRect()
      const c = gl.getBoundingClientRect()
      const w = Math.round(g.width + bleed * 2)
      const h = Math.round(g.height + bleed * 2)
      if (w < 2 || h < 2) return
      if (host.width !== w || host.height !== h) {
        host.width = w
        host.height = h
      }
      const ctx = host.getContext("2d")
      if (!ctx) return
      // WebGL 画布内部分辨率含 DPR，按显示矩形换算采样区域
      const kx = gl.width / Math.max(1, c.width)
      const ky = gl.height / Math.max(1, c.height)
      ctx.drawImage(
        gl,
        (g.left - c.left - bleed) * kx,
        (g.top - c.top - bleed) * ky,
        w * kx,
        h * ky,
        0,
        0,
        w,
        h,
      )
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [enabled, bleed, sourceRef, hostRef, glassRef])
}
