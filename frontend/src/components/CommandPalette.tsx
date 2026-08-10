import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Search, CornerDownLeft } from "lucide-react"
import { api } from "../lib/api"
import { useDebounce } from "../hooks/useDebounce"
import type { Song } from "../lib/types"

interface Cmd {
  id: string
  kind: "song" | "nav"
  label: string
  sub?: string
  to: string
}

const NAV: Cmd[] = [
  { id: "nav-weekly", kind: "nav", label: "周榜", sub: "Biliboard 现行官方周榜", to: "/board/weekly" },
  { id: "nav-legend", kind: "nav", label: "传说曲周榜", sub: "百万播放独立周榜", to: "/board/legend" },
  { id: "nav-annual", kind: "nav", label: "年榜 / 半年榜", to: "/board/annual" },
  { id: "nav-monthly", kind: "nav", label: "月榜（聚合）", to: "/monthly" },
  { id: "nav-daily", kind: "nav", label: "日榜（快照）", to: "/daily" },
  { id: "nav-songs", kind: "nav", label: "歌曲库", sub: "收录池检索", to: "/songs" },
  { id: "nav-compare", kind: "nav", label: "多歌曲对比", to: "/compare" },
  { id: "nav-analytics", kind: "nav", label: "数据分析", to: "/analytics" },
  { id: "nav-hot", kind: "nav", label: "实时热度", sub: "B 站公开 API 实时抓取", to: "/hot" },
]

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounced = useDebounce(query, 220)

  const { data: songs } = useQuery({
    queryKey: ["palette-search", debounced],
    queryFn: () => api.searchSongs({ q: debounced, limit: 10 }),
    enabled: open && debounced.trim().length > 0,
    staleTime: 30_000,
  })

  const list = useMemo<Cmd[]>(() => {
    const songCmds: Cmd[] = (songs?.items ?? []).map((s: Song) => ({
      id: `song-${s.bvid}`,
      kind: "song",
      label: s.title,
      sub: [s.producers?.map((p) => p.name).join("/"), s.vocalists?.map((v) => v.name).join("/")]
        .filter(Boolean)
        .join(" · ") || s.bvid,
      to: `/song/${s.bvid}`,
    }))
    return debounced.trim() ? [...songCmds, ...NAV] : NAV
  }, [songs, debounced])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      // 等待渲染后聚焦
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [debounced])

  if (!open) return null

  const choose = (cmd?: Cmd) => {
    const target = cmd ?? list[active]
    if (!target) return
    navigate(target.to)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(list.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      choose()
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={16} style={{ color: "var(--text-faint)" }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索歌曲 / 歌手，或跳转页面…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list">
          {list.length === 0 && <div className="palette-empty">无匹配结果</div>}
          {list.map((c, i) => (
            <button
              key={c.id}
              className={`palette-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <div className="palette-label">
                {c.kind === "song" ? <span className="tag-mini tag-new">曲</span> : <span className="tag-mini tag-legend">页</span>}
                <span>{c.label}</span>
              </div>
              {c.sub && <div className="palette-sub">{c.sub}</div>}
              {i === active && <CornerDownLeft size={13} className="palette-enter" />}
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
