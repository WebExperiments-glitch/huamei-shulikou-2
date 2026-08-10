/** 通用展示格式化 + 分档工具，供年度回顾 / 时间线 / 详情页复用 */

export function fmtInt(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—"
  return Math.round(n).toLocaleString("en-US")
}

/** 大数显示为 万 / 亿 */
export function fmtWan(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—"
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿"
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k"
  return String(Math.round(n))
}

export interface Tier {
  key: "myth" | "legend" | "hall" | ""
  label: string
  cls: string
}

/** 按播放量分档：神话 ≥1000万 / 传说 ≥100万 / 殿堂 ≥10万 */
export function tierOf(view?: number | null): Tier {
  if (view == null) return { key: "", label: "", cls: "" }
  if (view >= 1e7) return { key: "myth", label: "神话曲", cls: "tag-myth" }
  if (view >= 1e6) return { key: "legend", label: "传说曲", cls: "tag-legend" }
  if (view >= 1e5) return { key: "hall", label: "殿堂曲", cls: "tag-hall" }
  return { key: "", label: "", cls: "" }
}

/** 安全取指标（兼容 view/views 等别名） */
export function pick(
  o: Record<string, any>,
  ...keys: string[]
): number | undefined {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "number" && !Number.isNaN(v)) return v
  }
  return undefined
}
