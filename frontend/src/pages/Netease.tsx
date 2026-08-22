import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button, Input, Modal } from "antd"
import { api } from "../lib/api"
import type { NeteaseItem, NeteaseKind, NeteaseTrack, MusicSource, QQMusicItem } from "../lib/types"
import { Spinner, Empty } from "../components/ui"
import { useNeteasePlayer } from "../lib/neteasePlayer"
import { useToast } from "../lib/toast"
import { Reveal } from "../lib/motion"
import {
  Music2, ExternalLink, Search as SearchIcon, Clock, Flame, Mic2, Disc, ListMusic,
  History, Trash2, ArrowUpDown, Hash, AlertCircle, X, Check, Play, ChevronDown, KeyRound,
} from "lucide-react"

/** 网易云红 / QQ 音乐绿（QQ 品牌主色 #11af52，参考腾讯 CDC 设计规范） */
const THEMES: Record<MusicSource, { primary: string; dark: string; label: string; sub: string; note: string; phTitle: string; phSub: string }> = {
  netease: {
    primary: "#ec4141", dark: "#c20c0c",
    label: "网易云音乐",
    sub: "公开接口 · 单曲 / 歌手 / 专辑 / 歌单 · 播放需登录 Cookie",
    note: "数据来自网易云公开接口。搜索无需登录；播放需登录 Cookie（MUSIC_U），点右上角「配置登录 Cookie」填入即可获取播放地址。播放量接口已关闭，详情以热度 / 评论数为准。",
    phTitle: "探索网易云音乐", phSub: "输入关键词，或点上方热门词开始",
  },
  qqmusic: {
    primary: "#11af52", dark: "#0b8f41",
    label: "QQ音乐",
    sub: "免登录 · 免费歌曲免绿钻直接试听 · VIP 专属歌曲需会员",
    note: "数据来自 QQ 音乐公开接口。免费歌曲可免绿钻直接播放；标注 VIP 的绿钻专属歌曲需会员，页面不做绕过。",
    phTitle: "探索 QQ 音乐", phSub: "输入关键词搜索，免费歌曲免绿钻直接播放",
  },
}

const SOURCES: { key: MusicSource; label: string }[] = [
  { key: "netease", label: "网易云音乐" },
  { key: "qqmusic", label: "QQ音乐" },
]

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

const HISTORY_KEY = "music-search-history"
const SOURCE_KEY = "music-source"

/** 规范化 Cookie 输入：去首尾空格、去分号尾随空格，保留完整串（含多个键值对） */
function normalizeMusicU(raw: string): string {
  return (raw || "").trim()
}

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
function externalUrl(it: NeteaseItem) {
  if (it.source === "qqmusic") return `https://y.qq.com/n/ryqq/songDetail/${it.id}`
  const path: Record<string, string> = {
    song: "song", artist: "artist", album: "album", playlist: "playlist",
  }
  return `https://music.163.com/#/${path[it.kind] ?? "search"}?id=${it.id}`
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
    source: it.source ?? "netease",
    mid: it.mid,
    vip: it.vip,
  }
}
/** QQ 搜索结果 → 统一卡片结构（id 为 songmid 字符串） */
function qqToItem(it: QQMusicItem): NeteaseItem {
  return {
    kind: "song",
    id: it.id,
    mid: it.mid,
    name: it.name,
    sub: it.singer,
    album: it.album,
    pic: it.pic,
    duration_ms: it.duration_ms ?? null,
    source: "qqmusic",
    vip: it.vip,
  }
}

export default function Netease() {
  const navigate = useNavigate()
  const player = useNeteasePlayer()
  const [source, setSource] = useState<MusicSource>(() => {
    const saved = localStorage.getItem(SOURCE_KEY)
    return saved === "qqmusic" ? "qqmusic" : "netease"
  })
  const theme = THEMES[source]
  const [kw, setKw] = useState("")
  const [type, setType] = useState<NeteaseKind>("song")
  const [items, setItems] = useState<NeteaseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [sort, setSort] = useState<"default" | "pop" | "name">("default")
  const [copied, setCopied] = useState<string | null>(null)
  const [srcOpen, setSrcOpen] = useState(false)
  const srcRef = useRef<HTMLDivElement>(null)
  // 网易云需登录 Cookie（MUSIC_U）才能获取播放地址：页面内配置
  const [cookieModalOpen, setCookieModalOpen] = useState(false)
  const [musicU, setMusicU] = useState("")
  const [cookieConfigured, setCookieConfigured] = useState(false)
  const [loadingCookie, setLoadingCookie] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (source !== "netease") return
    api.neteaseCookie()
      .then((res) => { setMusicU(res.music_u); setCookieConfigured(res.configured) })
      .catch(() => {})
  }, [source])

  const handleSaveCookie = async () => {
    setLoadingCookie(true)
    try {
      const normalized = normalizeMusicU(musicU)
      const res = await api.neteaseSetCookie(normalized)
      setMusicU(res.music_u)
      setCookieConfigured(res.configured)
      toast(normalized ? "Cookie 保存成功" : "已清除 Cookie", "success")
      setCookieModalOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败", "error")
    } finally {
      setLoadingCookie(false)
    }
  }

  // 数据源下拉：点击外部 / 按 Esc 关闭，避免它一直悬浮在所有内容上方
  useEffect(() => {
    if (!srcOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (srcRef.current && !srcRef.current.contains(e.target as Node)) setSrcOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSrcOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [srcOpen])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${HISTORY_KEY}-${source}`)
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [source])

  function saveHistory(keyword: string) {
    if (!keyword.trim()) return
    setHistory((prev) => {
      const next = [keyword.trim(), ...prev.filter((h) => h !== keyword.trim())].slice(0, 12)
      try { localStorage.setItem(`${HISTORY_KEY}-${source}`, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  function clearHistory() {
    setHistory([])
    try { localStorage.removeItem(`${HISTORY_KEY}-${source}`) } catch { /* ignore */ }
  }
  function runSearch(keyword: string) {
    const k = keyword.trim()
    if (!k) return
    setLoading(true); setError(null); setSearched(true)
    setItems([]); saveHistory(k)
    const p = source === "qqmusic"
      ? api.qqmusicSearch(k, 30).then((r) => r.items.map(qqToItem))
      : api.neteaseSearch(k, 30, type).then((r) => r.items)
    p.then((list) => setItems(list))
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); setItems([]) })
      .finally(() => setLoading(false))
  }
  function doSearch() { runSearch(kw) }
  function changeType(t: NeteaseKind) {
    setType(t)
    if (searched && kw.trim()) runSearch(kw)
  }
  function changeSource(next: MusicSource) {
    if (next === source) return
    setSource(next)
    try { localStorage.setItem(SOURCE_KEY, next) } catch { /* ignore */ }
    setItems([]); setError(null); setSearched(false); setKw(""); setSort("default")
  }
  function openItem(it: NeteaseItem) {
    if (it.source === "qqmusic") {
      // QQ 音乐无详情页：点击卡片直接播放
      player.playTrack(itemToTrack(it))
      return
    }
    navigate(`/netease/${it.kind}/${it.id}`)
  }
  function playItem(it: NeteaseItem) {
    if (it.kind !== "song") return
    const track = itemToTrack(it)
    const isCurrent = player.current && player.current.id === track.id && (player.current.source ?? "netease") === track.source
    if (isCurrent) player.toggle()
    else player.playTrack(track)
  }

  const sortedItems = useMemo(() => {
    if (sort === "default") return items
    const arr = [...items]
    if (sort === "pop") return arr.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
    return arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
  }, [items, sort])

  const typeLabel = TYPES.find((t) => t.key === type)?.label ?? ""
  const unitLabel = source === "qqmusic" ? "单曲" : typeLabel

  return (
    <>
      <style>{css(theme.primary, theme.dark)}</style>
      <div className="ne-page">
        {/* 品牌头部 + 数据源切换 */}
        <Reveal className="ne-reveal-hero">
          <div className="ne-hero">
          <div className="ne-hero-logo"><Music2 size={20} /></div>
          <div className="ne-hero-main">
            <div className="ne-title-row">
              <h1 className="ne-title">{theme.label}</h1>
              <div className="ne-src" ref={srcRef}>
                <button className="ne-src-btn" onClick={() => setSrcOpen((v) => !v)} aria-expanded={srcOpen}>
                  <ChevronDown size={14} /> 切换
                </button>
                {srcOpen && (
                  <div className="ne-src-menu">
                    {SOURCES.map((s) => (
                      <button
                        key={s.key}
                        className={`ne-src-opt${source === s.key ? " active" : ""}`}
                        onClick={() => { changeSource(s.key); setSrcOpen(false) }}
                      >
                        <span className={`ne-src-dot ${s.key}`} /> {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {source === "netease" && (
                <button
                  className={`ne-cookie-btn${cookieConfigured ? " ok" : ""}`}
                  onClick={() => setCookieModalOpen(true)}
                  title={cookieConfigured ? "已配置登录 Cookie，点击可更新" : "网易云需登录才能播放，点击配置 Cookie"}
                >
                  <KeyRound size={13} />
                  {cookieConfigured ? "Cookie 已配置" : "配置登录 Cookie"}
                </button>
              )}
            </div>
            <div className="ne-sub">{theme.sub}</div>
          </div>
        </div>
        </Reveal>

        {/* 搜索区 */}
        <Reveal delay={0.06}>
        <div className="ne-searchbox">
          <div className="ne-search-row">
            <div className="ne-input-wrap">
              <SearchIcon size={16} className="ne-input-icon" />
              <input
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSearch() }}
                placeholder="搜索歌名 / 歌手 / 专辑…"
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

          {source === "netease" && (
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
          )}

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
        </Reveal>

        {/* 说明 */}
        <Reveal delay={0.12}>
        <div className="ne-note">
          <AlertCircle size={13} /> {theme.note}
        </div>
        </Reveal>

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
          <Empty label={`未找到「${kw}」相关${unitLabel}，换个关键词试试`} />
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="ne-toolbar">
              <div className="ne-count"><Hash size={13} /> 共 <b>{items.length}</b> 个{unitLabel}结果</div>
              <div className="ne-sort">
                <ArrowUpDown size={13} />
                <select value={sort} onChange={(e) => setSort(e.target.value as "default" | "pop" | "name")} className="ne-sort-sel">
                  <option value="default">默认排序</option>
                  {source === "netease" && <option value="pop">热度优先</option>}
                  <option value="name">名称排序</option>
                </select>
              </div>
            </div>

            <div className="ne-grid">
              {sortedItems.map((it, i) => (
                <ResultCard
                  key={`${it.source}-${it.kind}-${it.id}`}
                  it={it}
                  index={i}
                  onClick={() => openItem(it)}
                  onPlay={() => playItem(it)}
                  onOpenExternal={(e) => {
                    e.stopPropagation()
                    const url = externalUrl(it)
                    window.open(url, "_blank", "noreferrer")
                    navigator.clipboard?.writeText(url).then(() => {
                      setCopied(`${it.source}-${it.kind}-${it.id}`)
                      setTimeout(() => setCopied(null), 1500)
                    })
                  }}
                  copied={copied === `${it.source}-${it.kind}-${it.id}`}
                />
              ))}
            </div>
          </>
        )}

        {!loading && !searched && (
          <div className="ne-placeholder">
            <div className="ne-ph-icon"><Music2 size={40} /></div>
            <div className="ne-ph-title">{theme.phTitle}</div>
            <div className="ne-ph-sub">{theme.phSub}</div>
          </div>
        )}
      </div>

      <Modal
        open={cookieModalOpen}
        title="网易云 Cookie 配置"
        onCancel={() => setCookieModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCookieModalOpen(false)}>取消</Button>,
          <Button key="save" type="primary" loading={loadingCookie} onClick={handleSaveCookie}>保存</Button>,
        ]}
      >
        <div style={{ marginBottom: 14, backgroundColor: "var(--bg-soft)", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.7 }}>
          <strong>把完整的 Cookie 字符串（记住是完整的）复制到下面输入框，系统会自动识别。</strong>
        </div>
        <p style={{ lineHeight: 1.8, margin: 0 }}>
          <strong>操作步骤：</strong>
        </p>
        <ol style={{ paddingLeft: 20, lineHeight: 2.2, margin: "4px 0 0" }}>
          <li>打开 <a href="https://music.163.com" target="_blank" rel="noreferrer">music.163.com</a> 并<strong>登录</strong>你的账号</li>
          <li>
            按 <code>F12</code> 打开开发者工具 → 切到 <strong>「网络(Network)」</strong> 标签 →
            按 <strong>F5</strong> 刷新页面
          </li>
          <li>
            在下方请求列表里，找到 <strong>第一个</strong> 请求（一般就是 <code>music.163.com</code>）→ 点它 →
            右侧面板找到 <strong>「Request Headers」</strong>→ 找到 <code>Cookie:</code> 这一行
          </li>
          <li>
            右键 <strong>完整的 Cookie 值</strong>（从 <code>MUSIC_U=</code> 开始的一大串）→ 复制
          </li>
          <li>
            粘贴到下方输入框 → 保存
          </li>
        </ol>
        <Input.TextArea
          value={musicU}
          onChange={(e) => setMusicU(e.target.value)}
          placeholder="粘贴完整的 Cookie 字符串（MUSIC_U=xxx; NMTID=xxx; __csrf=xxx; ...）"
          rows={3}
          style={{ marginTop: 14 }}
        />
        <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.6 }}>
          粘贴完整 Cookie 串（含所有键值对），系统自动识别。仅本地保存用于获取播放权限，有效期约 1-2 个月，过期需重新配置。
        </p>
      </Modal>
    </>
  )
}

function ResultCard({
  it, index, onClick, onPlay, onOpenExternal, copied,
}: {
  it: NeteaseItem
  index: number
  onClick: () => void
  onPlay: () => void
  onOpenExternal: (e: React.MouseEvent) => void
  copied: boolean
}) {
  const Icon = it.kind === "artist" ? Mic2 : it.kind === "album" ? Disc : it.kind === "playlist" ? ListMusic : Music2
  const player = useNeteasePlayer()
  const isCurrent = player.current && player.current.id === it.id && (player.current.source ?? "netease") === (it.source ?? "netease")
  return (
    <div className="ne-card" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }} onClick={onClick}>
      <div className="ne-card-pic">
        {it.pic
          ? <img src={it.pic} alt={it.name} className="ne-card-img" loading="lazy" referrerPolicy="no-referrer" />
          : <div className="ne-card-ph"><Icon size={30} /></div>}
        {it.vip ? (
          <span className="ne-badge ne-badge-vip">VIP</span>
        ) : it.source === "qqmusic" && it.kind === "song" ? (
          <span className="ne-badge ne-badge-free">免费</span>
        ) : null}
        {it.kind === "song" && it.duration_ms ? (
          <span className="ne-dur"><Clock size={10} /> {fmtDur(it.duration_ms)}</span>
        ) : null}
        {it.kind === "song" && it.mv_id ? (
          <span className="ne-mv"><Music2 size={10} /> MV</span>
        ) : null}
        {it.kind === "song" && (
          <button
            className="ne-play-fab"
            onClick={(e) => { e.stopPropagation(); onPlay() }}
            title={isCurrent && player.isPlaying ? "暂停" : "播放"}
          >
            {isCurrent && player.isPlaying ? <Music2 size={15} className="npl-bounce" /> : <Play size={15} />}
          </button>
        )}
        <button className="ne-ext" onClick={onOpenExternal} title="在新页面打开">
          {copied ? <Check size={13} /> : <ExternalLink size={13} />}
        </button>
      </div>

      <div className="ne-card-body">
        <div className="ne-card-name" title={it.name}>{it.name}</div>
        {it.kind === "song" && it.alias && it.alias.length > 0 && (
          <div className="ne-card-alias">{it.alias.slice(0, 2).join(" / ")}</div>
        )}
        <div className="ne-card-sub">{it.kind === "song" ? `${it.sub} · 《${it.album ?? ""}》` : it.sub}</div>
        <div className="ne-card-meta">
          {it.kind === "song" && it.pop != null ? (
            <div className="ne-pop">
              <div className="ne-pop-bar"><div className="ne-pop-fill" style={{ width: `${Math.max(0, Math.min(100, it.pop))}%` }} /></div>
              <span>热度 {it.pop}</span>
            </div>
          ) : null}
          {it.kind === "artist" && it.music_size != null && <span className="ne-meta-tag"><Music2 size={11} /> {it.music_size} 首</span>}
          {it.kind === "album" && it.size != null && <span className="ne-meta-tag"><Disc size={11} /> {it.size} 首</span>}
          {it.kind === "playlist" && it.track_count != null && <span className="ne-meta-tag"><ListMusic size={11} /> {it.track_count} 首</span>}
          {it.kind === "playlist" && it.play_count != null && <span className="ne-meta-tag"><Flame size={11} /> {fmtNum(it.play_count)}</span>}
        </div>
      </div>
    </div>
  )
}

const css = (P: string, D: string) => `
.ne-page { max-width: 1100px; margin: 0 auto; padding: 4px 0 90px; }
/* Reveal 容器带 filter 动画，会各自创建堆叠上下文；给 hero 容器提升层级，
   使其整体（含下拉菜单）高于后续的搜索框/说明容器，解决下拉被遮挡 */
.ne-reveal-hero { position: relative; z-index: 20; }
.ne-hero { display:flex; align-items:center; gap:14px; padding: 18px 4px 16px; }
.ne-searchbox { position:relative; z-index:10; }
.ne-note { position:relative; z-index:10; }
.ne-hero-logo { width:46px; height:46px; border-radius:13px; background:linear-gradient(135deg, ${P}, ${D}); display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 6px 18px ${P}59; }
.ne-hero-main { min-width:0; }
.ne-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.ne-title { margin:0; font-size:24px; font-weight:800; letter-spacing:.5px; }
.ne-sub { font-size:12.5px; color:var(--text-dim); margin-top:3px; }
.ne-src { position:relative; }
.ne-src-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; border-radius:10px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); font-size:12px; cursor:pointer; transition:all .14s; }
.ne-src-btn:hover { border-color:${P}; color:${P}; }
.ne-cookie-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; border-radius:10px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); font-size:12px; cursor:pointer; transition:all .14s; }
.ne-cookie-btn:hover { border-color:${P}; color:${P}; }
.ne-cookie-btn.ok { border-color:${P}; color:${P}; background:${P}14; }
.ne-src-menu { position:absolute; top:calc(100% + 6px); left:0; z-index:10; min-width:160px; background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:6px; box-shadow:0 10px 30px rgba(0,0,0,.18); animation:ne-fade-up .18s both; }
.ne-src-opt { display:flex; align-items:center; gap:8px; width:100%; padding:8px 10px; border:none; background:none; color:var(--text); font-size:13px; border-radius:8px; cursor:pointer; }
.ne-src-opt:hover { background:var(--bg-soft); }
.ne-src-opt.active { color:${P}; font-weight:700; }
.ne-src-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.ne-src-dot.netease { background:#ec4141; }
.ne-src-dot.qqmusic { background:#11af52; }
.ne-searchbox { background:var(--bg-card); border:1px solid var(--border); border-radius:18px; padding:18px; }
.ne-search-row { display:flex; gap:10px; flex-wrap:wrap; }
.ne-input-wrap { flex:1; min-width:240px; position:relative; display:flex; align-items:center; }
.ne-input-icon { position:absolute; left:14px; color:var(--text-faint); }
.ne-input { width:100%; padding:12px 38px 12px 40px; border-radius:12px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); font-size:14px; outline:none; transition:border-color .15s, box-shadow .15s; }
.ne-input:focus { border-color:${P}; box-shadow:0 0 0 3px ${P}29; }
.ne-input-clear { position:absolute; right:10px; background:none; border:none; color:var(--text-faint); cursor:pointer; display:flex; padding:4px; }
.ne-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:12px 24px; border-radius:12px; border:none; background:linear-gradient(135deg, ${P}, ${D}); color:#fff; font-weight:700; font-size:14px; cursor:pointer; min-width:96px; }
.ne-btn:disabled { opacity:.7; cursor:default; }
.ne-types { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }
.ne-type-tab { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:20px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); font-size:13px; font-weight:600; cursor:pointer; transition:all .14s; }
.ne-type-tab.active { background:linear-gradient(135deg, ${P}, ${D}); color:#fff; border-color:transparent; }
.ne-chips-row { display:flex; align-items:center; gap:8px; margin-top:13px; flex-wrap:wrap; }
.ne-chips-label { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--text-dim); margin-right:2px; }
.ne-chip { font-size:12.5px; padding:5px 12px; border-radius:20px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); cursor:pointer; transition:all .12s; }
.ne-chip:hover { border-color:${P}; color:${P}; }
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
.ne-card:hover { transform:translateY(-4px); border-color:${P}; box-shadow:0 10px 26px ${P}29; }
.ne-card-pic { width:100%; aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:var(--bg-soft); position:relative; }
.ne-card-img { width:100%; height:100%; object-fit:cover; display:block; }
.ne-card-ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-faint); background:var(--bg-soft); }
.ne-dur { position:absolute; bottom:8px; right:8px; font-size:11px; background:rgba(0,0,0,.62); color:#fff; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:3px; }
.ne-mv { position:absolute; top:8px; right:42px; font-size:11px; background:${P}; color:#fff; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:3px; }
.ne-badge { position:absolute; top:8px; left:8px; font-size:10px; font-weight:700; padding:2px 7px; border-radius:6px; color:#fff; letter-spacing:.5px; }
.ne-badge-vip { background:linear-gradient(135deg, #ff8a00, #f5426c); }
.ne-badge-free { background:linear-gradient(135deg, #11af52, #0b8f41); }
.ne-ext { position:absolute; top:8px; right:8px; width:30px; height:30px; border-radius:9px; border:none; background:rgba(0,0,0,.5); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transform:translateY(-4px); transition:all .16s; }
.ne-card:hover .ne-ext { opacity:1; transform:none; }
.ne-play-fab { position:absolute; bottom:8px; left:8px; width:36px; height:36px; border-radius:50%; border:none; background:linear-gradient(135deg, ${P}, ${D}); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transform:translateY(6px) scale(.9); transition:all .16s; box-shadow:0 4px 14px ${P}66; }
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
.ne-pop-fill { height:100%; background:linear-gradient(90deg, ${P}, #ff8a8a); border-radius:2px; }
.ne-pop span { font-size:10px; color:var(--text-faint); }
.ne-meta-tag { font-size:11px; color:var(--text-faint); display:inline-flex; align-items:center; gap:3px; }
.ne-skel { background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:12px; }
.ne-skel::before { content:""; display:block; width:100%; aspect-ratio:1/1; border-radius:12px; background:linear-gradient(90deg, var(--bg-soft) 25%, var(--bg-elev) 37%, var(--bg-soft) 63%); background-size:400px 100%; animation:ne-shimmer 1.3s infinite; }
.ne-placeholder { margin-top:50px; text-align:center; padding:50px 20px; border:1px dashed var(--border); border-radius:18px; background:var(--bg-card); }
.ne-ph-icon { width:80px; height:80px; margin:0 auto 16px; border-radius:50%; background:linear-gradient(135deg, ${P}24, ${P}0d); display:flex; align-items:center; justify-content:center; color:${P}; }
.ne-ph-title { font-size:16px; font-weight:700; }
.ne-ph-sub { font-size:12.5px; color:var(--text-faint); margin-top:6px; }
@keyframes ne-fade-up { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
@keyframes ne-shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
`
