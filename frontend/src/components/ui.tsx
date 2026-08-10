import type { ReactNode } from "react"
import type { RankEntry } from "../lib/types"

export function Spinner({ label = "加载中…", size = 16 }: { label?: string | null; size?: number }) {
  return (
    <div className="loading" style={{ fontSize: size > 16 ? undefined : size }}>
      <div className="spinner" style={{ width: size, height: size, borderWidth: Math.max(2, size / 8) }} />
      {label}
    </div>
  )
}

export function Empty({ label = "暂无数据" }: { label?: string }) {
  return <div className="empty">{label}</div>
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿"
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万"
  return String(Math.round(n))
}

export function fmtScore(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万"
  return String(Math.round(n))
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function rankClass(rank: number): string {
  return rank <= 3 ? `rank-${rank}` : ""
}

export function Rate({ rate }: { rate?: string | null }) {
  if (!rate || rate === "—") return <span className="rate-flat">—</span>
  const up = rate.startsWith("+")
  return <span className={up ? "rate-up" : "rate-down"}>{rate}</span>
}

/** 渲染 P主 / 歌姬 列表 */
export function People({ people }: {
  people?: { name: string; url?: string | null }[] | null
}) {
  if (!people || people.length === 0) return <span className="text-faint">—</span>
  return (
    <span className="meta">
      {people.map((p, i) => (
        <span key={i}>
          {i > 0 && " / "}
          <b>{p.name}</b>
        </span>
      ))}
    </span>
  )
}

/** 期次选择器 */
export function ChipRow({ issues, value, onChange }: {
  issues: { issue: string; date?: string; entries?: number }[]
  value: string
  onChange: (issue: string) => void
  max?: number
}) {
  return (
    <div className="chips">
      {issues.map((iss) => (
        <button
          key={iss.issue}
          className={`chip${iss.issue === value ? " active" : ""}`}
          onClick={() => onChange(iss.issue)}
          title={iss.date ?? undefined}
        >
          {iss.issue}
        </button>
      ))}
    </div>
  )
}

export function BoardLegend({ children }: { children?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--text-faint)", marginBottom: 12 }}>
      <span><span style={{ color: "var(--gold)" }}>■</span> 冠军 · 2/3名</span>
      <span><span style={{ color: "var(--accent)" }}>◆</span> 本周新上榜</span>
      <span>↕ 较上周排名变化</span>
      {children}
    </div>
  )
}

/** 触发浏览器下载（内存 Blob，不落盘） */
export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 将二维数据导出为 CSV（带 BOM，Excel 中文不乱码） */
export function downloadCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const esc = (v: string | number) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n")
  downloadBlob(filename + ".csv", "﻿" + csv, "text/csv;charset=utf-8")
}

export function downloadJSON(data: unknown, filename: string) {
  downloadBlob(filename + ".json", JSON.stringify(data, null, 2), "application/json")
}

/** 把 RankEntry 列表转成可导出行（当前展示顺序） */
export function rankItemsToExport(items: RankEntry[]) {
  const headers = ["排名", "bvid", "标题", "中文名", "P主", "歌姬", "播放", "收藏", "硬币", "点赞", "得分", "涨跌", "上榜周数"]
  const rows = items.map((it) => [
    it.rank,
    it.bvid,
    it.title,
    it.title_cn ?? "",
    (it.producers ?? []).map((p) => p.name).join("/"),
    (it.vocalists ?? []).map((v) => v.name).join("/"),
    it.view,
    it.favorite,
    it.coin,
    it.like,
    it.score,
    it.rate ?? "",
    it.weeks_on_board ?? "",
  ])
  return { headers, rows }
}