import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { api } from "../lib/api"
import type {
  NeteaseKind, NeteaseDetail, NeteaseArtistDetail, NeteaseAlbumDetail,
  NeteasePlaylistDetail, NeteaseLyric, NeteaseTrack,
} from "../lib/types"
import { Spinner, fmt, fmtDate } from "../components/ui"
import { useNeteasePlayer } from "../lib/neteasePlayer"
import { AnimatedNumber, TypewriterText } from "../lib/fx"
import {
  Music2, ArrowLeft, ExternalLink, Copy, Check, Clock, Flame, Mic2, Disc, ListMusic,
  Calendar, Building2, Tag, Heart, MessageCircle, AlertCircle, PlayCircle, User, Play, Pause,
} from "lucide-react"

const RED = "#ec4141"
const RED_DK = "#c20c0c"

const KIND_LABEL: Record<string, string> = {
  song: "单曲", artist: "歌手", album: "专辑", playlist: "歌单",
}

function neteaseUrl(kind: string, id: number | string) {
  const path: Record<string, string> = {
    song: "song", artist: "artist", album: "album", playlist: "playlist",
  }
  return `https://music.163.com/#/${path[kind] ?? "search"}?id=${id}`
}
function fmtDur(ms?: number | null) {
  if (!ms) return "—"
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

type DetailData = NeteaseDetail | NeteaseArtistDetail | NeteaseAlbumDetail | NeteasePlaylistDetail

export default function NeteaseDetail() {
  const { kind, id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<DetailData | null>(null)
  const [lyric, setLyric] = useState<NeteaseLyric | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [kind, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") navigate(-1) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  useEffect(() => {
    if (!kind || !id) return
    setData(null); setLyric(null); setError(null); setLoading(true)
    const k = kind as NeteaseKind
    const load = async () => {
      try {
        if (k === "song") {
          const [d, l] = await Promise.all([
            api.neteaseSong(id),
            api.neteaseLyric(id).catch(() => null),
          ])
          setData(d); setLyric(l)
        } else if (k === "artist") {
          setData(await api.neteaseArtist(id))
        } else if (k === "album") {
          setData(await api.neteaseAlbum(id))
        } else if (k === "playlist") {
          setData(await api.neteasePlaylist(id))
        } else {
          setError("未知的内容类型")
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [kind, id])

  const name = data?.name ?? ""
  const openExternal = () => window.open(neteaseUrl(kind!, id!), "_blank", "noreferrer")

  return (
    <>
      <style>{css}</style>
      <div className="ne-d">
        <div className="ne-d-top">
          <button className="ne-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} /> 返回
          </button>
          <div className="ne-crumb">
            <span className="ne-crumb-link" onClick={() => navigate("/netease")}>网易云</span>
            <span className="ne-crumb-sep">/</span>
            <span>{KIND_LABEL[kind ?? ""] ?? "未知"}</span>
            {name && <><span className="ne-crumb-sep">/</span><b className="ne-crumb-name">{name}</b></>}
          </div>
        </div>

        {loading && <div className="ne-d-loading"><Spinner size={22} label="加载中…" /></div>}

        {error && (
          <div className="ne-banner ne-banner-err">
            <AlertCircle size={16} /> {error}
            <button className="ne-retry" onClick={() => navigate(0)}>重试</button>
          </div>
        )}

        {!loading && !error && data && kind === "song" && (
          <SongView data={data as NeteaseDetail} lyric={lyric} onExternal={openExternal} />
        )}
        {!loading && !error && data && kind === "artist" && (
          <ArtistView data={data as NeteaseArtistDetail} />
        )}
        {!loading && !error && data && kind === "album" && (
          <AlbumView data={data as NeteaseAlbumDetail} />
        )}
        {!loading && !error && data && kind === "playlist" && (
          <PlaylistView data={data as NeteasePlaylistDetail} />
        )}
      </div>
    </>
  )
}

/* ---------------- 单曲 ---------------- */
function SongView({
  data, lyric, onExternal,
}: {
  data: NeteaseDetail
  lyric: NeteaseLyric | null
  onExternal: () => void
}) {
  const player = useNeteasePlayer()
  const [copied, setCopied] = useState(false)
  const track: NeteaseTrack = {
    id: data.id, name: data.name, artists: data.artists,
    album: data.album, pic: data.album_pic,
    duration_ms: data.duration_ms, pop: data.pop, mv_id: data.mv_id,
  }
  const isCurrent = player.current?.id === data.id
  const copyLink = () => {
    navigator.clipboard?.writeText(neteaseUrl("song", data.id)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  const stats = [
    { icon: Flame, label: "热度", value: data.pop != null ? `${data.pop} / 100` : "—" },
    { icon: MessageCircle, label: "评论", value: fmt(data.comment_count) },
    { icon: PlayCircle, label: "播放量", value: "网易云未公开" },
    { icon: Clock, label: "时长", value: fmtDur(data.duration_ms) },
  ]
  return (
    <div className="ne-song">
      <div className="ne-song-left">
        <div className="ne-cover-lg" style={{ backgroundImage: data.album_pic ? `url(${data.album_pic})` : undefined }}>
          {!data.album_pic && <Music2 size={56} />}
        </div>
        <h1 className="ne-d-name"><TypewriterText text={data.name} /></h1>
        {data.alias && data.alias.length > 0 && (
          <div className="ne-d-alias">{data.alias.join(" / ")}</div>
        )}
        <div className="ne-d-artists">
          <Mic2 size={14} /> {data.artists?.join(" / ") || "—"}
          {data.album && <span className="ne-d-album"><Disc size={14} /> 《{data.album}》</span>}
        </div>

        {data.pop != null && (
          <div className="ne-pop-block">
            <div className="ne-pop-head"><span>热度指数</span><span>{data.pop} / 100</span></div>
            <div className="ne-pop-bar"><div className="ne-pop-fill" style={{ width: `${Math.max(0, Math.min(100, data.pop))}%` }} /></div>
          </div>
        )}

        <div className="ne-stats">
          {stats.map((s, i) => (
            <div key={i} className="ne-stat">
              <s.icon size={16} style={{ color: RED }} />
              <div className="ne-stat-val">{s.value}</div>
              <div className="ne-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="ne-d-actions">
          <button className="ne-primary" onClick={() => isCurrent ? player.toggle() : player.playTrack(track)}>
            {isCurrent && player.isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isCurrent && player.isPlaying ? "暂停" : "播放"}
          </button>
          <button className="ne-secondary" onClick={onExternal}><ExternalLink size={14} /> 在网易云打开</button>
          <button className="ne-secondary" onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "已复制" : "复制链接"}
          </button>
        </div>
      </div>

      <div className="ne-song-right">
        <LyricView lyric={lyric} />
      </div>
    </div>
  )
}

/* ---------------- 歌手 ---------------- */
function ArtistView({ data }: { data: NeteaseArtistDetail }) {
  const player = useNeteasePlayer()
  const onExternal = () => window.open(neteaseUrl("artist", data.id), "_blank", "noreferrer")
  const stats = [
    { icon: Music2, label: "单曲", value: data.music_size },
    { icon: Disc, label: "专辑", value: data.album_size },
    { icon: PlayCircle, label: "MV", value: data.mv_size },
  ]
  return (
    <div className="ne-head-block">
      <div className="ne-head">
        <div className="ne-avatar" style={{ backgroundImage: data.pic ? `url(${data.pic})` : undefined }}>
          {!data.pic && <Mic2 size={54} />}
        </div>
        <div className="ne-head-info">
          <h1 className="ne-d-name"><TypewriterText text={data.name} /></h1>
          {data.alias && data.alias.length > 0 && <div className="ne-d-alias">{data.alias.join(" / ")}</div>}
          {data.brief_desc && <p className="ne-bio">{data.brief_desc}</p>}
          <div className="ne-stat-inline">
            {stats.map((s, i) => (
              <span key={i} className="ne-stat-chip"><s.icon size={13} /> {typeof s.value === "number" ? <AnimatedNumber value={s.value} /> : s.value} {s.label}</span>
            ))}
          </div>
          <button className="ne-primary" onClick={onExternal}><ExternalLink size={14} /> 在网易云打开</button>
          {(data.hot_songs?.length ?? 0) > 0 && (
            <button className="ne-secondary" onClick={() => player.playQueue(data.hot_songs!, 0)}>
              <Play size={14} /> 播放热门
            </button>
          )}
        </div>
      </div>

      <Section title="热门歌曲" icon={Flame}>
        <TrackList tracks={data.hot_songs ?? []} />
      </Section>
    </div>
  )
}

/* ---------------- 专辑 ---------------- */
function AlbumView({ data }: { data: NeteaseAlbumDetail }) {
  const player = useNeteasePlayer()
  const onExternal = () => window.open(neteaseUrl("album", data.id), "_blank", "noreferrer")
  return (
    <div className="ne-head-block">
      <div className="ne-head">
        <div className="ne-cover-md" style={{ backgroundImage: data.pic ? `url(${data.pic})` : undefined }}>
          {!data.pic && <Disc size={44} />}
        </div>
        <div className="ne-head-info">
          <div className="ne-kind-tag"><Disc size={12} /> 专辑</div>
          <h1 className="ne-d-name"><TypewriterText text={data.name} /></h1>
          <div className="ne-d-artists"><Mic2 size={14} /> {data.artist || "—"}</div>
          <div className="ne-meta-line">
            {data.publish_time && <span><Calendar size={13} /> {fmtDate(data.publish_time / 1000)}</span>}
            {data.company && <span><Building2 size={13} /> {data.company}</span>}
            {data.size != null && <span><ListMusic size={13} /> <AnimatedNumber value={data.size} /> 首</span>}
          </div>
          <button className="ne-primary" onClick={onExternal}><ExternalLink size={14} /> 在网易云打开</button>
          {(data.songs?.length ?? 0) > 0 && (
            <button className="ne-secondary" onClick={() => player.playQueue(data.songs!, 0)}>
              <Play size={14} /> 播放全部
            </button>
          )}
        </div>
      </div>

      <Section title="曲目列表" icon={ListMusic}>
        <TrackList tracks={data.songs ?? []} />
      </Section>
    </div>
  )
}

/* ---------------- 歌单 ---------------- */
function PlaylistView({ data }: { data: NeteasePlaylistDetail }) {
  const player = useNeteasePlayer()
  const onExternal = () => window.open(neteaseUrl("playlist", data.id), "_blank", "noreferrer")
  return (
    <div className="ne-head-block">
      <div className="ne-head">
        <div className="ne-cover-md" style={{ backgroundImage: data.pic ? `url(${data.pic})` : undefined }}>
          {!data.pic && <ListMusic size={44} />}
        </div>
        <div className="ne-head-info">
          <div className="ne-kind-tag"><ListMusic size={12} /> 歌单</div>
          <h1 className="ne-d-name"><TypewriterText text={data.name} /></h1>
          <div className="ne-d-artists"><User size={14} /> by {data.creator || "未知"}</div>
          <div className="ne-meta-line">
            {data.tags && data.tags.length > 0 && <span><Tag size={13} /> {data.tags.join(" / ")}</span>}
            {data.play_count != null && <span><Flame size={13} /> 播放 <AnimatedNumber value={data.play_count} formatter={fmt} /></span>}
            {data.subscribed_count != null && <span><Heart size={13} /> 收藏 <AnimatedNumber value={data.subscribed_count} formatter={fmt} /></span>}
            {data.track_count != null && <span><ListMusic size={13} /> <AnimatedNumber value={data.track_count} /> 首</span>}
          </div>
          {data.description && <p className="ne-bio ne-bio-clamp">{data.description}</p>}
          <button className="ne-primary" onClick={onExternal}><ExternalLink size={14} /> 在网易云打开</button>
          {(data.tracks?.length ?? 0) > 0 && (
            <button className="ne-secondary" onClick={() => player.playQueue(data.tracks!, 0)}>
              <Play size={14} /> 播放全部
            </button>
          )}
        </div>
      </div>

      <Section title="曲目列表" icon={ListMusic}>
        <TrackList tracks={data.tracks ?? []} />
      </Section>
    </div>
  )
}

/* ---------------- 共享组件 ---------------- */
function Section({ title, icon: Icon, children }: {
  title: string
  icon: typeof Flame
  children: React.ReactNode
}) {
  return (
    <div className="ne-section">
      <div className="ne-section-title"><Icon size={15} style={{ color: RED }} /> {title}</div>
      {children}
    </div>
  )
}

function LyricView({ lyric }: { lyric: NeteaseLyric | null }) {
  const [copied, setCopied] = useState(false)
  if (!lyric || !lyric.lines || lyric.lines.length === 0) {
    return (
      <div className="ne-lyric ne-lyric-empty">
        <div className="ne-section-title"><Music2 size={15} style={{ color: RED }} /> 歌词</div>
        <div className="ne-lyric-none">暂无歌词 / 纯音乐</div>
      </div>
    )
  }
  const copyAll = () => {
    const text = lyric.lines!.map((l) => l.text + (l.tl ? `\n${l.tl}` : "")).join("\n")
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="ne-lyric">
      <div className="ne-lyric-head">
        <span className="ne-section-title"><Music2 size={15} style={{ color: RED }} /> 歌词{lyric.has_translation ? "（含翻译）" : ""}</span>
        <button className="ne-lyric-copy" onClick={copyAll}>
          {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制</>}
        </button>
      </div>
      <div className="ne-lyric-body">
        {lyric.lines.map((l, i) => (
          <div key={i} className="ne-lyric-line">
            <span className="ne-lyric-text">{l.text || "♪"}</span>
            {l.tl && <span className="ne-lyric-tl">{l.tl}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function TrackList({ tracks, pageSize = 50 }: { tracks: NeteaseTrack[]; pageSize?: number }) {
  const navigate = useNavigate()
  const player = useNeteasePlayer()
  const [page, setPage] = useState(0)
  if (!tracks || tracks.length === 0) return <div className="ne-no-tracks">暂无曲目</div>
  const pages = Math.ceil(tracks.length / pageSize)
  const view = tracks.slice(page * pageSize, page * pageSize + pageSize)
  return (
    <div>
      <div className="ne-tracks">
        {view.map((t, i) => {
          const isCurrent = player.current?.id === t.id
          return (
            <div
              key={`${t.id}-${page}-${i}`}
              className={`ne-track${isCurrent ? " ne-track-current" : ""}`}
              onClick={() => navigate(`/netease/song/${t.id}`)}
            >
              <button
                className="ne-track-play"
                onClick={(e) => { e.stopPropagation(); player.playTrack(t, tracks) }}
                title={isCurrent && player.isPlaying ? "暂停" : "播放"}
              >
                {isCurrent && player.isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="ne-track-no">{String(page * pageSize + i + 1).padStart(2, "0")}</div>
              <div className="ne-track-pic">{t.pic ? <img src={t.pic} alt="" referrerPolicy="no-referrer" /> : <Music2 size={14} />}</div>
              <div className="ne-track-main">
                <div className="ne-track-name" title={t.name}>{t.name}</div>
                <div className="ne-track-artist">{t.artists?.join(" / ") || "—"}{t.album ? ` · 《${t.album}》` : ""}</div>
              </div>
              {t.pop != null && <div className="ne-track-pop" title="热度">{t.pop}</div>}
              {t.mv_id ? <PlayCircle size={15} className="ne-track-mv" /> : <span className="ne-track-dur">{fmtDur(t.duration_ms)}</span>}
            </div>
          )
        })}
      </div>
      {pages > 1 && (
        <div className="ne-pager">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>上一页</button>
          <span>{page + 1} / {pages}</span>
          <button disabled={page === pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>下一页</button>
        </div>
      )}
    </div>
  )
}

const css = `
.ne-d { max-width: 1100px; margin: 0 auto; padding: 4px 0 90px; }
.ne-d-top { display:flex; align-items:center; gap:14px; padding:14px 0 18px; flex-wrap:wrap; }
.ne-back { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:10px; border:1px solid var(--border); background:var(--bg-card); color:var(--text); font-size:13px; font-weight:600; cursor:pointer; transition:all .14s; }
.ne-back:hover { border-color:${RED}; color:${RED}; }
.ne-crumb { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text-dim); flex-wrap:wrap; }
.ne-crumb-link { cursor:pointer; color:var(--text-dim); }
.ne-crumb-link:hover { color:${RED}; }
.ne-crumb-sep { color:var(--text-faint); }
.ne-crumb-name { color:var(--text); max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ne-d-loading { margin-top:60px; }
.ne-banner { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:12px; font-size:13px; }
.ne-banner-err { background:color-mix(in srgb, var(--danger) 12%, transparent); color:var(--danger); }
.ne-retry { margin-left:8px; background:var(--danger); color:#fff; border:none; padding:4px 12px; border-radius:8px; cursor:pointer; font-size:12px; }

/* 单曲 */
.ne-song { display:grid; grid-template-columns:340px 1fr; gap:28px; align-items:start; }
.ne-song-left { position:sticky; top:16px; }
.ne-cover-lg { width:100%; aspect-ratio:1/1; border-radius:18px; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); box-shadow:0 12px 40px rgba(0,0,0,.18); }
.ne-d-name { font-size:22px; font-weight:800; margin:18px 0 0; line-height:1.3; }
.ne-d-alias { font-size:13px; color:var(--text-faint); margin-top:6px; }
.ne-d-artists { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13.5px; color:var(--text-dim); margin-top:10px; }
.ne-d-album { display:inline-flex; align-items:center; gap:4px; }
.ne-pop-block { margin-top:14px; }
.ne-pop-head { display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim); margin-bottom:5px; }
.ne-pop-bar { height:8px; background:var(--bg-soft); border-radius:5px; overflow:hidden; }
.ne-pop-fill { height:100%; background:linear-gradient(90deg, ${RED}, #ff9a9a); border-radius:5px; }
.ne-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-top:18px; }
.ne-stat { background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:12px; }
.ne-stat-val { font-size:15px; font-weight:700; margin-top:6px; }
.ne-stat-label { font-size:11px; color:var(--text-faint); margin-top:2px; }
.ne-d-actions { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; }
.ne-primary { display:inline-flex; align-items:center; gap:6px; padding:10px 16px; border-radius:10px; border:none; background:linear-gradient(135deg, ${RED}, ${RED_DK}); color:#fff; font-weight:700; font-size:13px; cursor:pointer; }
.ne-secondary { display:inline-flex; align-items:center; gap:6px; padding:10px 16px; border-radius:10px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); font-weight:600; font-size:13px; cursor:pointer; }
.ne-song-right { min-width:0; }

/* 歌词 */
.ne-lyric { background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:16px; }
.ne-lyric-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.ne-lyric-copy { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:5px 10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); cursor:pointer; }
.ne-lyric-copy:hover { border-color:${RED}; color:${RED}; }
.ne-lyric-body { max-height:560px; overflow:auto; padding-right:6px; }
.ne-lyric-line { padding:7px 4px; border-bottom:1px solid var(--border); animation:ne-fade-up .35s both; }
.ne-lyric-text { font-size:14px; line-height:1.5; color:var(--text); }
.ne-lyric-tl { display:block; font-size:12.5px; color:var(--text-dim); margin-top:3px; }
.ne-lyric-empty .ne-lyric-none, .ne-lyric-none { color:var(--text-faint); font-size:13px; padding:14px 4px; }

/* 头部区块（歌手/专辑/歌单） */
.ne-head-block { animation:ne-fade-up .4s both; }
.ne-head { display:flex; gap:24px; align-items:flex-start; flex-wrap:wrap; }
.ne-avatar { width:180px; height:180px; border-radius:50%; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); box-shadow:0 10px 34px rgba(0,0,0,.16); flex-shrink:0; }
.ne-cover-md { width:200px; height:200px; border-radius:16px; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); box-shadow:0 10px 34px rgba(0,0,0,.16); flex-shrink:0; }
.ne-head-info { flex:1; min-width:240px; }
.ne-kind-tag { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${RED}; font-weight:700; margin-bottom:8px; }
.ne-d-artists .ne-d-album { margin-left:10px; }
.ne-bio { font-size:13px; line-height:1.7; color:var(--text-dim); margin:12px 0; max-width:560px; white-space:pre-wrap; }
.ne-bio-clamp { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.ne-stat-inline { display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 14px; }
.ne-stat-chip { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; color:var(--text-dim); background:var(--bg-soft); padding:5px 11px; border-radius:20px; }
.ne-meta-line { display:flex; gap:14px; flex-wrap:wrap; font-size:12.5px; color:var(--text-dim); margin:10px 0 14px; }
.ne-meta-line span { display:inline-flex; align-items:center; gap:5px; }

/* 区块 */
.ne-section { margin-top:28px; }
.ne-section-title { display:flex; align-items:center; gap:7px; font-size:15px; font-weight:700; margin-bottom:14px; }

/* 曲目列表 */
.ne-tracks { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
.ne-track { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .12s; }
.ne-track:last-child { border-bottom:none; }
.ne-track:hover { background:color-mix(in srgb, ${RED} 7%, transparent); }
.ne-track-play { width:28px; height:28px; border-radius:50%; border:none; background:color-mix(in srgb, ${RED} 14%, transparent); color:${RED}; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:all .12s; }
.ne-track-play:hover { background:${RED}; color:#fff; transform:scale(1.06); }
.ne-track-current { background:color-mix(in srgb, ${RED} 9%, transparent); }
.ne-track-current .ne-track-name { color:${RED}; }
.ne-track-current .ne-track-no { color:${RED}; }
.ne-track-no { width:26px; text-align:center; font-size:12px; color:var(--text-faint); flex-shrink:0; font-variant-numeric:tabular-nums; }
.ne-track-pic { width:38px; height:38px; border-radius:8px; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); flex-shrink:0; overflow:hidden; }
.ne-track-pic img { width:100%; height:100%; object-fit:cover; }
.ne-track-main { flex:1; min-width:0; }
.ne-track-name { font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ne-track-artist { font-size:11.5px; color:var(--text-faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }
.ne-track-pop { font-size:12px; color:var(--text-dim); width:42px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }
.ne-track-dur { font-size:12px; color:var(--text-faint); width:42px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }
.ne-track-mv { color:${RED}; flex-shrink:0; }
.ne-no-tracks { color:var(--text-faint); font-size:13px; padding:20px; text-align:center; }
.ne-pager { display:flex; align-items:center; justify-content:center; gap:16px; margin-top:14px; font-size:13px; color:var(--text-dim); }
.ne-pager button { padding:6px 14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card); color:var(--text); cursor:pointer; }
.ne-pager button:disabled { opacity:.45; cursor:default; }

@keyframes ne-fade-up { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }

@media (max-width: 880px) {
  .ne-song { grid-template-columns:1fr; gap:22px; }
  .ne-song-left { position:static; max-width:300px; margin:0 auto; }
  .ne-head { flex-direction:column; align-items:center; text-align:center; }
  .ne-head-info { text-align:center; }
  .ne-meta-line, .ne-stat-inline, .ne-d-artists { justify-content:center; }
  .ne-stats { max-width:340px; margin-left:auto; margin-right:auto; }
}
@media (max-width: 560px) {
  .ne-track-artist { display:none; }
  .ne-stats { grid-template-columns:1fr 1fr; }
}
`
