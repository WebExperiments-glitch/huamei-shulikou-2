import type { ReactNode } from "react"
import { createElement } from "react"

// 轻量 Markdown 渲染（零依赖）：支持 **加粗** *斜体* `代码` [文本](链接) 与 # 标题 / 列表。
// 用于 AI 聊天消息，避免引入外部 markdown 依赖。

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>)
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key++}>{m[4]}</em>)
    } else if (m[6] !== undefined) {
      nodes.push(<code key={key++}>{m[6]}</code>)
    } else if (m[8] !== undefined) {
      const url = m[9] ?? "#"
      const safe = /^https?:\/\//i.test(url) ? url : "#"
      nodes.push(
        <a key={key++} href={safe} target="_blank" rel="noreferrer">
          {m[8]}
        </a>
      )
    }
    last = pattern.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n")
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === "") {
      i++
      continue
    }
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1]!.length
      blocks.push(createElement(`h${level}`, { key: key++ }, renderInline(h[2]!)))
      i++
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
        <ul key={key++}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
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
        <ol key={key++}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>
      )
      continue
    }
    // 段落
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() !== "") {
      para.push(lines[i]!)
      i++
    }
    blocks.push(<p key={key++}>{renderInline(para.join("\n"))}</p>)
  }

  return <>{blocks}</>
}
