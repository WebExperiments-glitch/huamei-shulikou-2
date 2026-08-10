import { useEffect, useRef } from "react"
import type { ChartSpec } from "../../lib/conversations"

export function ChartCard({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null)
  const tall =
    Array.isArray((spec.option as any)?.series)
      ? (spec.option as any).series.some((s: any) =>
          ["graph", "tree", "treemap", "sankey", "heatmap", "scatter", "radar"].includes(s?.type)
        )
      : false
  useEffect(() => {
    let chart: any
    let disposed = false
    import("echarts")
      .then((echarts) => {
        if (!ref.current || disposed) return
        chart = echarts.init(ref.current)
        chart.setOption(spec.option)
      })
      .catch(() => {})
    const onResize = () => chart?.resize()
    window.addEventListener("resize", onResize)
    return () => {
      disposed = true
      window.removeEventListener("resize", onResize)
      chart?.dispose()
    }
  }, [spec])
  return (
    <div className="agent-chart-card">
      {spec.title ? <div className="agent-chart-title">{spec.title}</div> : null}
      <div ref={ref} className={`agent-chart${tall ? " agent-chart-tall" : ""}`} />
    </div>
  )
}
