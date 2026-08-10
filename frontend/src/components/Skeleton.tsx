import type { CSSProperties } from "react"

/** 基础骨架条。 */
export function Skeleton({
  width = "100%",
  height = 12,
  radius = 6,
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number
  style?: CSSProperties
}) {
  return <span className="sk" style={{ width, height, borderRadius: radius, ...style }} />
}

/** 表格骨架（rows 行 × cols 列）。 */
export function SkeletonTable({ rows = 10, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk-table" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="sk-row" key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={13} width={j === 1 ? "90%" : j === 0 ? 20 : "60%"} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 卡片骨架（标题 + 若干行）。 */
export function SkeletonCard({ lines = 4 }: { lines?: number }) {
  return (
    <div className="sk-card" aria-hidden>
      <Skeleton height={18} width="55%" />
      <div style={{ height: 10 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={`${90 - i * 8}%`} />
      ))}
    </div>
  )
}

/** 图表占位骨架。 */
export function SkeletonChart({ height = 300 }: { height?: number }) {
  return <Skeleton width="100%" height={height} radius={12} />
}
