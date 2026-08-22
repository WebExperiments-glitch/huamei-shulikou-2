/**
 * ECharts 集中式注册表。
 *
 * 全局注册一次，所有页面/组件共享同一实例，避免各页面重复 import/use，
 * 同时确保 tree-shaking 生效（只打包用到的组件）。
 *
 * ECharts 6 使用 Apache-2.0 / AGPL 双许可，本项目的图表仅用于本地数据展示，
 * 非商业化使用 AGPL 可免费使用。如需商业分发，请购买 ECharts 商业授权。
 */
import { init, use, registerTheme, getInstanceByDom } from "echarts/core"
import type { ECharts } from "echarts/core"

// --- Charts ---
import { BarChart, LineChart, PieChart } from "echarts/charts"

// --- Components ---
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components"

// --- Renderers ---
import { CanvasRenderer } from "echarts/renderers"

// 全局注册一次
use([
  BarChart, LineChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent,
  TitleComponent, DataZoomComponent, MarkLineComponent,
  CanvasRenderer,
])

export { init, use, registerTheme, getInstanceByDom }
export type { ECharts }