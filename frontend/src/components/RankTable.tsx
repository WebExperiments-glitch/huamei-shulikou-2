import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Download } from "lucide-react"
import { Link } from "react-router-dom"
import type { RankEntry } from "../lib/types"
import { fmt, fmtScore, rankClass, Rate, downloadCSV, downloadJSON, rankItemsToExport } from "./ui"
import { api } from "../lib/api"
import { useTheme } from "../lib/theme"

type SortKey = "rank" | "view" | "favorite" | "coin" | "like" | "score" | "weeks"

const ACCESSORS: Record<SortKey, (it: RankEntry) => number> = {
  rank: (it) => it.rank,
  view: (it) => it.view,
  favorite: (it) => it.favorite,
  coin: (it) => it.coin,
  like: (it) => it.like,
  score: (it) => it.score,
  weeks: (it) => it.weeks_on_board ?? 0,
}

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
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
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

  const sorted = useMemo(() => {
    if (!sortable) return filtered
    const acc = ACCESSORS[sortKey]
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => (acc(a) - acc(b)) * dir)
  }, [filtered, sortable, sortKey, sortDir])

  const hasView = items.some((it) => (it.view ?? 0) > 0)

  const { data: sparkData } = useQuery({
    queryKey: ["sparklines", boardType, issue],
    queryFn: () => api.boardSparklines(boardType!, issue!, 10),
    enabled: !!sparkline && !!boardType && !!issue,
  })
  const sparkMap = sparkData?.sparklines ?? {}

  const onSort = (key: SortKey) => {
    if (!sortable) return
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // 数值类默认从高到低更直观
      setSortDir(key === "rank" ? "asc" : "desc")
    }
  }

  const Th = ({ k, label, right = true }: { k?: SortKey; label: string; right?: boolean }) => {
    const active = k && sortable && k === sortKey
    return (
      <th
        className={right ? "num-th" : ""}
        onClick={k ? () => onSort(k) : undefined}
        style={{ cursor: k && sortable ? "pointer" : "default", userSelect: "none" }}
      >
        {label}
        {active && (
          <span style={{ marginLeft: 4, color: "var(--accent)" }}>
            {sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          </span>
        )}
      </th>
    )
  }

  const doExportCSV = () => {
    const { headers, rows } = rankItemsToExport(sorted)
    downloadCSV(headers, rows, exportName ?? "ranking")
  }
  const doExportJSON = () => downloadJSON(sorted, exportName ?? "ranking")

  if (!items || items.length === 0) return null

  return (
    <>
      {exportName && (
        <div className="board-toolbar">
          <input
            type="text"
            placeholder="筛选：标题 / P主 / 歌姬 / bvid"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{sorted.length} / {items.length} 首</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="chip" onClick={doExportCSV}>
              <Download size={12} style={{ marginRight: 4, verticalAlign: -2 }} />CSV
            </button>
            <button className="chip" onClick={doExportJSON}>
              <Download size={12} style={{ marginRight: 4, verticalAlign: -2 }} />JSON
            </button>
          </div>
        </div>
      )}
      <table className="rank-table">
        <thead>
          <tr>
            <Th k="rank" label="#" right={false} />
            <th>歌曲</th>
            <th>P主</th>
            <th>歌姬</th>
            {showStats && (
              <>
                {hasView && <Th k="view" label="播放" />}
                <Th k="favorite" label="收藏" />
                <Th k="coin" label="硬币" />
                <Th k="like" label="点赞" />
              </>
            )}
            <Th k="score" label="得分" />
            {showRate && <th style={{ width: 84, textAlign: "right" }}>涨跌</th>}
            {sparkline && <th style={{ width: 104, textAlign: "center" }}>走势</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <tr key={`${it.bvid}-${it.rank}`} className={rankClass(it.rank)}>
              <td className="rank-no">{it.rank}</td>
              <td className="song-cell">
                <Link to={`/song/${it.bvid}`}>
                  <span className="t">{it.title}</span>
                  {it.title_cn && <span className="t-cn">{it.title_cn}</span>}
                </Link>
              </td>
              <td className="num">{it.producers?.map((p) => p.name).join(" / ") ?? "—"}</td>
              <td className="num">{it.vocalists?.map((v) => v.name).join(" / ") ?? "—"}</td>
              {showStats && (
                <>
                  {hasView && <td className="num">{fmt(it.view)}</td>}
                  <td className="num">{fmt(it.favorite)}</td>
                  <td className="num">{fmt(it.coin)}</td>
                  <td className="num">{fmt(it.like)}</td>
                </>
              )}
              <td className="score-cell">
                {fmtScore(it.score)}
              </td>
              {showRate && (
                <td style={{ textAlign: "right" }}><Rate rate={it.rate} /></td>
              )}
              {sparkline && (
                <td style={{ padding: "4px 8px", textAlign: "center" }}>
                  {sparkMap[it.bvid] ? (
                    <Sparkline data={sparkMap[it.bvid] ?? []} />
                  ) : (
                    <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** 行内迷你排名走势：低排名在上方（逆袭/衰退一目了然），颜色按窗口首尾变化着色。 */
export function Sparkline({ data }: { data: (number | null)[] }) {
  const { theme } = useTheme()
  const pts = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 2) {
    return <span style={{ color: "var(--text-faint)", fontSize: 11 }}>—</span>
  }
  const W = 92
  const H = 22
  const pad = 2
  const maxR = Math.max(...pts.map((p) => p.v), 10)
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
  const color = flat
    ? theme === "dark"
      ? "#7d8aa5"
      : "#6b7589"
    : improved
      ? "#66e39f"
      : "#ff6b6b"
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
