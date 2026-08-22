import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { ChipRow, Spinner, fmtScore } from "../components/ui"
import { ChartCard } from "../components/ChartCard"
import { PageHeader } from "../components/PageHeader"
import { useTheme, getChartPalette } from "../lib/theme"
import { Reveal } from "../lib/motion"

export default function MonthlyBoard() {
  const [issue, setIssue] = useState<string>("")
  const issuesQ = useQuery({ queryKey: ["month-issues"], queryFn: api.monthIssues })
  const effective = issue || issuesQ.data?.issues[0]?.issue || ""
  const rankQ = useQuery({
    queryKey: ["month-rank", effective],
    queryFn: () => api.MonthRanks(effective, 100),
    enabled: !!effective,
  })
  const issues = issuesQ.data?.issues ?? []
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const monthBarOpt = useMemo(() => {
    const items = rankQ.data?.items ?? []
    if (items.length === 0) return null
    const top = [...items].slice(0, 10).reverse()
    return {
      grid: { left: 130, right: 24, top: 10, bottom: 10 },
      tooltip: {
        trigger: "axis", axisPointer: { type: "shadow" },
        backgroundColor: pal.tooltipBg, borderColor: pal.tooltipBorder, textStyle: { color: pal.text },
      },
      xAxis: { type: "value", axisLabel: { color: pal.axis }, splitLine: { lineStyle: { color: pal.split } } },
      yAxis: {
        type: "category", data: top.map((i) => i.title),
        axisLabel: { color: pal.axis, fontSize: 11 },
        axisLine: { lineStyle: { color: pal.split } }, axisTick: { show: false },
      },
      series: [{
        type: "bar", data: top.map((i) => i.sum_score), barWidth: "62%",
        itemStyle: { color: "#4fc3f7", borderRadius: [0, 4, 4, 0] },
      }],
    }
  }, [rankQ.data, pal])

  return (
    <>
      <Reveal>
      <PageHeader
        crumb="榜单 · 自建聚合"
        title="月榜"
        extra="由官方周榜按自然月聚合 · 累计得分排序"
      />
      </Reveal>
      {issuesQ.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Reveal>
          <ChipRow issues={issues} value={effective} onChange={setIssue} />
          </Reveal>
          {monthBarOpt && (
            <Reveal delay={0.06}>
            <ChartCard
              title="当月累计得分 Top 10"
              option={monthBarOpt}
              filename={`monthly-${effective}`}
              badge={`${rankQ.data?.items.length ?? 0} 首`}
            />
            </Reveal>
          )}
          {rankQ.isLoading ? (
            <Spinner />
          ) : (
            <Reveal delay={0.12}>
            <div className="card" style={{ overflowX: "auto" }}>
              <div className="card-title">
                {rankQ.data?.month} · 月榜
                <span className="badge">{rankQ.data?.items.length ?? 0} 首</span>
              </div>
              <table className="rank-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>歌曲</th>
                    <th style={{ textAlign: "center" }}>上榜周数</th>
                    <th style={{ textAlign: "center" }}>最佳排名</th>
                    <th style={{ textAlign: "right" }}>当月累计得分</th>
                  </tr>
                </thead>
                <tbody>
                  {(rankQ.data?.items ?? []).map((it) => (
                    <tr key={it.bvid} className={it.rank <= 3 ? `rank-${it.rank}` : ""}>
                      <td className="rank-no">{it.rank}</td>
                      <td className="song-cell">
                        <Link to={`/song/${it.bvid}`}>
                          <span className="t">{it.title}</span>
                        </Link>
                      </td>
                      <td className="num" style={{ textAlign: "center" }}>{it.weeks_on_board}</td>
                      <td className="num" style={{ textAlign: "center" }}>#{it.best_rank}</td>
                      <td className="score-cell">{fmtScore(it.sum_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </Reveal>
          )}
        </>
      )}
    </>
  )
}
