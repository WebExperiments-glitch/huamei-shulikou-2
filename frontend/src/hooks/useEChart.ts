import { useCallback, useEffect, useRef, useState } from "react"
import * as echarts from "echarts/core"
import type { EChartsCoreOption } from "echarts/core"

export interface EChartHandle {
  /** 作为 ref 回调挂到图表容器 div 上 */
  setRef: (el: HTMLDivElement | null) => void
  /** 导出当前图表为 PNG（dataURL），未初始化返回 null */
  getDataURL: (backgroundColor?: string) => string | null
}

/**
 * 自动初始化/销毁 ECharts 实例。
 * 使用 callback ref + state，确保当容器在异步数据到达后才挂载时也能正确初始化，
 * 避免「组件先 return null / 条件渲染」导致 echarts.init 被跳过、图表空白的问题。
 */
export function useEChart(option: EChartsCoreOption | null | undefined): EChartHandle {
  const inst = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef<EChartsCoreOption | null | undefined>(option)
  optionRef.current = option
  const [node, setNode] = useState<HTMLDivElement | null>(null)

  const setRef = useCallback((el: HTMLDivElement | null) => {
    setNode(el)
  }, [])

  // 容器挂载/卸载时初始化与销毁
  useEffect(() => {
    if (!node) return
    const chart = echarts.init(node)
    inst.current = chart
    const resize = () => chart?.resize()
    window.addEventListener("resize", resize)
    if (optionRef.current) chart.setOption(optionRef.current, true)
    return () => {
      window.removeEventListener("resize", resize)
      chart?.dispose()
      inst.current = null
    }
  }, [node])

  // 选项变化时刷新
  useEffect(() => {
    if (inst.current && option) inst.current.setOption(option, true)
  }, [option])

  const getDataURL = useCallback((backgroundColor?: string) => {
    if (!inst.current) return null
    const bg =
      backgroundColor ??
      (document.documentElement.getAttribute("data-theme") === "dark" ? "#0c1422" : "#ffffff")
    try {
      return inst.current.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg })
    } catch {
      return null
    }
  }, [])

  return { setRef, getDataURL }
}
