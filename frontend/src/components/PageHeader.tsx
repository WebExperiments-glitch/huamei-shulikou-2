import { useRef, type ReactNode } from "react"
import { cn } from "../lib/utils"
import { AnimatedBadge } from "./fx/magicui"
import { LiquidGlass } from "./fx/liquid-glass"
import { useContentMirror } from "../lib/contentMirror"
import { lensBleed } from "../lib/liquidGlass"
import { useFx } from "../lib/effects"

// 顶栏液态玻璃参数（strength=30 对应快照出血）
const TOPBAR_BLEED = lensBleed(30)

/**
 * 全站统一页头（新 UI 体系移植的范本）。
 * 沿用 .topbar 布局 CSS，叠加：LIVE 呼吸徽标 / 右侧操作区 /
 * 液态玻璃（快照镜像折射背后真实内容，移动端自动降级磨砂）。
 * 标题渐变由 index.css 的 .topbar h1 规则全局提供。
 */
export function PageHeader({
  crumb,
  title,
  desc,
  extra,
  live,
  className,
  style,
}: {
  crumb?: ReactNode
  title: ReactNode
  desc?: ReactNode
  /** 右侧信息 / 操作区 */
  extra?: ReactNode
  /** 呼吸 LIVE 徽标（cardMicro 门控，关闭后退化为静态徽标） */
  live?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const liquidOn = useFx("liquidGlass")
  const glassRef = useRef<HTMLDivElement>(null)
  const mirrorHost = useRef<HTMLDivElement>(null)
  // 真·内容折射：快照顶栏背后的页面（滚动停止后补截；hook 内排除顶栏自身）
  useContentMirror(mirrorHost, glassRef, liquidOn, TOPBAR_BLEED)

  return (
    <LiquidGlass
      ref={glassRef}
      className={cn("topbar", className)}
      radius={14}
      strength={30}
      enabled={liquidOn}
      backdrop={<div ref={mirrorHost} className="absolute inset-0" />}
      style={style}
    >
      <div>
        {crumb != null && <div className="crumb">{crumb}</div>}
        {/* LIVE 徽标放在 h1 外层：.topbar h1 的 background-clip:text 会让
            后代文字继承透明填充，徽标文字会被标题渐变污染 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1>{title}</h1>
          {live && (
            <AnimatedBadge className="text-[10px] font-semibold tracking-wider">LIVE</AnimatedBadge>
          )}
        </div>
        {desc != null && (
          <p className="muted" style={{ maxWidth: 780, marginTop: 4, marginBottom: 0 }}>
            {desc}
          </p>
        )}
      </div>
      {extra != null && <div style={{ fontSize: 13, color: "var(--text-faint)" }}>{extra}</div>}
    </LiquidGlass>
  )
}
