import { Link } from "react-router-dom"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Empty, Spinner } from "../components/ui"
import { RankTable } from "../components/RankTable"
import { ChartCard } from "../components/ChartCard"
import { useTheme, getChartPalette } from "../lib/theme"

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["boards"],
    queryFn: api.boards,
  })

  if (isLoading) return <Spinner />
  if (error) return <Empty label={`后端连接失败: ${(error as Error).message}`} />
  const boards = data?.boards ?? []
  const weeklyQ = useQuery({ queryKey: ["issues", "weekly"], queryFn: () => api.boardIssues("weekly") })
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const trendOpt = useMemo(() => {
    const issues = [...(weeklyQ.data?.issues ?? [])].sort((a, b) =>
      a.issue.localeCompare(b.issue, undefined, { numeric: true }),
    )
    if (issues.length === 0) return null
    return {
      tooltip: { trigger: "axis", backgroundColor: pal.tooltipBg, borderColor: pal.tooltipBorder, textStyle: { color: pal.text } },
      grid: { left: 48, right: 20, top: 16, bottom: 36 },
      xAxis: {
        type: "category", data: issues.map((i) => i.issue),
        axisLabel: { color: pal.axis, fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "value", name: "上榜首数", nameTextStyle: { color: pal.axis, fontSize: 11 },
        axisLabel: { color: pal.axis }, splitLine: { lineStyle: { color: pal.split } },
      },
      series: [{
        type: "line", data: issues.map((i) => i.entries), smooth: true, symbolSize: 4,
        areaStyle: { color: "rgba(79,195,247,0.12)" },
        lineStyle: { color: "#4fc3f7", width: 2 }, itemStyle: { color: "#4fc3f7" },
      }],
    }
  }, [weeklyQ.data, pal])

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">VOCALOID CHART · huamei术力口</div>
          <h1>总览</h1>
        </div>
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        {boards.map((b) => (
          <Link to={b.type === "weekly" ? "/board/weekly" : b.type === "legend" ? "/board/legend" : "/board/annual"} key={b.type} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="stat" style={{ cursor: "pointer" }}>
              <div className="k">{b.label}</div>
              <div className="v">
                {b.issue_count}
                <small>期</small>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>
                最新 {b.latest?.issue ?? "—"} · {b.latest?.date ?? ""}
              </div>
            </div>
          </Link>
        ))}
        <Link to="/monthly" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="stat">
            <div className="k">月榜（聚合）</div>
            <div className="v">27<small>个月</small></div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 6 }}>周榜按自然月聚合</div>
          </div>
        </Link>
      </div>

      {trendOpt && (
        <ChartCard
          title="周榜规模趋势"
          option={trendOpt}
          filename="dashboard-weekly-trend"
          badge={`${weeklyQ.data?.issues.length ?? 0} 期`}
        />
      )}
      <LatestBoard type="weekly" title="最新·周榜 Top 20" to="/board/weekly" />
    </>
  )
}

function LatestBoard({ type, title, to }: { type: string; title: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["latest", type],
    queryFn: async () => {
      const boards = await api.boards()
      const latest = boards.boards.find((b) => b.type === type)?.latest
      if (!latest) return null
      return api.rankings(type, latest.issue, 20)
    },
  })

  return (
    <div className="card">
      <div className="card-title">
        {title}
        <Link to={to} style={{ marginLeft: "auto", fontSize: 12.5 }}>查看全部 →</Link>
      </div>
      {isLoading ? <Spinner /> : data ? <RankTable items={data.items} showStats /> : <Empty />}
    </div>
  )
}