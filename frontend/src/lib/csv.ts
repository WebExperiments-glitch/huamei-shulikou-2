/**
 * 通用数据导出工具：CSV / JSON / Markdown。
 *
 * 设计要点：
 * 1. CSV 输出带 UTF-8 BOM，Excel 直接双击不会中文乱码。
 * 2. 转义遵循 RFC 4180（双引号包裹 + 双写引号），换行统一 CRLF。
 * 3. 防 CSV 注入：以 = + - @ 开头的单元格前置单引号，避免 Excel 当公式执行。
 * 4. 纯客户端生成，不额外占用后端带宽。
 */

export type CsvValue = string | number | boolean | null | undefined

/** 列定义：key 用于 JSON 键名，label 用于表头，get 取值 */
export interface ExportColumn<T> {
  key: string
  label: string
  get: (row: T) => CsvValue
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function escapeCsvCell(v: CsvValue): string {
  if (v == null) return ""
  const raw = String(v)
  const safe = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCSV<T>(rows: T[], cols: ExportColumn<T>[]): string {
  const head = cols.map((c) => escapeCsvCell(c.label)).join(",")
  const body = rows.map((r) => cols.map((c) => escapeCsvCell(c.get(r))).join(","))
  return [head, ...body].join("\r\n")
}

export function toJSONText<T>(rows: T[], cols: ExportColumn<T>[]): string {
  const objs = rows.map((r) => {
    const o: Record<string, CsvValue> = {}
    for (const c of cols) o[c.key] = c.get(r)
    return o
  })
  return JSON.stringify(objs, null, 2)
}

export function toMarkdown<T>(rows: T[], cols: ExportColumn<T>[]): string {
  const esc = (v: CsvValue) => (v == null ? "" : String(v).replace(/\|/g, "\\|"))
  const head = `| ${cols.map((c) => esc(c.label)).join(" | ")} |`
  const sep = `| ${cols.map(() => "---").join(" | ")} |`
  const body = rows.map((r) => `| ${cols.map((c) => esc(c.get(r))).join(" | ")} |`)
  return [head, sep, ...body].join("\n")
}

export type ExportFormat = "csv" | "json" | "md"

export function serialize<T>(rows: T[], cols: ExportColumn<T>[], fmt: ExportFormat): string {
  if (fmt === "json") return toJSONText(rows, cols)
  if (fmt === "md") return toMarkdown(rows, cols)
  return toCSV(rows, cols)
}

const MIME: Record<ExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  md: "text/markdown;charset=utf-8",
}

/** 取某格式的 MIME 类型。 */
export function mimeFor(fmt: ExportFormat): string {
  return MIME[fmt]
}

/** 触发浏览器下载。CSV 自动加 BOM。 */
export function downloadText(filename: string, text: string, fmt: ExportFormat): void {
  const payload = fmt === "csv" ? `\uFEFF${text}` : text
  downloadBytes(filename, new TextEncoder().encode(payload), MIME[fmt] ?? "application/octet-stream")
}

/** 触发浏览器下载一段字节（用于后台线程产出的数据 / zip）。 */
export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放，规避部分浏览器下载未开始就回收 URL
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function exportRows<T>(
  basename: string,
  rows: T[],
  cols: ExportColumn<T>[],
  fmt: ExportFormat,
): void {
  downloadText(`${basename}.${fmt}`, serialize(rows, cols, fmt), fmt)
}

/** 生成 20260811-0745 形式的时间戳，用于文件名去重 */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 清洗文件名中的非法字符 */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80)
}

/** 秒级时间戳 → YYYY-MM-DD HH:mm（导出用可读格式） */
export function fmtTime(sec?: number | null): string {
  if (!sec) return ""
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 秒级时间戳 → YYYY-MM-DD */
export function fmtDate(sec?: number | null): string {
  if (!sec) return ""
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 人名数组 → 顿号连接 */
export function joinNames(list?: { name: string }[] | null): string {
  if (!list || list.length === 0) return ""
  return list.map((x) => x.name).join("、")
}
