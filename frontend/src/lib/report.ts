import type { ArtistStat, RankEntry } from "./types"

/** 周报所需聚合数据（由页面从现有 API 组装） */
export interface ReportData {
  issue: string
  date: string
  board_count: number
  tier_counts: { myth: number; legend: number; hall: number }
  top: RankEntry[]                 // 本期榜单（已按 rank 排序）
  surges: { gain: number; prev_rank: number; rank: number; title: string }[]
  newcomers: { rank: number; title: string }[]
  artists: ArtistStat[]            // 按上榜歌曲数降序
  vocalists: ArtistStat[]
}

const VIEW_COLS: (keyof RankEntry)[] = ["view", "favorite", "coin", "like", "share"]

function fmtBig(n: number): string {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿"
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万"
  return String(n)
}

/** 聚合单曲的累计播放/点赞等（取整首合计，用于海报展示） */
export function songTotals(it: RankEntry) {
  return { view: it.view ?? 0, like: it.like ?? 0 }
}

/** 生成 Markdown 周报文本 */
export function buildMarkdown(d: ReportData): string {
  const lines: string[] = []
  const label = `术力口周榜 · 周报 ${d.issue}`
  lines.push(`# ${label}`, "")
  lines.push(`> 数据日期：${d.date} · 上榜歌曲 ${d.board_count} 首`, "")

  lines.push("## 本期概览", "")
  lines.push(`- 上榜歌曲：**${d.board_count}** 首`)
  lines.push(`- 曲库累计：神话曲 **${d.tier_counts.myth}** / 传说曲 **${d.tier_counts.legend}** / 殿堂曲 **${d.tier_counts.hall}**`)
  const avg = d.top.reduce((s, it) => s + (it.view ?? 0), 0) / Math.max(1, d.top.length)
  lines.push(`- Top${d.top.length} 平均播放：**${fmtBig(avg)}**`)
  lines.push("")

  lines.push("## 本期 Top 10", "")
  lines.push("| 排名 | 歌曲 | P主 | 歌姬 | 播放 | 得分 |")
  lines.push("| --- | --- | --- | --- | --- | --- |")
  for (const it of d.top.slice(0, 10)) {
    const prod = (it.producers ?? []).map((p) => p.name).join("/") || "—"
    const voc = (it.vocalists ?? []).map((v) => v.name).join("/") || "—"
    lines.push(`| ${it.rank} | ${it.title} | ${prod} | ${voc} | ${fmtBig(it.view ?? 0)} | ${it.score ?? 0} |`)
  }
  lines.push("")

  if (d.newcomers.length) {
    lines.push("## 新曲首秀", "")
    lines.push(`本期共有 **${d.newcomers.length}** 首新曲首次上榜：`)
    lines.push(d.newcomers.map((n) => `- #${n.rank} ${n.title}`).join("\n"), "")
  }

  if (d.surges.length) {
    lines.push("## 排名突进", "")
    lines.push(`本期较上期名次上升最猛的歌曲（前 ${d.surges.length}）：`)
    lines.push(d.surges.map((s) => `- **+${s.gain}** #${s.prev_rank}→#${s.rank} ${s.title}`).join("\n"), "")
  }

  lines.push("## P主 上榜榜 Top 10", "")
  lines.push("| P主 | 上榜歌曲 |")
  lines.push("| --- | --- |")
  for (const a of d.artists.slice(0, 10)) lines.push(`| ${a.name} | ${a.songs} |`)
  lines.push("")

  lines.push("## 歌姬 上榜榜 Top 10", "")
  lines.push("| 歌姬 | 上榜歌曲 |")
  lines.push("| --- | --- |")
  for (const a of d.vocalists.slice(0, 10)) lines.push(`| ${a.name} | ${a.songs} |`)
  lines.push("")

  lines.push("---", "")
  lines.push(`*由 huamei术力口 自动生成 · ${new Date().toLocaleString("zh-CN")}*`, "")
  return lines.join("\n")
}

/* ---------------- 海报（Canvas 合成） ---------------- */

const W = 900
const H = 1500

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawImageCover(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, w: number, h: number) {
  const img = new Image()
  img.src = url
  ctx.drawImage(img, x, y, w, h)
}

/** 合成 900×1500 海报。chartURLs: [Top10 得分图, P主 分布图] */
export function buildPoster(
  d: ReportData,
  chartURLs: [string | null, string | null],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, "#0b1b33")
  bg.addColorStop(0.5, "#0a1426")
  bg.addColorStop(1, "#120a26")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 顶部装饰线
  ctx.fillStyle = "#3b63d9"
  ctx.fillRect(0, 0, W, 6)

  // 标题
  ctx.fillStyle = "#ffffff"
  ctx.font = "700 40px sans-serif"
  ctx.textAlign = "left"
  ctx.fillText("术力口周榜 · 周报", 48, 86)
  ctx.font = "700 30px sans-serif"
  ctx.fillStyle = "#ffd166"
  ctx.fillText(d.issue, 48, 128)
  ctx.font = "16px sans-serif"
  ctx.fillStyle = "#9fb6d4"
  ctx.fillText(`数据日期 ${d.date} · 上榜 ${d.board_count} 首`, 48, 160)

  // KPI 横条
  const kpis = [
    { k: "神话曲", v: d.tier_counts.myth, c: "#c26bff" },
    { k: "传说曲", v: d.tier_counts.legend, c: "#ffd166" },
    { k: "殿堂曲", v: d.tier_counts.hall, c: "#4fc3f7" },
  ]
  let kx = 48
  for (const k of kpis) {
    ctx.fillStyle = "#10203a"
    roundedRect(ctx, kx, 188, 256, 74, 14)
    ctx.fill()
    ctx.fillStyle = k.c
    ctx.font = "700 24px sans-serif"
    ctx.fillText(String(k.v), kx + 16, 226)
    ctx.fillStyle = "#9fb6d4"
    ctx.font = "14px sans-serif"
    ctx.fillText(k.k, kx + 16, 250)
    kx += 272
  }

  // Top 5 榜单
  ctx.fillStyle = "#ffffff"
  ctx.font = "700 22px sans-serif"
  ctx.fillText("本期 Top 5", 48, 316)
  let ty = 340
  d.top.slice(0, 5).forEach((it, i) => {
    const colors = ["#ffd166", "#c9d7f0", "#ff9e5e", "#8fb3d0", "#8fb3d0"]
    ctx.fillStyle = "#14243f"
    roundedRect(ctx, 48, ty, 804, 108, 12)
    ctx.fill()
    ctx.fillStyle = colors[i] ?? "#8fb3d0"
    ctx.font = "700 30px sans-serif"
    ctx.fillText(`#${it.rank}`, 72, ty + 42)
    ctx.fillStyle = "#ffffff"
    ctx.font = "600 20px sans-serif"
    ctx.textAlign = "left"
    const title = it.title.length > 22 ? it.title.slice(0, 22) + "…" : it.title
    ctx.fillText(title, 128, ty + 40)
    ctx.fillStyle = "#8fb3d0"
    ctx.font = "14px sans-serif"
    const prod = (it.producers ?? []).map((p) => p.name).join("/") || "—"
    const voc = (it.vocalists ?? []).map((v) => v.name).join("/") || "—"
    ctx.fillText(`${prod} · ${voc}`, 128, ty + 68)
    ctx.fillStyle = "#ffd166"
    ctx.font = "700 18px sans-serif"
    ctx.fillText(fmtBig(it.view ?? 0), 680, ty + 42)
    ctx.fillStyle = "#8fb3d0"
    ctx.font = "12px sans-serif"
    ctx.fillText("播放", 710, ty + 66)
    ty += 122
  })

  // 图表区
  let cy = ty + 8
  if (chartURLs[0]) {
    drawImageCover(ctx, chartURLs[0], 48, cy, 804, 240)
    cy += 250
  }

  // P主 / 歌姬
  ctx.fillStyle = "#ffffff"
  ctx.font = "700 20px sans-serif"
  ctx.fillText("热门 P主", 48, cy)
  ctx.font = "15px sans-serif"
  ctx.fillStyle = "#c9d7f0"
  let arow = cy + 26
  for (const a of d.artists.slice(0, 4)) {
    ctx.fillText(`${a.name}`, 48, arow)
    ctx.fillStyle = "#ffd166"
    ctx.font = "700 15px sans-serif"
    ctx.fillText(`${a.songs}`, 470, arow)
    ctx.fillStyle = "#8fb3d0"
    ctx.font = "12px sans-serif"
    ctx.fillText("首", 500, arow)
    ctx.fillStyle = "#c9d7f0"
    ctx.font = "15px sans-serif"
    arow += 26
  }

  // 底部品牌
  ctx.fillStyle = "#1b2c4d"
  ctx.fillRect(0, H - 64, W, 64)
  ctx.fillStyle = "#3b63d9"
  ctx.font = "700 16px sans-serif"
  ctx.fillText("huamei术力口", 48, H - 32)
  ctx.fillStyle = "#9fb6d4"
  ctx.font = "13px sans-serif"
  ctx.fillText("VOCALOID CHART · 周榜周报", 220, H - 32)

  return canvas
}

export const VIEW_COLUMNS: { key: keyof RankEntry; label: string }[] = [
  { key: "view", label: "播放" },
  { key: "like", label: "点赞" },
  { key: "coin", label: "硬币" },
  { key: "favorite", label: "收藏" },
  { key: "share", label: "分享" },
]
export { VIEW_COLS, fmtBig }
