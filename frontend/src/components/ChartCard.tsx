import type { EChartsCoreOption } from "echarts/core"
import { useEChart } from "../hooks/useEChart"
import { ChartExport } from "./ChartExport"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"

/**
 * 通用图表卡片：shadcn Card 容器 + 内嵌 ECharts 实例 + PNG 导出按钮。
 * option 由调用方按主题着色后传入（token 桥接后自动跟随明暗主题）。
 */
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
    <Card className="gap-3 py-4 transition-shadow duration-300 hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <CardTitle className="truncate text-[14px]">{title}</CardTitle>
          {badge && <Badge variant="secondary" className="shrink-0 text-[10.5px]">{badge}</Badge>}
        </div>
        <ChartExport getURL={getDataURL} filename={filename} />
      </CardHeader>
      <CardContent className="px-4">
        <div ref={setRef} className="chart" style={{ height }} />
      </CardContent>
    </Card>
  )
}
