import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Trophy, Crown, Flame, Clock, Star, TrendingUp } from "lucide-react"
import { api } from "../lib/api"
import { useTheme, getChartPalette } from "../lib/theme"
import { fmtInt, fmtWan, tierOf, pick } from "../lib/format"
import { ChartCard } from "../components/ChartCard"
import { SkeletonTable } from "../components/Skeleton"
import type { EChartsCoreOption } from "echarts/core"

const TYPE = "annual"

function val(e: any, a: string, b: string) {
  const v = pick(e, a, b)
  return v ?? 0
}

export default function AnnualReview() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const [issue, setIssue] = useState<string | null>(null)

  const issuesQ = useQuery({
    queryKey: ["boardIssues", TYPE],
    queryFn: () => api.boardIssues(TYPE),
  })
  const issues = useMemo(
    () => (issuesQ.data?.issues ?? []).slice().sort((a, b) => b.issue.localeCompare(a.issue)),
    [issuesQ.data],
  )
  const active = issue ?? issues[0]?.issue ?? null

  const ranksQ = useQuery({
    queryKey: ["rankings", TYPE, active],
    queryFn: () => api.rankings(TYPE, active as string, 300),
    enabled: !!active,
  })
  const items = useMemo(() => ranksQ.data?.items ?? [], [ranksQ.data])

  const stats = useMemo(() => {
    if (!items.length) return null
    const views = items.map((e) => val(e, "view", "views"))
    const maxView = Math.max(...views)
    const legend = items.filter((e) => {
      const t = tierOf(val(e, "view", "views"))
      return t.key === "legend" || t.key === "myth"
    })
    const weeks = items.map((e) => e.weeks_on_board ?? 0).filter((w) => w > 0)
    const avgWeeks = weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : 0
    const topView = items.reduce((a, b) => (val(b, "view", "views") > val(a, "view", "views") ? b : a))
    const topCoinRate = items.reduce((a, b) => {
      const av = val(a, "view", "views"), bv = val(b, "view", "views")
      const ar = av ? val(a, "coin", "coins") / av : 0
      const br = bv ? val(b, "coin", "coins") / bv : 0
      return br > ar ? b : a
    })
    const longest = items.reduce((a, b) => ((b.weeks_on_board ?? 0) > (a.weeks_on_board ?? 0) ? b : a))
    const newest = items.reduce((a, b) => ((b.pubtime ?? 0) > (a.pubtime ?? 0) ? b : a))
    return {
      count: items.length,
      maxScore: items[0]?.score ?? 0,
      champion: items[0],
      maxView,
      legendCount: legend.length,
      avgWeeks,
      topView, topCoinRate, longest, newest,
    }
  }, [items])

  const scoreOpt: EChartsCoreOption | null = useMemo(() => {
    if (!items.length) return null
    const top = items.slice(0, 12).slice().reverse()
    return {
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => fmtInt(v) },
      xAxis: { type: "value", axisLabel: { color: pal.axis, formatter: (v: number) => fmtWan(v) }, splitLine: { lineStyle: { color: pal.split } } },
      yAxis: {
        type: "category",
        data: top.map((e) => e.title_cn || e.title),
        axisLabel: { color: pal.text, width: 160, overflow: "truncate" },
        axisLine: { lineStyle: { color: pal.split } },
      },
      series: [{
        type: "bar", data: top.map((e) => e.score),
        itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [
          { offset: 0, color: "#0a84d8" }, { offset: 1, color: "#cf2390" },
        ] } },
        barWidth: "62%",
      }],
    }
  }, [items, pal])

  const viewOpt: EChartsCoreOption | null = useMemo(() => {
    if (!items.length) return null
    const top = items.slice().sort((a, b) => val(b, "view", "views") - val(a, "view", "views")).slice(0, 12).reverse()
    return {
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => fmtWan(v) },
      xAxis: { type: "value", axisLabel: { color: pal.axis, formatter: (v: number) => fmtWan(v) }, splitLine: { lineStyle: { color: pal.split } } },
      yAxis: {
        type: "category",
        data: top.map((e) => e.title_cn || e.title),
        axisLabel: { color: pal.text, width: 160, overflow: "truncate" },
        axisLine: { lineStyle: { color: pal.split } },
      },
      series: [{
        type: "bar", data: top.map((e) => val(e, "view", "views")),
        itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [
          { offset: 0, color: "#0f9d6b" }, { offset: 1, color: "#0a8ed6" },
        ] } },
        barWidth: "62%",
      }],
    }
  }, [items, pal])

  const distOpt: EChartsCoreOption | null = useMemo(() => {
    if (!items.length) return null
    const buckets = [
      { label: "<1万", min: 0, max: 1e4 },
      { label: "1–5万", min: 1e4, max: 5e4 },
      { label: "5–15万", min: 5e4, max: 15e4 },
      { label: "15–40万", min: 15e4, max: 40e4 },
      { label: "40–100万", min: 40e4, max: 1e6 },
      { label: "≥100万", min: 1e6, max: Infinity },
    ]
    const counts = buckets.map((b) => items.filter((e) => {
      const s = e.score
      return s >= b.min && s < b.max
    }).length)
    return {
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: buckets.map((b) => b.label), axisLabel: { color: pal.axis, rotate: 0 }, axisLine: { lineStyle: { color: pal.split } } },
      yAxis: { type: "value", name: "曲目数", nameTextStyle: { color: pal.axis }, axisLabel: { color: pal.axis }, splitLine: { lineStyle: { color: pal.split } } },
      series: [{
        type: "bar", data: counts, barWidth: "60%",
        itemStyle: { borderRadius: [6, 6, 0, 0], color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: "#cf2390" }, { offset: 1, color: "#0a84d8" },
        ] } },
      }],
    }
  }, [items, pal])

  const loading = issuesQ.isLoading || (ranksQ.isLoading && !!active)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="crumb">榜单 / 年度回顾</div>
          <h1>年度回顾 · Year in Review</h1>
        </div>
      </div>

      {issues.length > 1 && (
        <div className="chips">
          {issues.map((it) => (
            <button
              key={it.issue}
              className={`chip${it.issue === active ? " active" : ""}`}
              onClick={() => setIssue(it.issue)}
            >
              {it.issue} 年度
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 20 }}><SkeletonTable rows={12} /></div>
      ) : !stats ? (
        <div className="empty">暂无该年度数据</div>
      ) : (
        <>
          {/* 年度之最 KPI */}
          <div className="stat-row" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="k"><Trophy size={13} /> 年度冠军</div>
              <div className="v" style={{ fontSize: 15, lineHeight: 1.3 }}>
                {(stats.champion.title_cn || stats.champion.title)}
              </div>
              <div className="k" style={{ marginTop: 4 }}>得分 {fmtWan(stats.champion.score)}</div>
            </div>
            <div className="stat">
              <div className="k"><Flame size={13} /> 入榜曲目</div>
              <div className="v">{fmtInt(stats.count)}<small> 首</small></div>
              <div className="k" style={{ marginTop: 4 }}>传说/神话 {stats.legendCount} 首</div>
            </div>
            <div className="stat">
              <div className="k"><Crown size={13} /> 最高分</div>
              <div className="v">{fmtWan(stats.maxScore)}</div>
              <div className="k" style={{ marginTop: 4 }}>年度峰值</div>
            </div>
            <div className="stat">
              <div className="k"><Clock size={13} /> 平均在榜</div>
              <div className="v">{stats.avgWeeks.toFixed(1)}<small> 周</small></div>
              <div className="k" style={{ marginTop: 4 }}>最长 {stats.longest.weeks_on_board ?? 0} 周</div>
            </div>
          </div>

          {/* 维度亮点 */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-title"><Star size={14} /> 年度之最 · 数据切片</div>
              <div className="ratio-list">
                <div className="tr-row">
                  <span className="tr-key">最高播放</span>
                  <span className="tr-val">
                    <b>{stats.topView.title_cn || stats.topView.title}</b>
                    <span className="tr-muted">{fmtWan(val(stats.topView, "view", "views"))} 播放</span>
                  </span>
                </div>
                <div className="tr-row">
                  <span className="tr-key">硬币率最高</span>
                  <span className="tr-val">
                    <b>{stats.topCoinRate.title_cn || stats.topCoinRate.title}</b>
                    <span className="tr-muted">
                      {((val(stats.topCoinRate, "coin", "coins") / Math.max(1, val(stats.topCoinRate, "view", "views"))) * 100).toFixed(2)}%
                    </span>
                  </span>
                </div>
                <div className="tr-row">
                  <span className="tr-key">最长在榜</span>
                  <span className="tr-val">
                    <b>{stats.longest.title_cn || stats.longest.title}</b>
                    <span className="tr-muted">{stats.longest.weeks_on_board ?? 0} 周</span>
                  </span>
                </div>
                <div className="tr-row">
                  <span className="tr-key">最新投稿</span>
                  <span className="tr-val">
                    <b>{stats.newest.title_cn || stats.newest.title}</b>
                    <span className="tr-muted">{stats.newest.pubtime ? new Date(stats.newest.pubtime * 1000).getFullYear() : "—"} 年</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-title"><TrendingUp size={14} /> 年度竞争形态</div>
              <div className="muted" style={{ lineHeight: 1.9 }}>
                本年度共 <b>{fmtInt(stats.count)}</b> 首作品登榜，其中
                <b> {stats.legendCount} </b>首跨过传说/神话门槛。年度冠军
                <b> {stats.champion.title_cn || stats.champion.title} </b>
                以 <b>{fmtWan(stats.maxScore)}</b> 得分领跑；入榜曲目平均在榜
                <b> {stats.avgWeeks.toFixed(1)} </b>周，说明头部生态兼具爆发力与长尾生命力。
              </div>
            </div>
          </div>

          {/* 图表 */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <ChartCard title="年度得分 Top 12" option={scoreOpt} filename={`annual-score-${active}`} height={360} />
            <ChartCard title="年度播放量 Top 12" option={viewOpt} filename={`annual-view-${active}`} height={360} />
          </div>
          <ChartCard title="年度分数区间分布" option={distOpt} filename={`annual-dist-${active}`} height={300} badge="曲目数" />

          {/* 完整年榜 */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">{active} 年度完整榜单</div>
            <table className="rank-table">
              <thead>
                <tr>
                  <th className="rank-no">#</th>
                  <th>曲目</th>
                  <th className="num-th">播放</th>
                  <th className="num-th">收藏</th>
                  <th className="num-th">硬币</th>
                  <th className="num-th">点赞</th>
                  <th className="num-th">得分</th>
                  <th className="num-th">在榜</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const t = tierOf(val(e, "view", "views"))
                  return (
                    <tr key={e.bvid} className="song-row" onClick={() => navigate(`/song/${e.bvid}`)}>
                      <td className="rank-no">{e.rank}</td>
                      <td className="song-cell">
                        <div className="t">
                          {e.title_cn || e.title}
                          {e.title_cn && <span className="t-cn">{e.title}</span>}
                          {t.key && <span className={`t-badge ${t.key === "myth" ? "new" : "old"}`} style={{ marginLeft: 6 }}>{t.label}</span>}
                        </div>
                        <div className="meta">
                          {e.producers?.map((p: any) => p.name).join("、") || "—"}
                          {(e.vocalists?.length ?? 0) > 0 && ` · ${e.vocalists?.map((v: any) => v.name).join("、")}`}
                        </div>
                      </td>
                      <td className="num-r">{fmtWan(val(e, "view", "views"))}</td>
                      <td className="num-r">{fmtWan(val(e, "favorite", "favorites"))}</td>
                      <td className="num-r">{fmtWan(val(e, "coin", "coins"))}</td>
                      <td className="num-r">{fmtWan(val(e, "like", "likes"))}</td>
                      <td className="score-cell">{fmtWan(e.score)}</td>
                      <td className="num-r">{e.weeks_on_board ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
