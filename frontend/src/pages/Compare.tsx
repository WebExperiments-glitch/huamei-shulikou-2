import { useMemo, useState } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import * as echarts from "echarts/core"
import { LineChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { X, Plus, Search } from "lucide-react"
import { api } from "../lib/api"
import { useDebounce } from "../hooks/useDebounce"
import { useEChart } from "../hooks/useEChart"
import { ChartExport } from "../components/ChartExport"
import { Empty, Spinner, fmtDate } from "../components/ui"
import { useTheme, getChartPalette } from "../lib/theme"
import type { RankEntry, Song } from "../lib/types"

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const COLORS = ["#4fc3f7", "#ffd166", "#ff6fd8", "#66e39f", "#ff6b6b", "#7b6bff"]
const MAX = 5

type Metric = "rank" | "score"

export default function Compare() {
  const [selected, setSelected] = useState<Song[]>([])
  const [query, setQuery] = useState("")
  const [metric, setMetric] = useState<Metric>("rank")
  const debounced = useDebounce(query, 220)
  const { theme } = useTheme()
  const p = getChartPalette(theme)

  const { data: search } = useQuery({
    queryKey: ["compare-search", debounced],
    queryFn: () => api.searchSongs({ q: debounced, limit: 8 }),
    enabled: debounced.trim().length > 0,
  })

  const histories = useQueries({
    queries: selected.map((s) => ({
      queryKey: ["compare-history", s.bvid],
      queryFn: () => api.allHistory(s.bvid),
    })),
  })

  const series = useMemo(() => {
    const set = new Set<string>()
    selected.forEach((_, i) => {
      ;(histories[i]?.data?.histories.weekly ?? []).forEach((w: RankEntry) => w.issue && set.add(w.issue))
    })
    const issues = Array.from(set).sort()
    return { issues, series: selected.map((s, i) => {
      const weekly = (histories[i]?.data?.histories.weekly ?? []) as RankEntry[]
      const map = new Map(weekly.map((w) => [w.issue as string, metric === "rank" ? w.rank : w.score]))
      const color = COLORS[i % COLORS.length]
      return {
        name: s.title,
        type: "line" as const,
        smooth: true,
        symbolSize: 5,
        connectNulls: true,
        itemStyle: { color },
        lineStyle: { color, width: 2 },
        data: issues.map((iss) => map.get(iss) ?? null),
      }
    }) }
  }, [selected, histories, metric])

  const option = useMemo(() => {
    if (series.issues.length === 0 || series.series.length === 0) return null
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: p.tooltipBg,
        borderColor: p.tooltipBorder,
        textStyle: { color: p.text },
      },
      legend: { data: selected.map((s) => s.title), textStyle: { color: p.text }, top: 0 },
      grid: { left: 48, right: 24, top: 40, bottom: 40 },
      xAxis: {
        type: "category",
        data: series.issues,
        axisLabel: { color: p.axis, rotate: 40, fontSize: 10 },
        axisLine: { lineStyle: { color: p.split } },
      },
      yAxis: {
        type: "value",
        inverse: metric === "rank",
        min: metric === "rank" ? 1 : undefined,
        axisLabel: {
          color: p.axis,
          formatter: (v: number) => (metric === "rank" ? `#${v}` : v >= 1e4 ? (v / 1e4).toFixed(0) + "万" : String(v)),
        },
        splitLine: { lineStyle: { color: p.split } },
      },
      series: series.series,
    }
  }, [series, selected, metric, p])

  const chartRef = useEChart(option)

  const add = (s: Song) => {
    if (selected.find((x) => x.bvid === s.bvid) || selected.length >= MAX) return
    setSelected((prev) => [...prev, s])
    setQuery("")
  }
  const remove = (bvid: string) => setSelected((prev) => prev.filter((s) => s.bvid !== bvid))

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">分析 · 多歌曲对比</div>
          <h1>歌曲对比</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`chip${metric === "rank" ? " active" : ""}`} onClick={() => setMetric("rank")}>排名轨迹</button>
          <button className={`chip${metric === "score" ? " active" : ""}`} onClick={() => setMetric("score")}>得分轨迹</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="searchbox">
          <Search size={16} style={{ color: "var(--text-faint)" }} />
          <input
            type="text"
            placeholder={`搜索并添加歌曲（最多 ${MAX} 首）`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query.trim() && (
          <div className="compare-results">
            {(search?.items ?? []).map((s) => (
              <button key={s.bvid} className="compare-result" onClick={() => add(s)} disabled={selected.length >= MAX}>
                <Plus size={13} />
                <span className="t">{s.title}</span>
                <span className="meta">{s.producers?.map((p) => p.name).join("/") || s.bvid}</span>
              </button>
            ))}
          </div>
        )}
        <div className="pills" style={{ marginTop: query.trim() ? 10 : 0 }}>
          {selected.length === 0 && <span style={{ color: "var(--text-faint)", fontSize: 12.5 }}>尚未选择歌曲，先在上方搜索添加。</span>}
          {selected.map((s) => (
            <span className="pill" key={s.bvid}>
              <b>{s.title}</b>
              <button className="pill-x" onClick={() => remove(s.bvid)}><X size={11} /></button>
            </span>
          ))}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="card"><Empty label="选择 2 首及以上歌曲即可叠加对比走势" /></div>
      ) : histories.some((h) => h.isLoading) ? (
        <div className="card"><Spinner /></div>
      ) : option ? (
        <div className="card">
          <div className="card-title">
            {metric === "rank" ? "排名轨迹对比" : "得分轨迹对比"}
            <span className="badge">{selected.length} 首</span>
            <ChartExport getURL={chartRef.getDataURL} filename="compare-tracks" />
          </div>
          <div ref={chartRef.setRef} className="chart" style={{ height: 420 }} />
        </div>
      ) : (
        <div className="card"><Empty label="所选歌曲暂无周榜历史数据" /></div>
      )}

      {selected.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title">明细</div>
          <table className="rank-table">
            <thead>
              <tr>
                <th>歌曲</th>
                <th className="num-th">投稿日期</th>
                <th className="num-th">周榜上榜</th>
                <th className="num-th">最佳排名</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((s) => (
                <tr key={s.bvid}>
                  <td className="song-cell"><span className="t">{s.title}</span></td>
                  <td className="num">{fmtDate(s.pubtime)}</td>
                  <td className="num">{s.weeks_on_board ?? "—"}</td>
                  <td className="num">{s.best_rank ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
