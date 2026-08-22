import {
  useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type HTMLAttributes, type ReactNode,
} from "react"
import { lensBleed, lensMap, syncCssAnimations } from "../../lib/liquidGlass"
import { cn } from "../../lib/utils"

/**
 * 液态玻璃容器（Apple Liquid Glass 风格）。
 *
 * 架构（见 lib/liquidGlass.ts 头注）：玻璃内部渲染「背景镜像层」（backdrop 场景
 * 副本，与真实背景像素对齐），对其施加 SDF 透镜置换滤镜 → 边缘真实折射 + 色散；
 * 玻璃本体再用 backdrop-filter 磨砂 + ::after 镜面高光。
 *
 * - 传入 backdrop：完整液态玻璃（真折射，任何浏览器可用）
 * - 不传 backdrop：Tier-1 降级（磨砂 + 镜面高光，适合悬浮在任意内容之上）
 */
export interface LiquidGlassProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  /** 背景镜像层场景副本（需与玻璃背后真实内容对齐，如同一场景组件二次渲染） */
  backdrop?: ReactNode
  /** 圆角半径 px，默认 18 */
  radius?: number
  /** 折射强度，默认 46 */
  strength?: number
  /** 色散（RGB 三通道差分置换），默认 true */
  chromatic?: boolean
  /** 边缘斜面宽度 px；默认 min(w,h)*0.45 clamp 10..48 */
  bezel?: number
  /** 特效总开关（一般传 useFx("liquidGlass")），默认 true */
  enabled?: boolean
  /** 与哪个源元素同步 CSS 动画相位（镜像层里的极光/光斑副本不掉拍） */
  syncFrom?: React.RefObject<HTMLElement | null>
  /** React 19 ref 直通（快照折射需要读取玻璃矩形） */
  ref?: React.Ref<HTMLDivElement>
}

export function LiquidGlass({
  children,
  backdrop,
  radius = 18,
  strength = 46,
  chromatic = true,
  bezel,
  enabled = true,
  syncFrom,
  className,
  style,
  ref: extRef,
  ...rest
}: LiquidGlassProps) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const setRefs = (el: HTMLDivElement | null) => {
    innerRef.current = el
    if (typeof extRef === "function") extRef(el)
    else if (extRef) extRef.current = el
  }
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  // useId 含冒号（url(#:r1:) 非法），清洗为合法 id
  const id = "lg-" + useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const bleed = lensBleed(strength)
  const s = Math.max(8, Math.min(120, strength))

  useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.round(cr.width)
      const h = Math.round(cr.height)
      // 8px 容差：避免拖拽/亚像素抖动反复重建贴图
      setSize((prev) => (prev && Math.abs(prev.w - w) < 8 && Math.abs(prev.h - h) < 8 ? prev : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mapUrl = useMemo(
    () => (size ? lensMap({ width: size.w, height: size.h, radius, bezel, inset: bleed }) : null),
    [size, radius, bezel, bleed],
  )
  const refract = enabled && !!backdrop && !!mapUrl

  // 镜像层挂载后对齐源元素内同名 CSS 动画的相位
  useLayoutEffect(() => {
    if (!refract) return
    syncCssAnimations(syncFrom?.current ?? null, innerRef.current)
  }, [refract, syncFrom])

  return (
    <div
      ref={setRefs}
      className={cn("lg-glass", className)}
      style={{ borderRadius: radius, ...style }}
      {...rest}
    >
      {refract && mapUrl && (
        <>
          <svg className="lg-svg" aria-hidden="true" focusable="false">
            <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage
                href={mapUrl}
                xlinkHref={mapUrl}
                x="0" y="0" width="100%" height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              {chromatic ? (
                <>
                  {/* 色散：三通道用略不同的强度置换再 screen 混合，模拟折射率随波长变化 */}
                  <feDisplacementMap in="SourceGraphic" in2="map" scale={-s * 0.94} xChannelSelector="R" yChannelSelector="G" result="dr" />
                  <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
                  <feDisplacementMap in="SourceGraphic" in2="map" scale={-s} xChannelSelector="R" yChannelSelector="G" result="dg" />
                  <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
                  <feDisplacementMap in="SourceGraphic" in2="map" scale={-s * 1.06} xChannelSelector="R" yChannelSelector="G" result="db" />
                  <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
                  <feBlend in="cr" in2="cg" mode="screen" result="rg" />
                  <feBlend in="rg" in2="cb" mode="screen" />
                </>
              ) : (
                <feDisplacementMap in="SourceGraphic" in2="map" scale={-s} xChannelSelector="R" yChannelSelector="G" />
              )}
            </filter>
          </svg>
          {/* 背景镜像层：外扩 bleed 出血，透镜环落在玻璃边缘上 */}
          <div className="lg-clone" style={{ inset: -bleed, filter: `url(#${id})` }}>
            {backdrop}
          </div>
        </>
      )}
      <div className="lg-content">{children}</div>
    </div>
  )
}
