import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Crown, Sparkles, CalendarDays, Flame, Trophy } from "lucide-react"
import { api } from "../lib/api"
import { useTheme, getChartPalette } from "../lib/theme"
import { fmtWan, pick } from "../lib/format"
import { ChartCard } from "../components/ChartCard"
import { SkeletonTable } from "../components/Skeleton"
import type { EChartsCoreOption } from "echarts/core"

const LEGEND = "legend"
const MAX = 50

function issueToDate(issue: string): string {
  if (!issue || issue.length < 8) return issue
  return `${issue.slice(0, 4)}-${issue.slice(4, 6)}-${issue.slice(6, 8)}`
}
function viewOf(e: any) {
  return pick(e, "view", "views") ?? 0
}

export default function LegendTimeline() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pal = getChartPalette(theme)

  const issuesQ = useQuery({
    queryKey: ["boardIssues", LEGEND],
    queryFn: () => api.boardIssues(LEGEND),
  })
  const latest = useMemo(
    () => (issuesQ.data?.issues ?? []).slice().sort((a, b) => b.issue.localeCompare(a.issue))[0],
    [issuesQ.data],
  )

  const poolQ = useQuery({
    queryKey: ["rankings", LEGEND, latest?.issue, MAX],
    queryFn: () => api.rankings(LEGEND, latest!.issue, MAX),
    enabled: !!latest,
  })
  const pool = useMemo(() => poolQ.data?.items ?? [], [poolQ.data])

  // 用「传说曲榜」自身历史：首次出现即晋升里程碑；榜内播放 ≥1000万 记为封神
  const histories = useQueries({
    queries: pool.map((s) => ({
      queryKey: ["songHistory", LEGEND, s.bvid],
      queryFn: () => api.songHistory(LEGEND, s.bvid),
      staleTime: 10 * 60_000,
    })),
  })

  const events = useMemo(() => {
    const out: {
      bvid: string; title: string; title_cn?: string | null
      date: string; issue: string; view: number; tier: "legend" | "myth"
      daysToMyth?: number
    }[] = []
    pool.forEach((s, i) => {
      const h = histories[i]?.data?.history
      if (!h || !h.length) return
      const sorted = h.slice().sort((a, b) => (a.issue ?? "").localeCompare(b.issue ?? ""))
      const first = sorted[0]
      const legendAt = { issue: first.issue ?? "", date: issueToDate(first.issue ?? ""), view: viewOf(first) }
      let mythAt: { issue: string; date: string; view: number } | null = null
      for (const e of sorted) {
        if (viewOf(e) >= 1e7) { mythAt = { issue: e.issue ?? "", date: issueToDate(e.issue ?? ""), view: viewOf(e) }; break }
      }
      out.push({
        bvid: s.bvid, title: s.title, title_cn: s.title_cn,
        date: legendAt.date, issue: legendAt.issue, view: legendAt.view, tier: "legend",
        daysToMyth: mythAt ? dateDiff(mythAt.date, legendAt.date) : undefined,
      })
    })
    out.sort((a, b) => a.date.localeCompare(b.date))
    return out
  }, [pool, histories])

  const mythCount = useMemo(() => events.filter((e) => e.daysToMyth !== undefined).length, [events])
  const fastest = useMemo(() => {
    const arr = events.filter((e) => e.daysToMyth != null).map((e) => e.daysToMyth!)
    return arr.length ? Math.min(...arr) : null
  }, [events])

  const byYear = useMemo(() => {
    const m = new Map<string, typeof events>()
    for (const e of events) {
      const y = e.date.slice(0, 4)
      if (!m.has(y)) m.set(y, [])
      m.get(y)!.push(e)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  const yearOpt: EChartsCoreOption | null = useMemo(() => {
    if (!byYear.length) return null
    const legendCounts = byYear.map(([, ev]) => ev.filter((e) => e.tier === "legend").length)
    const mythCounts = byYear.map(([, ev]) => ev.filter((e) => e.daysToMyth !== undefined).length)
    return {
      grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["晋升传说", "封神(神话)"], textStyle: { color: pal.text }, top: 0 },
      xAxis: { type: "category", data: byYear.map(([y]) => y), axisLabel: { color: pal.axis }, axisLine: { lineStyle: { color: pal.split } } },
      yAxis: { type: "value", axisLabel: { color: pal.axis }, splitLine: { lineStyle: { color: pal.split } } },
      series: [
        { name: "晋升传说", type: "bar", stack: "t", data: legendCounts, itemStyle: { color: "#0a84d8" }, barWidth: "55%" },
        { name: "封神(神话)", type: "bar", stack: "t", data: mythCounts, itemStyle: { color: "#cf2390" } },
      ],
    }
  }, [byYear, pal])

  const loading = issuesQ.isLoading || (poolQ.isLoading && !!latest) || (histories.some((h) => h.isLoading) && pool.length > 0)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="crumb">榜单 / 传说曲晋升时间线</div>
          <h1>传说曲晋升时间线</h1>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 20 }}><SkeletonTable rows={14} /></div>
      ) : events.length === 0 ? (
        <div className="empty">暂无可用于推算晋升时间的传说曲榜历史</div>
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="k"><Crown size={13} /> 已追踪传说曲</div>
              <div className="v">{events.length}<small> 首</small></div>
              <div className="k" style={{ marginTop: 4 }}>取自传说曲周榜 Top {MAX}</div>
            </div>
            <div className="stat">
              <div className="k"><Sparkles size={13} /> 其中封神</div>
              <div className="v">{mythCount}<small> 首</small></div>
              <div className="k" style={{ marginTop: 4 }}>榜内播放跨过千万</div>
            </div>
            <div className="stat">
              <div className="k"><CalendarDays size={13} /> 最早晋升</div>
              <div className="v" style={{ fontSize: 16 }}>{events[0]?.date}</div>
              <div className="k" style={{ marginTop: 4 }}>{(events[0]?.title_cn || events[0]?.title) ?? ""}</div>
            </div>
            <div className="stat">
              <div className="k"><Flame size={13} /> 最快封神</div>
              <div className="v" style={{ fontSize: 16 }}>
                {fastest != null ? <>{fastest}<small> 天</small></> : "—"}
              </div>
              <div className="k" style={{ marginTop: 4 }}>传说→神话</div>
            </div>
          </div>

          <ChartCard title="历年晋升传说曲数量" option={yearOpt} filename="legend-timeline-year" height={320} badge="按晋升年份" />

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title"><Trophy size={14} /> 晋升里程碑（按时间）</div>
            <div className="timeline">
              {byYear.map(([year, evs]) => (
                <div key={year} className="tl-year">
                  <div className="tl-year-label">{year}</div>
                  <div className="tl-events">
                    {evs.map((e) => {
                      const isMyth = e.daysToMyth !== undefined
                      return (
                        <div
                          key={e.bvid + e.issue}
                          className="tl-item"
                          onClick={() => navigate(`/song/${e.bvid}`)}
                        >
                          <div className={`tl-dot ${isMyth ? "myth" : "legend"}`} />
                          <div className="tl-body">
                            <div className="tl-date">{e.date}</div>
                            <div className="tl-title">
                              {e.title_cn || e.title}
                              <span className={`t-badge ${isMyth ? "new" : "old"}`} style={{ marginLeft: 6 }}>
                                {isMyth ? "封神" : "传说"}
                              </span>
                            </div>
                            <div className="tl-meta">
                              入榜播放 {fmtWan(e.view)}
                              {isMyth && e.daysToMyth != null && (
                                <span className="tl-fast"> · {e.daysToMyth} 天封神</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function dateDiff(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.round((da - db) / 86_400_000)
}
