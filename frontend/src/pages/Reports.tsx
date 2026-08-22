import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Copy, Download, ImageDown, FileText } from "lucide-react"
import { api } from "../lib/api"
import { Empty, Spinner, ChipRow, downloadBlob } from "../components/ui"
import { useEChart } from "../hooks/useEChart"
import { useTheme, getChartPalette } from "../lib/theme"
import type { ChartPalette } from "../lib/theme"
import { buildMarkdown, buildPoster, type ReportData } from "../lib/report"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

function barOption(labels: string[], values: number[], pal: ChartPalette, color: string) {
  return {
    grid: { left: 40, right: 20, top: 24, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: pal.tooltipBg,
      borderColor: pal.tooltipBorder,
      textStyle: { color: pal.text },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: pal.axis, fontSize: 10, rotate: 40 },
      axisLine: { lineStyle: { color: pal.split } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: pal.axis, fontSize: 10 },
      splitLine: { lineStyle: { color: pal.split } },
    },
    series: [
      { type: "bar", data: values, barWidth: "55%", itemStyle: { color, borderRadius: [3, 3, 0, 0] } },
    ],
  }
}

export default function Reports() {
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const [issue, setIssue] = useState<string | null>(null)

  const issuesQ = useQuery({ queryKey: ["issues", "weekly"], queryFn: () => api.boardIssues("weekly") })
  const issues = issuesQ.data?.issues ?? []
  const cur = issue ?? issues[0]?.issue ?? null

  const boardQ = useQuery({
    queryKey: ["rankings", "weekly", cur],
    queryFn: () => api.rankings("weekly", cur!, 100),
    enabled: !!cur,
  })
  const artistsQ = useQuery({ queryKey: ["stats-artists"], queryFn: () => api.artists(5000) })
  const vocalistsQ = useQuery({ queryKey: ["stats-vocalists"], queryFn: () => api.vocalists(5000) })
  const insightsQ = useQuery({ queryKey: ["insights-overview"], queryFn: api.insightsOverview })

  const artists = useMemo(
    () => [...(artistsQ.data?.items ?? [])].sort((a, b) => b.songs - a.songs),
    [artistsQ.data],
  )
  const vocalists = useMemo(
    () => [...(vocalistsQ.data?.items ?? [])].sort((a, b) => b.songs - a.songs),
    [vocalistsQ.data],
  )

  const report: ReportData | null = useMemo(() => {
    if (!cur || !boardQ.data) return null
    const top = boardQ.data.items
    const issueMeta = issues.find((i) => i.issue === cur)
    return {
      issue: cur,
      date: issueMeta?.date ?? "",
      board_count: boardQ.data.items.length,
      tier_counts: insightsQ.data?.kpis.tier_counts ?? { myth: 0, legend: 0, hall: 0 },
      top,
      surges: (insightsQ.data?.surges.items ?? []).map((s) => ({
        gain: s.gain, prev_rank: s.prev_rank, rank: s.rank, title: s.title,
      })),
      newcomers: (insightsQ.data?.newcomers.items ?? []).map((n) => ({ rank: n.rank, title: n.title })),
      artists,
      vocalists,
    }
  }, [cur, boardQ.data, issues, insightsQ.data, artists, vocalists])

  const md = report ? buildMarkdown(report) : ""

  const topOpt = useMemo(() => {
    if (!report) return null
    return barOption(
      report.top.slice(0, 10).map((it) => it.title.slice(0, 10)),
      report.top.slice(0, 10).map((it) => it.score ?? 0),
      pal,
      "#4fc3f7",
    )
  }, [report, pal])

  const artistOpt = useMemo(() => {
    if (!report) return null
    return barOption(
      report.artists.slice(0, 10).map((a) => a.name),
      report.artists.slice(0, 10).map((a) => a.songs),
      pal,
      "#ffd166",
    )
  }, [report, pal])

  const topChart = useEChart(topOpt)
  const artistChart = useEChart(artistOpt)

  const genPoster = () => {
    if (!report) return
    const top = topChart.getDataURL("#0a1426")
    const artist = artistChart.getDataURL("#0a1426")
    const canvas = buildPoster(report, [top, artist])
    const url = canvas.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = url
    a.download = `术力口_周报海报_${report.issue}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(md)
      alert("周报 Markdown 已复制到剪贴板")
    } catch {
      downloadBlob(`术力口_周报_${cur}.md`, md, "text/markdown;charset=utf-8")
      alert("剪贴板不可用，已改为下载 .md 文件")
    }
  }

  const dlMd = () => downloadBlob(`术力口_周报_${cur}.md`, md, "text/markdown;charset=utf-8")

  if (issuesQ.isLoading)
    return <div className="card" style={{ padding: 20 }}><Spinner /></div>

  return (
    <>
      <Reveal>
        <PageHeader crumb="工具 · 报告与分享" title="报告中心" />
      </Reveal>

      <Reveal>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">选择期数</div>
          <ChipRow issues={issues} value={cur ?? ""} onChange={setIssue} />
        </div>
      </Reveal>

      {!report ? (
        <Reveal>
          <div className="card" style={{ padding: 24 }}><Spinner label="正在生成周报…" /></div>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">
                <FileText size={15} /> 周报 Markdown
                <span style={{ marginLeft: "auto" }} />
              </div>
              <div className="ai-actions" style={{ marginTop: 0, marginBottom: 12 }}>
                <button className="chip" onClick={copyMd}><Copy size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> 复制</button>
                <button className="chip" onClick={dlMd}><Download size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> 下载 .md</button>
                <button className="chip primary" onClick={genPoster}><ImageDown size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> 下载海报 PNG</button>
              </div>
              <pre className="md-preview">{md}</pre>
            </div>
          </Reveal>

          <StaggerGroup className="grid-2">
            <StaggerItem>
              <div className="card">
                <div className="card-title">本期 Top 10 得分</div>
                {topOpt ? <div ref={topChart.setRef} className="chart" style={{ height: 280 }} /> : <Empty />}
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="card">
                <div className="card-title">热门 P主 Top 10</div>
                {artistOpt ? <div ref={artistChart.setRef} className="chart" style={{ height: 280 }} /> : <Empty />}
              </div>
            </StaggerItem>
          </StaggerGroup>
        </>
      )}
    </>
  )
}
