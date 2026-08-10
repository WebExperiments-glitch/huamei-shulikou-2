import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { ChipRow, Spinner, fmt, fmtScore } from "../components/ui"
import { ChartCard } from "../components/ChartCard"
import { useTheme, getChartPalette } from "../lib/theme"

export default function DailyBoard() {
  const [issue, setIssue] = useState("")
  const issuesQ = useQuery({ queryKey: ["daily-issues"], queryFn: api.dailyIssues })
  const issues = issuesQ.data ?? []
  const effective = issue || issues[0]?.issue || ""
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const rankQ = useQuery({
    queryKey: ["daily-rank", effective],
    queryFn: () => api.dailyRankings(effective, 100),
    enabled: !!effective,
  })
  const dailyBarOpt = useMemo(() => {
    const items = rankQ.data?.items ?? []
    if (items.length === 0) return null
    const top = [...items].slice(0, 12).reverse()
    const names = top.map((i) => i.name)
    const mk = (key: string, name: string, color: string) => ({
      name, type: "bar", stack: "total",
      data: top.map((i) => (i as unknown as Record<string, number>)[key]),
      itemStyle: { color }, emphasis: { focus: "series" },
    })
    return {
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow" },
        backgroundColor: pal.tooltipBg, borderColor: pal.tooltipBorder, textStyle: { color: pal.text },
      },
      legend: { data: ["播放", "收藏", "硬币", "分享", "点赞"], textStyle: { color: pal.axis }, top: 0 },
      grid: { left: 90, right: 20, top: 36, bottom: 10 },
      xAxis: {
        type: "value",
        axisLabel: { color: pal.axis, formatter: (v: number) => (v >= 1e4 ? (v / 1e4).toFixed(0) + "万" : String(v)) },
        splitLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "category", data: names,
        axisLabel: { color: pal.axis, fontSize: 11 },
        axisLine: { lineStyle: { color: pal.split } }, axisTick: { show: false },
      },
      series: [
        mk("view", "播放", "#4fc3f7"),
        mk("favorite", "收藏", "#ffd166"),
        mk("coin", "硬币", "#ff6fd8"),
        mk("share", "分享", "#7b6bff"),
        mk("like", "点赞", "#0f9d6b"),
      ],
    }
  }, [rankQ.data, pal])

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">榜单 · 自建快照</div>
          <h1>日榜（快照）</h1>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          数据来自本地周快照（snapshots.csv）· 近似评分
          <br />
          score = like + 收藏×5 + 硬币×5 + 分享×2
        </div>
      </div>
      {issuesQ.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ChipRow issues={issues} value={effective} onChange={setIssue} />
          {dailyBarOpt && (
            <ChartCard
              title="当日各指标 Top 12（堆叠）"
              option={dailyBarOpt}
              filename={`daily-${effective}`}
              badge={`${rankQ.data?.items.length ?? 0} 首`}
            />
          )}
          {rankQ.isLoading ? (
            <Spinner />
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <div className="card-title">
                {effective.slice(0, 4)}-{effective.slice(4, 6)}-{effective.slice(6)} 快照
                <span className="badge">{rankQ.data?.items.length ?? 0} 首</span>
              </div>
              <table className="rank-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>歌曲</th>
                    <th className="num-th">播放</th>
                    <th className="num-th">收藏</th>
                    <th className="num-th">硬币</th>
                    <th className="num-th">分享</th>
                    <th className="num-th">点赞</th>
                    <th style={{ width: 84, textAlign: "right" }}>得分</th>
                  </tr>
                </thead>
                <tbody>
                  {(rankQ.data?.items ?? []).map((it) => (
                    <tr key={it.bvid} className={it.rank <= 3 ? `rank-${it.rank}` : ""}>
                      <td className="rank-no">{it.rank}</td>
                      <td className="song-cell">
                        <span className="t">{it.name}</span>
                      </td>
                      <td className="num">{fmt(it.view)}</td>
                      <td className="num">{fmt(it.favorite)}</td>
                      <td className="num">{fmt(it.coin)}</td>
                      <td className="num">{fmt(it.share)}</td>
                      <td className="num">{fmt(it.like)}</td>
                      <td className="score-cell">{fmtScore(it.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
