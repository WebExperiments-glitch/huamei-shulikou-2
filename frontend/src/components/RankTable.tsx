import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Search } from "lucide-react"
import { Link } from "react-router-dom"
import { Button, Input, Space, Table, Tooltip } from "antd"
import type { ColumnsType } from "antd/es/table"
import type { RankEntry } from "../lib/types"
import { fmt, fmtScore, rankClass, Rate, downloadCSV, downloadJSON, rankItemsToExport } from "./ui"
import { api } from "../lib/api"
import { useTheme } from "../lib/theme"
import { AnimatedNumber, RankBadge } from "../lib/fx"

export function RankTable({
  items,
  showRate = true,
  showStats = true,
  sortable = true,
  exportName,
  boardType,
  issue,
  sparkline,
}: {
  items: RankEntry[]
  showRate?: boolean
  showStats?: boolean
  sortable?: boolean
  exportName?: string
  boardType?: string
  issue?: string
  sparkline?: boolean
}) {
  const [filter, setFilter] = useState("")

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = [
        it.title,
        it.title_cn ?? "",
        (it.producers ?? []).map((p) => p.name).join(" "),
        (it.vocalists ?? []).map((v) => v.name).join(" "),
        it.bvid,
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, filter])

  const hasView = items.some((it) => (it.view ?? 0) > 0)

  // 走势窗口大小：年/半年榜一年最多 2 期，需要更大窗口才能拉出趋势；
  // 周榜/传说曲 1 周 1 期，10 周足够。annual 上限设为 30 期（≈15 年），与后端 Query 上限对齐。
  const sparkCount = boardType === "annual" ? 30 : 10
  const { data: sparkData } = useQuery({
    queryKey: ["sparklines", boardType, issue, sparkCount],
    queryFn: () => api.boardSparklines(boardType!, issue!, sparkCount),
    enabled: !!sparkline && !!boardType && !!issue,
  })
  const sparkMap = sparkData?.sparklines ?? {}

  const numSorter = (k: "view" | "favorite" | "coin" | "like" | "score") =>
    sortable ? (a: RankEntry, b: RankEntry) => (a[k] ?? 0) - (b[k] ?? 0) : undefined

  const columns = useMemo<ColumnsType<RankEntry>>(() => {
    const cols: ColumnsType<RankEntry> = [
      {
        title: "#",
        dataIndex: "rank",
        width: 64,
        sorter: sortable ? (a, b) => a.rank - b.rank : undefined,
        defaultSortOrder: sortable ? "ascend" : undefined,
        render: (r: number, it) => <RankBadge rank={r} rate={it.rate} lastRank={it.last_rank} weeksOnBoard={it.weeks_on_board} className={rankClass(r)} />,
      },
      {
        title: "歌曲",
        dataIndex: "title",
        render: (_, it) => (
          <Link to={`/song/${it.bvid}`} className="song-cell">
            <span className="t">{it.title}</span>
            {it.title_cn && <span className="t-cn">{it.title_cn}</span>}
          </Link>
        ),
      },
      {
        title: "P主",
        render: (_, it) => (
          <span className="num">{it.producers?.map((p) => p.name).join(" / ") ?? "—"}</span>
        ),
      },
      {
        title: "歌姬",
        render: (_, it) => (
          <span className="num">{it.vocalists?.map((v) => v.name).join(" / ") ?? "—"}</span>
        ),
      },
    ]

    if (showStats) {
      if (hasView) {
        cols.push({
          title: "播放",
          dataIndex: "view",
          align: "right",
          sorter: numSorter("view"),
          render: (v: number) => <span className="num">{fmt(v)}</span>,
        })
      }
      ;(["favorite", "coin", "like"] as const).forEach((k) => {
        cols.push({
          title: k === "favorite" ? "收藏" : k === "coin" ? "硬币" : "点赞",
          dataIndex: k,
          align: "right",
          sorter: numSorter(k),
          render: (v: number) => <span className="num">{fmt(v)}</span>,
        })
      })
    }

    cols.push({
      title: "得分",
      dataIndex: "score",
      align: "right",
      sorter: numSorter("score"),
      render: (s: number, it) => (
        <AnimatedNumber
          value={s}
          formatter={fmtScore}
          startDelay={Math.min(it.rank, 30) * 30}
          className="score-cell"
        />
      ),
    })

    if (showRate) {
      cols.push({
        title: "涨跌",
        align: "right",
        width: 84,
        render: (_, it) => <Rate rate={it.rate} />,
      })
    }

    if (sparkline) {
      cols.push({
        title: "走势",
        align: "center",
        width: 104,
        render: (_, it) =>
          sparkMap[it.bvid] ? (
            <Sparkline data={sparkMap[it.bvid] ?? []} />
          ) : (
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
          ),
      })
    }

    return cols
  }, [items, showStats, showRate, sortable, sparkline, hasView, sparkMap])

  const doExportCSV = () => {
    const { headers, rows } = rankItemsToExport(filtered)
    downloadCSV(headers, rows, exportName ?? "ranking")
  }
  const doExportJSON = () => downloadJSON(filtered, exportName ?? "ranking")

  if (!items || items.length === 0) return null

  return (
    <>
      {exportName && (
        <div className="board-toolbar" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Input
            allowClear
            prefix={<Search size={14} style={{ color: "var(--text-faint)" }} />}
            placeholder="筛选：标题 / P主 / 歌姬 / bvid"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{filtered.length} / {items.length} 首</span>
          <Space style={{ marginLeft: "auto" }}>
            <Tooltip title="导出为 CSV">
              <Button size="small" icon={<Download size={13} />} onClick={doExportCSV}>CSV</Button>
            </Tooltip>
            <Tooltip title="导出为 JSON">
              <Button size="small" icon={<Download size={13} />} onClick={doExportJSON}>JSON</Button>
            </Tooltip>
          </Space>
        </div>
      )}
      <Table<RankEntry>
        rowKey={(it) => `${it.bvid}-${it.rank}`}
        columns={columns}
        dataSource={filtered}
        size="small"
        pagination={false}
        rowClassName={(it) => [rankClass(it.rank), it.last_rank == null && it.weeks_on_board === 1 ? "row-new" : ""].filter(Boolean).join(" ")}
        scroll={{ x: true }}
      />
    </>
  )
}

/** 行内迷你排名走势：低排名在上方（逆袭/衰退一目了然），颜色按窗口首尾变化着色。
 *  数据语义：序列按时间升序，None 表示该期未上榜。对年/半年榜（半年/年度结算）
 *  一首歌可能只在最近 1-2 期有数据，单点也画圆点（"新进榜"指示），让"无数据"和
 *  "刚出现"有清晰区分。 */
export function Sparkline({ data }: { data: (number | null)[] }) {
  const { theme } = useTheme()
  const pts = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length === 0) {
    return <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
  }
  const W = 92
  const H = 22
  const pad = 2
  const maxR = Math.max(...pts.map((p) => p.v), 10)
  const colorByTone = (improved: boolean, flat: boolean) => flat
    ? (theme === "dark" ? "#7d8aa5" : "#6b7589")
    : improved
      ? "#66e39f"
      : "#ff6b6b"

  // 单点：画一个居中圆点（"新进榜"提示，避免被误认为无数据）
  if (pts.length === 1) {
    const y = pad + ((pts[0]!.v - 1) / (maxR - 1)) * (H - pad * 2)
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", margin: "0 auto" }}
        aria-label={`仅 1 期上榜，排名 ${pts[0]!.v}`}>
        <circle cx={W / 2} cy={y} r={3.5}
          fill={colorByTone(false, true)} opacity={0.85} />
        <title>仅 1 期上榜（年/半年榜新进歌曲）</title>
      </svg>
    )
  }

  const n = pts.length
  const coords = pts.map((p, idx) => {
    const x = pad + (idx / (n - 1)) * (W - pad * 2)
    // rank 1 在顶部；排名越大 y 越大（越低）
    const y = pad + ((p.v - 1) / (maxR - 1)) * (H - pad * 2)
    return [x, y] as const
  })
  const first = pts[0]!.v
  const last = pts[n - 1]!.v
  const improved = last < first
  const flat = last === first
  const color = colorByTone(improved, flat)
  const d = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ")
  const [ex, ey] = coords[coords.length - 1]!
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", margin: "0 auto" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={2} fill={color} />
    </svg>
  )
}
