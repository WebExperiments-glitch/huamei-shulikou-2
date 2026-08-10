import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../lib/api"
import type { NeteaseItem, NeteaseKind, NeteaseTrack } from "../lib/types"
import { Spinner, Empty } from "../components/ui"
import { useNeteasePlayer } from "../lib/neteasePlayer"
import {
  Music2, ExternalLink, Search as SearchIcon, Clock, Flame, Mic2, Disc, ListMusic,
  History, Trash2, ArrowUpDown, Hash, AlertCircle, X, Check, Play,
} from "lucide-react"

const RED = "#ec4141"
const RED_DK = "#c20c0c"

const TYPES: { key: NeteaseKind; label: string; icon: typeof Music2 }[] = [
  { key: "song", label: "单曲", icon: Music2 },
  { key: "artist", label: "歌手", icon: Mic2 },
  { key: "album", label: "专辑", icon: Disc },
  { key: "playlist", label: "歌单", icon: ListMusic },
]

const HOT_SEARCHES = [
  "初音未来", "千本樱", "鳳凰伝", "マトリョシカ", "ロストワンの号哭",
  "ドーナツホール", "神っぽいな", "ダーリンダンス", "ロキ", "エゴロック",
]

const HISTORY_KEY = "netease-search-history"

function fmtDur(ms?: number | null) {
  if (!ms) return "—"
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
function fmtNum(n?: number | null) {
  if (n == null) return "—"
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}000万`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}
function neteaseUrl(kind: string, id: number | string) {
  const path: Record<string, string> = {
    song: "song", artist: "artist", album: "album", playlist: "playlist",
  }
  return `https://music.163.com/#/${path[kind] ?? "search"}?id=${id}`
}
function itemToTrack(it: NeteaseItem): NeteaseTrack {
  return {
    id: it.id,
    name: it.name,
    artists: it.sub ? it.sub.split(" / ").filter(Boolean) : [],
    album: it.album,
    album_id: it.album_id,
    pic: it.pic,
    duration_ms: it.duration_ms,
    pop: it.pop,
    mv_id: it.mv_id,
  }
}

export default function Netease() {
  const navigate = useNavigate()
  const [kw, setKw] = useState("")
  const [type, setType] = useState<NeteaseKind>("song")
  const [items, setItems] = useState<NeteaseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [sort, setSort] = useState<"default" | "pop" | "name">("default")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  function saveHistory(keyword: string) {
    if (!keyword.trim()) return
    setHistory((prev) => {
      const next = [keyword.trim(), ...prev.filter((h) => h !== keyword.trim())].slice(0, 12)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  function clearHistory() {
    setHistory([])
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
  }
  function runSearch(keyword: string, t: NeteaseKind = type) {
    const k = keyword.trim()
    if (!k) return
    setLoading(true); setError(null); setSearched(true)
    setItems([]); saveHistory(k)
    api.neteaseSearch(k, 30, t)
      .then((r) => setItems(r.items))
      .catch((e: any) => { setError(e?.message ?? String(e)); setItems([]) })
      .finally(() => setLoading(false))
  }
  function doSearch() { runSearch(kw) }
  function changeType(t: NeteaseKind) {
    setType(t)
    if (searched && kw.trim()) runSearch(kw, t)
  }
  function openItem(it: NeteaseItem) { navigate(`/netease/${it.kind}/${it.id}`) }

  const sortedItems = useMemo(() => {
    if (sort === "default") return items
    const arr = [...items]
    if (sort === "pop") return arr.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
    return arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
  }, [items, sort])

  const typeLabel = TYPES.find((t) => t.key === type)?.label ?? ""

  return (
    <>
      <style>{css}</style>
      <div className="ne-page">
        {/* 品牌头部 */}
        <div className="ne-hero">
          <div className="ne-hero-logo"><Music2 size={20} /></div>
          <div>
            <h1 className="ne-title">网易云音乐</h1>
            <div className="ne-sub">公开接口 · 无需登录 · 单曲 / 歌手 / 专辑 / 歌单</div>
          </div>
        </div>

        {/* 搜索区 */}
        <div className="ne-searchbox">
          <div className="ne-search-row">
            <div className="ne-input-wrap">
              <SearchIcon size={16} className="ne-input-icon" />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch() }}
                placeholder="搜索歌名 / 歌手 / 专辑 / 歌单…"
                className="ne-input"
              />
              {kw && (
                <button className="ne-input-clear" onClick={() => setKw("")} title="清空">
                  <X size={14} />
                </button>
              )}
            </div>
            <button className="ne-btn" onClick={doSearch} disabled={loading}>
              {loading ? <Spinner size={14} /> : <SearchIcon size={15} />}
              <span>搜索</span>
            </button>
          </div>

          <div className="ne-types">
            {TYPES.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  className={`ne-type-tab${type === t.key ? " active" : ""}`}
                  onClick={() => changeType(t.key)}
                >
                  <Icon size={14} /> {t.label}
                </button>
              )
            })}
          </div>

          <div className="ne-chips-row">
            <span className="ne-chips-label"><Flame size={13} /> 热门</span>
            {HOT_SEARCHES.map((h) => (
              <button key={h} className="ne-chip" onClick={() => { setKw(h); runSearch(h) }}>{h}</button>
            ))}
          </div>

          {history.length > 0 && (
            <div className="ne-chips-row">
              <span className="ne-chips-label"><History size={13} /> 历史</span>
              {history.map((h) => (
                <button key={h} className="ne-chip" onClick={() => { setKw(h); runSearch(h) }}>{h}</button>
              ))}
              <button className="ne-chip ne-chip-del" onClick={clearHistory} title="清空历史"><Trash2 size={12} /></button>
            </div>
          )}
        </div>

        {/* 说明 */}
        <div className="ne-note">
          <AlertCircle size={13} /> 数据来自网易云公开接口。<b>播放量</b>接口已关闭，详情以<b>热度 / 评论数</b>为准；点击卡片查看歌词与曲目。
        </div>

        {error && (
          <div className="ne-banner ne-banner-err">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading && (
          <div className="ne-grid">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="ne-skel" />)}
          </div>
        )}

        {!loading && searched && items.length === 0 && (
          <Empty label={`未找到「${kw}」相关${typeLabel}，试试切换类型或换个关键词`} />
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="ne-toolbar">
              <div className="ne-count"><Hash size={13} /> 共 <b>{items.length}</b> 个{typeLabel}结果</div>
              <div className="ne-sort">
                <ArrowUpDown size={13} />
                <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="ne-sort-sel">
                  <option value="default">默认排序</option>
                  <option value="pop">热度优先</option>
                  <option value="name">名称排序</option>
                </select>
              </div>
            </div>

            <div className="ne-grid">
              {sortedItems.map((it, i) => (
                <ResultCard
                  key={`${it.kind}-${it.id}`}
                  it={it}
                  index={i}
                  onClick={() => openItem(it)}
                  onOpenExternal={(e) => {
                    e.stopPropagation()
                    const url = neteaseUrl(it.kind, it.id)
                    window.open(url, "_blank", "noreferrer")
                    navigator.clipboard?.writeText(url).then(() => {
                      setCopied(`${it.kind}-${it.id}`)
                      setTimeout(() => setCopied(null), 1500)
                    })
                  }}
                  copied={copied === `${it.kind}-${it.id}`}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !searched && (
          <div className="ne-placeholder">
            <div className="ne-ph-icon"><Music2 size={40} /></div>
            <div className="ne-ph-title">探索网易云音乐</div>
            <div className="ne-ph-sub">输入关键词，或点上方热门词开始</div>
          </div>
        )}
      </div>
    </>
  )
}

function ResultCard({
  it, index, onClick, onOpenExternal, copied,
}: {
  it: NeteaseItem
  index: number
  onClick: () => void
  onOpenExternal: (e: React.MouseEvent) => void
  copied: boolean
}) {
  const Icon = it.kind === "artist" ? Mic2 : it.kind === "album" ? Disc : it.kind === "playlist" ? ListMusic : Music2
  const player = useNeteasePlayer()
  const isCurrent = player.current?.id === it.id && it.kind === "song"
  return (
    <div className="ne-card" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }} onClick={onClick}>
      <div className="ne-card-pic">
        {it.pic
          ? <img src={it.pic} alt={it.name} className="ne-card-img" loading="lazy" />
          : <div className="ne-card-ph"><Icon size={30} /></div>}
        {it.kind === "song" && it.duration_ms ? (
          <span className="ne-dur"><Clock size={10} /> {fmtDur(it.duration_ms)}</span>
        ) : null}
        {it.kind === "song" && it.mv_id ? (
          <span className="ne-mv"><Music2 size={10} /> MV</span>
        ) : null}
        {it.kind === "song" && (
          <button
            className="ne-play-fab"
            onClick={(e) => {
              e.stopPropagation()
              if (isCurrent) player.toggle()
              else player.playTrack(itemToTrack(it))
            }}
            title={isCurrent && player.isPlaying ? "暂停" : "播放"}
          >
            {isCurrent && player.isPlaying ? <Music2 size={15} className="npl-bounce" /> : <Play size={15} />}
          </button>
        )}
        <button className="ne-ext" onClick={onOpenExternal} title="在网易云打开">
          {copied ? <Check size={13} /> : <ExternalLink size={13} />}
        </button>
      </div>

      <div className="ne-card-body">
        <div className="ne-card-name" title={it.name}>{it.name}</div>
        {it.kind === "song" && it.alias && it.alias.length > 0 && (
          <div className="ne-card-alias">{it.alias.slice(0, 2).join(" / ")}</div>
        )}
        <div className="ne-card-sub">{it.kind === "song" ? `${it.sub} · 《${it.album}》` : it.sub}</div>
        <div className="ne-card-meta">
          {it.kind === "song" && it.pop != null && (
            <div className="ne-pop">
              <div className="ne-pop-bar"><div className="ne-pop-fill" style={{ width: `${Math.max(0, Math.min(100, it.pop))}%` }} /></div>
              <span>热度 {it.pop}</span>
            </div>
          )}
          {it.kind === "artist" && it.music_size != null && <span className="ne-meta-tag"><Music2 size={11} /> {it.music_size} 首</span>}
          {it.kind === "album" && it.size != null && <span className="ne-meta-tag"><Disc size={11} /> {it.size} 首</span>}
          {it.kind === "playlist" && it.track_count != null && <span className="ne-meta-tag"><ListMusic size={11} /> {it.track_count} 首</span>}
          {it.kind === "playlist" && it.play_count != null && <span className="ne-meta-tag"><Flame size={11} /> {fmtNum(it.play_count)}</span>}
        </div>
      </div>
    </div>
  )
}

const css = `
.ne-page { max-width: 1100px; margin: 0 auto; padding: 4px 0 90px; }
.ne-hero { display:flex; align-items:center; gap:14px; padding: 18px 4px 16px; }
.ne-hero-logo { width:46px; height:46px; border-radius:13px; background:linear-gradient(135deg, ${RED}, ${RED_DK}); display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 6px 18px rgba(236,65,65,.35); }
.ne-title { margin:0; font-size:24px; font-weight:800; letter-spacing:.5px; }
.ne-sub { font-size:12.5px; color:var(--text-dim); margin-top:3px; }
.ne-searchbox { background:var(--bg-card); border:1px solid var(--border); border-radius:18px; padding:18px; }
.ne-search-row { display:flex; gap:10px; flex-wrap:wrap; }
.ne-input-wrap { flex:1; min-width:240px; position:relative; display:flex; align-items:center; }
.ne-input-icon { position:absolute; left:14px; color:var(--text-faint); }
.ne-input { width:100%; padding:12px 38px 12px 40px; border-radius:12px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); font-size:14px; outline:none; transition:border-color .15s, box-shadow .15s; }
.ne-input:focus { border-color:${RED}; box-shadow:0 0 0 3px rgba(236,65,65,.16); }
.ne-input-clear { position:absolute; right:10px; background:none; border:none; color:var(--text-faint); cursor:pointer; display:flex; padding:4px; }
.ne-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:12px 24px; border-radius:12px; border:none; background:linear-gradient(135deg, ${RED}, ${RED_DK}); color:#fff; font-weight:700; font-size:14px; cursor:pointer; min-width:96px; }
.ne-btn:disabled { opacity:.7; cursor:default; }
.ne-types { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
.ne-type-tab { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:20px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); font-size:13px; font-weight:600; cursor:pointer; transition:all .14s; }
.ne-type-tab.active { background:linear-gradient(135deg, ${RED}, ${RED_DK}); color:#fff; border-color:transparent; }
.ne-chips-row { display:flex; align-items:center; gap:8px; margin-top:13px; flex-wrap:wrap; }
.ne-chips-label { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--text-dim); margin-right:2px; }
.ne-chip { font-size:12.5px; padding:5px 12px; border-radius:20px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); cursor:pointer; transition:all .12s; }
.ne-chip:hover { border-color:${RED}; color:${RED}; }
.ne-chip-del { color:var(--danger); padding:5px 8px; }
.ne-note { font-size:12.5px; color:var(--text-dim); margin:14px 4px 16px; line-height:1.6; display:flex; align-items:flex-start; gap:6px; }
.ne-note svg { flex-shrink:0; margin-top:2px; }
.ne-banner { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:12px; font-size:13px; margin-bottom:16px; }
.ne-banner-err { background:color-mix(in srgb, var(--danger) 12%, transparent); color:var(--danger); }
.ne-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px; }
.ne-count { font-size:13px; color:var(--text-dim); display:inline-flex; align-items:center; gap:7px; }
.ne-count b { color:var(--text); }
.ne-sort { display:inline-flex; align-items:center; gap:7px; color:var(--text-dim); }
.ne-sort-sel { padding:6px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); font-size:12.5px; cursor:pointer; }
.ne-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:14px; }
.ne-card { background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:12px; cursor:pointer; animation:ne-fade-up .4s both; transition:transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s, border-color .16s; }
.ne-card:hover { transform:translateY(-4px); border-color:${RED}; box-shadow:0 10px 26px rgba(236,65,65,.16); }
.ne-card-pic { width:100%; aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:var(--bg-soft); position:relative; }
.ne-card-img { width:100%; height:100%; object-fit:cover; display:block; }
.ne-card-ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-faint); background:var(--bg-soft); }
.ne-dur { position:absolute; bottom:8px; right:8px; font-size:11px; background:rgba(0,0,0,.62); color:#fff; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:3px; }
.ne-mv { position:absolute; top:8px; left:8px; font-size:11px; background:${RED}; color:#fff; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:3px; }
.ne-ext { position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:9px; border:none; background:rgba(0,0,0,.5); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transform:translateY(-4px); transition:all .16s; }
.ne-card:hover .ne-ext { opacity:1; transform:none; }
.ne-play-fab { position:absolute; bottom:8px; left:8px; width:36px; height:36px; border-radius:50%; border:none; background:linear-gradient(135deg, ${RED}, ${RED_DK}); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transform:translateY(6px) scale(.9); transition:all .16s; box-shadow:0 4px 14px rgba(236,65,65,.4); }
.ne-card:hover .ne-play-fab { opacity:1; transform:none; }
.ne-play-fab:hover { filter:brightness(1.1); }
.npl-bounce { animation: npl-bounce 1s ease-in-out infinite; }
@keyframes npl-bounce { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }
.ne-card-body { margin-top:10px; }
.ne-card-name { font-weight:700; font-size:14px; line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ne-card-alias { font-size:11px; color:var(--text-faint); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ne-card-sub { font-size:12px; color:var(--text-dim); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ne-card-meta { margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ne-pop { flex:1; min-width:64px; }
.ne-pop-bar { height:4px; background:var(--bg-soft); border-radius:2px; overflow:hidden; }
.ne-pop-fill { height:100%; background:linear-gradient(90deg, ${RED}, #ff8a8a); border-radius:2px; }
.ne-pop span { font-size:10px; color:var(--text-faint); }
.ne-meta-tag { font-size:11px; color:var(--text-faint); display:inline-flex; align-items:center; gap:3px; }
.ne-skel { background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:12px; }
.ne-skel::before { content:""; display:block; width:100%; aspect-ratio:1/1; border-radius:12px; background:linear-gradient(90deg, var(--bg-soft) 25%, var(--bg-elev) 37%, var(--bg-soft) 63%); background-size:400px 100%; animation:ne-shimmer 1.3s infinite; }
.ne-placeholder { margin-top:50px; text-align:center; padding:50px 20px; border:1px dashed var(--border); border-radius:18px; background:var(--bg-card); }
.ne-ph-icon { width:80px; height:80px; margin:0 auto 16px; border-radius:50%; background:linear-gradient(135deg, rgba(236,65,65,.14), rgba(236,65,65,.05)); display:flex; align-items:center; justify-content:center; color:${RED}; }
.ne-ph-title { font-size:16px; font-weight:700; }
.ne-ph-sub { font-size:12.5px; color:var(--text-faint); margin-top:6px; }
@keyframes ne-fade-up { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes ne-shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
`
