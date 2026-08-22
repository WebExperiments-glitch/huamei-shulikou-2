import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Empty } from "../components/ui"
import { ChartExport } from "../components/ChartExport"
import { SkeletonTable } from "../components/Skeleton"
import { useEChart } from "../hooks/useEChart"
import { useTheme, getChartPalette, type ChartPalette } from "../lib/theme"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

const BAR_COLOR = "#4fc3f7"

function horizontalBar(names: string[], values: number[], pal: ChartPalette, color = BAR_COLOR) {
  return {
    grid: { left: 96, right: 28, top: 8, bottom: 8 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: pal.tooltipBg,
      borderColor: pal.tooltipBorder,
      textStyle: { color: pal.text },
    },
    xAxis: {
      type: "value",
      axisLabel: { color: pal.axis },
      splitLine: { lineStyle: { color: pal.split } },
    },
    yAxis: {
      type: "category",
      data: names,
      axisLabel: { color: pal.axis, fontSize: 11 },
      axisLine: { lineStyle: { color: pal.split } },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: values,
        barWidth: "62%",
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
      },
    ],
  }
}

export default function Analytics() {
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const artistsQ = useQuery({ queryKey: ["stats-artists"], queryFn: () => api.artists(100) })
  const vocalistsQ = useQuery({ queryKey: ["stats-vocalists"], queryFn: () => api.vocalists(100) })
  const weeklyQ = useQuery({ queryKey: ["issues", "weekly"], queryFn: () => api.boardIssues("weekly") })
  const monthlyQ = useQuery({ queryKey: ["month-issues"], queryFn: api.monthIssues })
  const facetsQ = useQuery({ queryKey: ["song-facets"], queryFn: api.songFacets })
  const latest = weeklyQ.data?.issues?.[0]?.issue
  const latestQ = useQuery({
    queryKey: ["rankings", "weekly", latest],
    queryFn: () => api.rankings("weekly", latest!, 20),
    enabled: !!latest,
  })

  const artistOpt = useMemo(() => {
    const items = [...(artistsQ.data?.items ?? [])].sort((a, b) => b.songs - a.songs).slice(0, 15).reverse()
    return horizontalBar(items.map((it) => it.name), items.map((it) => it.songs), pal, "#4fc3f7")
  }, [artistsQ.data, pal])

  const vocalistOpt = useMemo(() => {
    const items = [...(vocalistsQ.data?.items ?? [])].sort((a, b) => b.songs - a.songs).slice(0, 15).reverse()
    return horizontalBar(items.map((it) => it.name), items.map((it) => it.songs), pal, "#ff6fd8")
  }, [vocalistsQ.data, pal])

  const trendOpt = useMemo(() => {
    const issues = [...(weeklyQ.data?.issues ?? [])].sort((a, b) =>
      a.issue.localeCompare(b.issue, undefined, { numeric: true }),
    )
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        textStyle: { color: pal.text },
      },
      grid: { left: 48, right: 20, top: 16, bottom: 36 },
      xAxis: {
        type: "category",
        data: issues.map((i) => i.issue),
        axisLabel: { color: pal.axis, fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "value",
        name: "上榜首数",
        nameTextStyle: { color: pal.axis, fontSize: 11 },
        axisLabel: { color: pal.axis },
        splitLine: { lineStyle: { color: pal.split } },
      },
      series: [
        {
          type: "line",
          data: issues.map((i) => i.entries),
          smooth: true,
          symbolSize: 4,
          areaStyle: { color: "rgba(79,195,247,0.12)" },
          lineStyle: { color: "#4fc3f7", width: 2 },
          itemStyle: { color: "#4fc3f7" },
        },
      ],
    }
  }, [weeklyQ.data, pal])

  // 曲库分档分布（环形图）
  const tierOpt = useMemo(() => {
    const t = facetsQ.data?.tiers
    if (!t) return null
    return {
      tooltip: {
        trigger: "item",
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        textStyle: { color: pal.text },
        formatter: "{b}: {c} 首 ({d}%)",
      },
      legend: { bottom: 0, textStyle: { color: pal.axis, fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "46%"],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: pal.split, borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontWeight: "bold", color: pal.text } },
          data: [
            { name: "神话曲", value: t.myth, itemStyle: { color: "#b56bff" } },
            { name: "传说曲", value: t.legend, itemStyle: { color: "#ffd166" } },
            { name: "殿堂曲", value: t.hall, itemStyle: { color: "#4fc3f7" } },
            { name: "未达标", value: t.none, itemStyle: { color: "#5b7188" } },
          ],
        },
      ],
    }
  }, [facetsQ.data, pal])

  // 最新一期 Top 10 歌曲指标（对数轴，突出数量级差异）
  const topMetricOpt = useMemo(() => {
    const items = latestQ.data?.items ?? []
    if (!items.length) return null
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        textStyle: { color: pal.text },
      },
      legend: { top: 0, textStyle: { color: pal.axis, fontSize: 11 }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 48, right: 20, top: 34, bottom: 46 },
      xAxis: {
        type: "category",
        data: items.slice(0, 10).map((it) => it.title.slice(0, 8)),
        axisLabel: { color: pal.axis, fontSize: 10, rotate: 35 },
        axisLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "log",
        name: "指标（对数）",
        nameTextStyle: { color: pal.axis, fontSize: 10 },
        axisLabel: { color: pal.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: pal.split } },
      },
      series: [
        { name: "播放", type: "bar", data: items.slice(0, 10).map((it) => it.view ?? 0), itemStyle: { color: "#4fc3f7" } },
        { name: "点赞", type: "bar", data: items.slice(0, 10).map((it) => it.like ?? 0), itemStyle: { color: "#ffd166" } },
        { name: "硬币", type: "bar", data: items.slice(0, 10).map((it) => it.coin ?? 0), itemStyle: { color: "#ff2ea6" } },
      ],
    }
  }, [latestQ.data, pal])

  if (artistsQ.isLoading || weeklyQ.isLoading)
    return <div className="card" style={{ padding: 20 }}><SkeletonTable rows={12} /></div>

  const stats = [
    { k: "周榜期数", v: weeklyQ.data?.issues.length ?? 0 },
    { k: "月榜月数", v: monthlyQ.data?.issues.length ?? 0 },
    { k: "统计 P主", v: artistsQ.data?.items.length ?? 0 },
    { k: "统计歌姬", v: vocalistsQ.data?.items.length ?? 0 },
  ]

  return (
    <>
      <Reveal>
        <PageHeader crumb="分析 · 数据洞察" title="数据分析" />
      </Reveal>

      <StaggerGroup className="stat-row" style={{ marginBottom: 16 }}>
        {stats.map((s) => (
          <StaggerItem key={s.k}>
            <div className="stat">
              <div className="k">{s.k}</div>
              <div className="v">{s.v}<small>项</small></div>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <StaggerGroup className="grid-2">
        <StaggerItem>
          <div className="card">
            <div className="card-title">热门 P主 Top 15 <span className="badge">按上榜歌曲数</span></div>
            {artistOpt ? <EChart option={artistOpt} filename="analytics-artists-top15" /> : <Empty />}
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card">
            <div className="card-title">热门歌姬 Top 15 <span className="badge">按上榜歌曲数</span></div>
            {vocalistOpt ? <EChart option={vocalistOpt} filename="analytics-vocalists-top15" /> : <Empty />}
          </div>
        </StaggerItem>
      </StaggerGroup>

      <Reveal>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">周榜规模趋势 <span className="badge">每期上榜首数</span></div>
          {trendOpt ? <EChart option={trendOpt} height={300} filename="analytics-weekly-trend" /> : <Empty />}
        </div>
      </Reveal>

      <StaggerGroup className="grid-2" style={{ marginTop: 16 }}>
        <StaggerItem>
          <div className="card">
            <div className="card-title">曲库分档分布 <span className="badge">神话 / 传说 / 殿堂</span></div>
            {tierOpt ? <EChart option={tierOpt} height={300} filename="analytics-tier-donut" /> : <Empty />}
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="card">
            <div className="card-title">最新一期 Top 10 指标 <span className="badge">对数轴</span></div>
            {topMetricOpt ? <EChart option={topMetricOpt} height={300} filename="analytics-top-metrics" /> : <Empty />}
          </div>
        </StaggerItem>
      </StaggerGroup>
    </>
  )
}

function EChart({ option, height = 320, filename }: { option: object | null; height?: number; filename?: string }) {
  const ref = useEChart(option as never)
  return (
    <div style={{ position: "relative" }}>
      {filename && (
        <div style={{ position: "absolute", top: 0, right: 0, zIndex: 2 }}>
          <ChartExport getURL={ref.getDataURL} filename={filename} />
        </div>
      )}
      <div ref={ref.setRef} className="chart" style={{ height }} />
    </div>
  )
}
