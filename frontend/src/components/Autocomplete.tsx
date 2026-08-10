import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"

export interface Suggestion {
  /** 选中后回填到输入框的值 */
  value: string
  /** 主显示文本 */
  label: string
  /** 次要文本（如中文名 / 参与歌曲数） */
  sublabel?: string
  /** 透传的任意数据（如 bvid） */
  meta?: unknown
}

interface Props {
  value: string
  onChange: (v: string) => void
  fetchSuggestions: (q: string) => Promise<Suggestion[]>
  onSelectItem?: (item: Suggestion) => void
  /** 无选中项时回车提交（如直接搜索） */
  onCommit?: (v: string) => void
  placeholder?: string
  debounceMs?: number
}

export function Autocomplete({
  value,
  onChange,
  fetchSuggestions,
  onSelectItem,
  onCommit,
  placeholder,
  debounceMs = 180,
}: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  // 输入变化 → 防抖拉取联想
  useEffect(() => {
    const q = value.trim()
    if (!q) {
      setItems([])
      setOpen(false)
      return
    }
    const id = ++reqId.current
    const t = setTimeout(() => {
      fetchSuggestions(q)
        .then((res) => {
          if (id === reqId.current) {
            setItems(res)
            setActive(-1)
            setOpen(res.length > 0)
          }
        })
        .catch(() => {
          if (id === reqId.current) setItems([])
        })
    }, debounceMs)
    return () => clearTimeout(t)
  }, [value, debounceMs, fetchSuggestions])

  // 点击外部关闭
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  function pick(item: Suggestion) {
    onChange(item.value)
    onSelectItem?.(item)
    setOpen(false)
    setItems([])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      if (open && active >= 0 && items[active]) {
        e.preventDefault()
        pick(items[active])
      } else {
        onCommit?.(value)
        setOpen(false)
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="ac" ref={boxRef}>
      <div className="ac-input">
        <Search size={16} style={{ color: "var(--text-faint)" }} />
        <input
          type="text"
          className="kw"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && items.length > 0 && (
        <ul className="ac-list">
          {items.map((it, i) => (
            <li
              key={it.value + i}
              className={"ac-item" + (i === active ? " active" : "")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(it)
              }}
            >
              <span className="ac-label">{it.label}</span>
              {it.sublabel && <span className="ac-sub">{it.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
