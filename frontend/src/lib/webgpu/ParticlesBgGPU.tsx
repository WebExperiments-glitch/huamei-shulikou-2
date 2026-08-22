import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import { useEffects } from "../effects"
import { useTheme } from "../theme"
import { ParticlesBg } from "../fx"
import { WEBGPU_OK, WaveTerrain, type TerrainDensity } from "./waveTerrain"

/**
 * GPU 粒子背景层（WebGPU）。
 *  - 支持 WebGPU 时：用 GPU 渲染「波动地形 + 粒子星云」背景；
 *  - 不支持 WebGPU 时：自动回退到原有 Canvas2D 轻量粒子；
 *  - 开关沿用「特效设置」里的「粒子光效背景」+ 总开关；
 *  - 遵循 prefers-reduced-motion，关闭或减弱动效时暂停并隐藏。
 */
export default function ParticlesBgGPU() {
  const on = useEffects((s) => s.master && s.particles)
  const density = useEffects((s) => s.density) as TerrainDensity
  const theme = useTheme((s) => s.theme)
  const reduced = useReducedMotion()
  const ref = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<WaveTerrain | null>(null)

  // 主题切换时刷新 GPU 配色
  useEffect(() => {
    engineRef.current?.updatePalette()
  }, [theme])

  // WebGPU 引擎生命周期：开关/密度/减弱动效变化时重建
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (!on || reduced) {
      canvas.style.opacity = "0"
      engineRef.current?.dispose()
      engineRef.current = null
      return
    }
    canvas.style.opacity = "1"
    let cancelled = false
    void WaveTerrain.create(canvas, density).then((engine) => {
      if (cancelled || !engine) return
      engineRef.current = engine
    })
    return () => {
      cancelled = true
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [on, reduced, density])

  // WebGPU 不可用：回退到原有 Canvas2D 粒子（保持开关与密度语义一致）
  if (!WEBGPU_OK) return <ParticlesBg />

  return (
    <canvas
      ref={ref}
      className="particles-bg"
      aria-hidden
      style={{ transition: "opacity .6s ease" }}
    />
  )
}
