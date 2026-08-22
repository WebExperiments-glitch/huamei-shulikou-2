import { useMemo, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Empty, Spinner, fmt, fmtDate, Rate } from "../components/ui"
import { ExternalLink, Copy, Sigma, Heart } from "lucide-react"
import { useEChart } from "../hooks/useEChart"
import { ChartExport } from "../components/ChartExport"
import { useFavorites } from "../lib/favorites"
import { useToast } from "../lib/toast"
import type { RankEntry, ScoreEntry } from "../lib/types"
import { useTheme, getChartPalette } from "../lib/theme"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"

const EMPTY_WEEKLY: RankEntry[] = []

const BOARD_NAMES: Record<string, string> = {
  weekly: "周榜",
  legend: "传说曲周榜",
  annual: "年榜/半年榜",
}

export default function SongDetail() {
  const { bvid = "" } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ["song-detail", bvid],
    queryFn: () => api.allHistory(bvid),
  })

  const weekly = data?.histories.weekly ?? EMPTY_WEEKLY
  const { theme } = useTheme()
  const p = getChartPalette(theme)

  // 译名：英文始终取机翻；中文仅在收录池缺 title_cn 时补全
  const songTitle = data?.song?.title ?? ""
  const enQ = useQuery({
    queryKey: ["tr", bvid, "en"],
    queryFn: () => api.translate(bvid, songTitle, "en"),
    enabled: !!songTitle,
  })
  const zhQ = useQuery({
    queryKey: ["tr", bvid, "zh"],
    queryFn: () => api.translate(bvid, songTitle, "zh"),
    enabled: !!songTitle && !data?.song?.title_cn,
  })

  const chartOption = useMemo(() => {
    if (weekly.length === 0) return null
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: p.tooltipBg,
        borderColor: p.tooltipBorder,
        textStyle: { color: p.text },
      },
      legend: { data: ["排名", "得分"], textStyle: { color: p.text } },
      grid: { left: 40, right: 60, top: 30, bottom: 30 },
      xAxis: {
        type: "category",
        data: weekly.map((w) => w.issue),
        axisLabel: { color: p.axis, rotate: 30, fontSize: 10 },
        axisLine: { lineStyle: { color: p.split } },
      },
      yAxis: [
        {
          type: "value",
          inverse: true,
          min: 1,
          max: 120,
          axisLabel: { color: p.axis, formatter: (v: number) => `#${v}` },
          splitLine: { lineStyle: { color: p.split } },
        },
        {
          type: "value",
          axisLabel: {
            color: p.axis,
            formatter: (v: number) =>
              v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : v >= 1e4 ? (v / 1e4).toFixed(0) + "万" : v,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "排名",
          type: "line",
          data: weekly.map((w) => w.rank),
          smooth: true,
          symbolSize: 5,
          lineStyle: { color: "#4fc3f7", width: 2 },
          itemStyle: { color: "#4fc3f7" },
          areaStyle: { color: "rgba(79,195,247,0.08)" },
        },
        {
          name: "得分",
          type: "line",
          yAxisIndex: 1,
          data: weekly.map((w) => w.score),
          smooth: true,
          symbolSize: 4,
          lineStyle: { color: "#ffd166", width: 1.5, type: "dashed" },
          itemStyle: { color: "#ffd166" },
          areaStyle: { color: "rgba(255,209,102,0.05)" },
        },
      ],
    }
  }, [weekly, p])

  const chartRef = useEChart(chartOption)

  const toast = useToast().toast

  const [copied, setCopied] = useState(false)
  function copyBili(url: string) {
    navigator.clipboard?.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1600); toast("已复制原视频链接", "success") },
      () => toast("复制失败，请手动复制", "error"),
    )
  }

  const [copiedTr, setCopiedTr] = useState(false)
  function copyText(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => { setCopiedTr(true); setTimeout(() => setCopiedTr(false), 1600); toast("已复制标题文本", "success") },
      () => toast("复制失败，请手动复制", "error"),
    )
  }

  const favItems = useFavorites((s) => s.items)
  const toggleFav = useFavorites((s) => s.toggle)

  if (isLoading) return <Spinner />
  if (error || !data) return <Empty label="未找到该歌曲" />

  const { song } = data
  const isFav = favItems.some((x) => x.bvid === song.bvid)
  const bestWeekly = weekly.length > 0 ? Math.min(...weekly.map((w) => w.rank)) : null
  const totalWeeks = weekly.length
  const biliUrl = `https://www.bilibili.com/video/${song.bvid}`

  return (
    <>
      <Reveal>
      <div className="topbar">
        <div>
          <div className="crumb">
            <Link to="/songs">歌曲库</Link> · {song.bvid}
          </div>
          <div className="detail-head" style={{ marginBottom: 0, marginTop: 8 }}>
            <div>
              <div className="t-t">
                {song.title}
                {song.title_cn && <span className="cn">{song.title_cn}</span>}
              </div>
              <div className="t-meta">
                <span>投稿 <b>{fmtDate(song.pubtime)}</b></span>
                <span>首次纪录 <b>{fmtDate(song.first_recorded_at)}</b></span>
                <span>周榜上榜 <b>{totalWeeks}</b> 期</span>
                {bestWeekly && <span>最佳 <b>#{bestWeekly}</b></span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <button
            className={`chip${isFav ? " active" : ""}`}
            onClick={() => {
              toggleFav({ bvid: song.bvid, title: song.title, title_cn: song.title_cn })
              toast(isFav ? "已取消收藏" : "已收藏到「我的收藏」", isFav ? "info" : "success")
            }}
            title="收藏 / 取消收藏"
          >
            <Heart size={14} /> {isFav ? "已收藏" : "收藏"}
          </button>
        </div>
      </div>
      </Reveal>

      <Reveal delay={0.06}>
      <div className="card bili-card">
        <div className="card-title">B 站原视频</div>
        <div className="bili-row">
          <a className="bili-link" href={biliUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            <span className="bili-url">{biliUrl}</span>
          </a>
          <button className="chip" onClick={() => copyBili(biliUrl)}><Copy size={13} /> {copied ? "已复制" : "复制链接"}</button>
        </div>
      </div>
      </Reveal>

      <Reveal delay={0.1}>
      <div className="card tr-card">
        <div className="card-title">译名（机翻参考）</div>
        <div className="tr-row">
          <span className="tr-key">英文</span>
          {enQ.isLoading ? (
            <span className="tr-val tr-muted">翻译中…</span>
          ) : enQ.data?.text ? (
            <span className="tr-val">
              {enQ.data.text}
              <button className="chip tr-copy" onClick={() => copyText(enQ.data!.text)}><Copy size={12} /> {copiedTr ? "已复制" : "复制"}</button>
            </span>
          ) : (
            <span className="tr-val tr-muted">—</span>
          )}
        </div>
        <div className="tr-row">
          <span className="tr-key">中文</span>
          {song.title_cn ? (
            <span className="tr-val">{song.title_cn}</span>
          ) : zhQ.isLoading ? (
            <span className="tr-val tr-muted">翻译中…</span>
          ) : zhQ.data?.text ? (
            <span className="tr-val">{zhQ.data.text}</span>
          ) : (
            <span className="tr-val tr-muted">—</span>
          )}
        </div>
        <div className="tr-note">
          翻译由 Google 自动生成，专有名词（人名、梗、双关）可能不准，仅作参考；结果已缓存，可重复查看无需重翻。
        </div>
      </div>
      </Reveal>

      <StaggerGroup className="grid-2" style={{ marginBottom: 16 }}>
        <StaggerItem key="producers">
        <div className="card">
          <div className="card-title">P主</div>
          <div className="pills">
            {song.producers.map((p) => (
              <span className="pill" key={p.name}>
                {p.wiki_url || p.moegirl_url ? <a href={p.wiki_url ?? p.moegirl_url ?? "#"} target="_blank" rel="noreferrer">{p.name}</a> : <b>{p.name}</b>}
              </span>
            ))}
          </div>
        </div>
        </StaggerItem>
        <StaggerItem key="vocalists">
        <div className="card">
          <div className="card-title">歌姬</div>
          <div className="pills">
            {song.vocalists.map((v) => (
              <span className="pill" key={v.name}>
                {v.wiki_url || v.moegirl_url ? <a href={v.wiki_url ?? v.moegirl_url ?? "#"} target="_blank" rel="noreferrer">{v.name}</a> : <b>{v.name}</b>}
              </span>
            ))}
          </div>
        </div>
        </StaggerItem>
      </StaggerGroup>

      <Reveal delay={0.06}>
      <ScoreBreakdownCard bvid={song.bvid} />
      </Reveal>

      {Object.entries(data.histories).map(([type, rows]) => (
        <Reveal key={type} delay={0.06}>
        <HistoryCard type={type} rows={rows} />
        </Reveal>
      ))}

      {chartOption && (
        <Reveal delay={0.1}>
        <div className="card">
          <div className="card-title">周榜排名轨迹<ChartExport getURL={chartRef.getDataURL} filename={"song-rank-" + song.bvid} /></div>
          <div ref={chartRef.setRef} className="chart" />
        </div>
        </Reveal>
      )}
    </>
  )
}

const COMP_DEFS = [
  { key: "comp_view", label: "播放", color: "#4fc3f7" },
  { key: "comp_favorite", label: "收藏", color: "#ffd166" },
  { key: "comp_like", label: "点赞", color: "#a78bfa" },
  { key: "comp_coin", label: "硬币", color: "#ff6fd8" },
] as const

function ScoreBreakdownCard({ bvid }: { bvid: string }) {
  const [board, setBoard] = useState<"weekly" | "legend" | "annual">("weekly")
  const { theme } = useTheme()
  const p = getChartPalette(theme)
  const { data, isLoading } = useQuery({
    queryKey: ["score-breakdown", bvid, board],
    queryFn: () => api.scoreBreakdown(bvid, board),
  })

  const entries = useMemo<ScoreEntry[]>(() => data?.entries ?? [], [data])

  const chartOption = useMemo(() => {
    if (entries.length === 0) return null
    const issues = entries.map((e) => e.issue)
    const series = COMP_DEFS.map((c) => {
      const vals = entries.map((e) => {
        const v = e[c.key]
        const sum = COMP_DEFS.reduce(
          (s, d) => s + Math.abs(e[d.key] ?? 0),
          0,
        )
        return sum > 0 && v != null ? +((Math.abs(v) / sum) * 100).toFixed(2) : 0
      })
      return {
        name: c.label,
        type: "bar",
        stack: "total",
        data: vals,
        itemStyle: { color: c.color },
        barMaxWidth: 22,
      }
    })
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: p.tooltipBg,
        borderColor: p.tooltipBorder,
        textStyle: { color: p.text },
        valueFormatter: (v: number) => `${v}%`,
      },
      legend: { data: COMP_DEFS.map((c) => c.label), textStyle: { color: p.text }, top: 0 },
      grid: { left: 36, right: 14, top: 34, bottom: 54 },
      xAxis: {
        type: "category",
        data: issues,
        axisLabel: { color: p.axis, rotate: 45, fontSize: 9 },
        axisLine: { lineStyle: { color: p.split } },
      },
      yAxis: {
        type: "value",
        max: 100,
        axisLabel: { color: p.axis, formatter: "{value}%" },
        splitLine: { lineStyle: { color: p.split } },
      },
      series,
    }
  }, [entries, p])

  const ref = useEChart(chartOption)

  if (isLoading) return <div className="card"><div className="card-title">得分与公式</div><Spinner /></div>
  if (!data || entries.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">
        得分与公式 · 透明拆解
        <span className="badge">因子构成参考</span>
        <ChartExport getURL={ref.getDataURL} filename={"song-breakdown-" + bvid} />
        <Link to="/formula" className="formula-link"><Sigma size={13} /> 公式与试算器</Link>
      </div>

      <div className="seg">
        {(["weekly", "legend", "annual"] as const).map((b) => (
          <button
            key={b}
            className={`seg-btn${board === b ? " active" : ""}`}
            onClick={() => setBoard(b)}
          >
            {b === "weekly" ? "周榜" : b === "legend" ? "传说曲周榜" : "年榜/半年榜"}
          </button>
        ))}
      </div>

      <div ref={ref.setRef} className="chart" style={{ height: 280 }} />

      <div className="table-scroll">
        <table className="rank-table breakdown">
          <thead>
            <tr>
              <th>期次</th>
              <th>#</th>
              <th className="num-th">官方分</th>
              <th className="num-th">时间修正 t</th>
              <th className="num-th">{entries.some((e) => e.view_implied) ? "播放构成*" : "播放构成"}</th>
              <th className="num-th">收藏构成</th>
              <th className="num-th">点赞构成</th>
              <th className="num-th">硬币构成</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice().reverse().map((e) => (
              <tr key={e.issue}>
                <td className="num">{e.issue}</td>
                <td className="rank-no" style={{ color: (e.rank ?? 99) <= 3 ? "var(--gold)" : undefined }}>{e.rank}</td>
                <td className="score-cell">{e.official_score != null ? fmt(e.official_score) : "—"}</td>
                <td className="num">
                  <span className={`t-badge ${e.formula_version}`}>
                    {e.t.toFixed(3)}{e.t_assumed ? "?" : ""}
                  </span>
                  <span className="t-ver">{e.formula_version === "new" ? "新" : "旧"}</span>
                </td>
                <td className="num">{e.comp_view != null ? fmt(e.comp_view) + (e.view_implied ? " *" : "") : "—"}</td>
                <td className="num">{e.comp_favorite != null ? fmt(e.comp_favorite) : "—"}</td>
                <td className="num">{e.comp_like != null ? fmt(e.comp_like) : "—"}</td>
                <td className="num">{e.comp_coin != null ? fmt(e.comp_coin) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="breakdown-note">
        四因子构成相加即等于官方得分（可核验）。其中<b>播放构成*</b>因官方周榜表未收录播放量字段，
        由「官方分 − 收藏/点赞/硬币贡献」反推得出；收藏/点赞/硬币为表内真实值 × 权重。
        注意：官方表为<b>累计值</b>而非逐周增量快照，此拆解展示「分数各因子占比」，非逐周 Δ 复算；
        精确逐周复算请用上方「公式与试算器」。
        <span className="t-badge new">新</span> = 新公式(≥54期)，<span className="t-badge old">旧</span> = 旧公式(&lt;54期)；t 后的 ? 表示缺失投稿时间、按默认值估算。
      </div>
    </div>
  )
}

function HistoryCard({ type, rows }: { type: string; rows: RankEntry[] }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="card">
      <div className="card-title">
        {BOARD_NAMES[type] ?? type}上榜历史
        <span className="badge">{rows.length} 期</span>
      </div>
      <table className="rank-table">
        <thead>
          <tr>
            <th style={{ width: 90 }}>期次</th>
            <th style={{ width: 40 }}>#</th>
            <th className="num-th">得分</th>
            <th className="num-th">收藏</th>
            <th className="num-th">硬币</th>
            <th className="num-th">点赞</th>
            <th className="num-th">涨跌</th>
            <th className="num-th">上榜周数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.issue}>
              <td className="num">{r.issue}</td>
              <td className="rank-no" style={{ color: r.rank <= 3 ? "var(--gold)" : undefined }}>{r.rank}</td>
              <td className="score-cell">{fmt(r.score)}</td>
              <td className="num">{fmt(r.favorite)}</td>
              <td className="num">{fmt(r.coin)}</td>
              <td className="num">{fmt(r.like)}</td>
              <td style={{ textAlign: "right" }}><Rate rate={r.rate} /></td>
              <td className="num" style={{ textAlign: "right" }}>{r.weeks_on_board ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}