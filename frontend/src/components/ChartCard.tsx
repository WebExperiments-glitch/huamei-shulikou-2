import * as echarts from "echarts/core"
import { BarChart, LineChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { EChartsCoreOption } from "echarts/core"
import { useEChart } from "../hooks/useEChart"
import { ChartExport } from "./ChartExport"

echarts.use([
  BarChart, LineChart, GridComponent, TooltipComponent,
  LegendComponent, TitleComponent, DataZoomComponent, CanvasRenderer,
])

/** 通用图表卡片：内嵌 ECharts 实例 + PNG 导出按钮。option 由调用方按主题着色后传入。 */
export function ChartCard({
  title, option, filename, height = 320, badge,
}: {
  title: string
  option: EChartsCoreOption | null
  filename: string
  height?: number
  badge?: string
}) {
  const { setRef, getDataURL } = useEChart(option)
  return (
    <div className="card">
      <div className="card-title">
        {title}
        {badge && <span className="badge">{badge}</span>}
        <ChartExport getURL={getDataURL} filename={filename} />
      </div>
      <div ref={setRef} className="chart" style={{ height }} />
    </div>
  )
}
