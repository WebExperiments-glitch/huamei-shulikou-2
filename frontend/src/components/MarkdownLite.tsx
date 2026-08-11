import { Fragment, type ReactNode } from "react"

// 轻量 Markdown 渲染：支持 #/##/### 标题、-/* 无序列表、1. 有序列表、**加粗**、
// Markdown 表格、行内换行。足以呈现本地大模型的中文分析输出，零依赖。
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<strong key={k++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function isPipeRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function parseTableRows(rows: string[]): string[][] {
  return rows.map((row) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim().replace(/^\s*`?\s*/g, "")),
  )
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n")
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    // 标题
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1]!.length
      const cls = level === 1 ? "md-h1" : level === 2 ? "md-h2" : "md-h3"
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(h[2]!)}
        </div>,
      )
      i++
      continue
    }
    // Markdown 表格（连续 | 行，第 2 行为 --- 分隔线）
    if (isPipeRow(line) && i + 1 < lines.length && /^\s*\|[\s:\-|]+\|\s*$/.test(lines[i + 1]!)) {
      const rows: string[] = []
      while (i < lines.length && isPipeRow(lines[i]!)) {
        rows.push(lines[i]!)
        i++
      }
      const parsed = parseTableRows(rows.slice(0, 2)).concat(parseTableRows(rows.slice(2)))
      const [header, ...body] = parsed
      blocks.push(
        <div key={key++} className="md-table-wrap">
          <table className="md-table">
            {header && (
              <thead>
                <tr>
                  {header.map((c, idx) => (
                    <th key={idx}>{renderInline(c)}</th>
                  ))}
                </tr>
              </thead>
            )}
            {body.length > 0 && (
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((c, ci) => (
                      <td key={ci}>{renderInline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>,
      )
      continue
    }
    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ""))
        i++
      }
      blocks.push(
        <ul key={key++} className="md-ul">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      )
      continue
    }
    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push(
        <ol key={key++} className="md-ol">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>,
      )
      continue
    }
    // 普通段落（合并连续非空、非列表行）
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s)/.test(lines[i]!) &&
      !isPipeRow(lines[i]!)
    ) {
      para.push(lines[i]!)
      i++
    }
    blocks.push(
      <p key={key++} className="md-p">
        {para.map((p, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(p)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <div className="md">{blocks}</div>
}
