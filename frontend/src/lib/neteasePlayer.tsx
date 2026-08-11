import {
  createContext, useContext, useState, useRef, useEffect, useCallback,
  type ReactNode,
} from "react"
import { api } from "./api"
import type { NeteaseTrack } from "./types"
import { Music2, Play, Pause, SkipBack, SkipForward, ExternalLink, X, AlertCircle } from "lucide-react"

const RED = "#ec4141"

interface PlayerState {
  queue: NeteaseTrack[]
  index: number
  current: NeteaseTrack | null
  isPlaying: boolean
  loading: boolean
  error: string | null
  currentTime: number
  duration: number
  progress: number
  playTrack: (track: NeteaseTrack, queue?: NeteaseTrack[]) => void
  playQueue: (queue: NeteaseTrack[], startIndex?: number) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (sec: number) => void
  stop: () => void
}

const Ctx = createContext<PlayerState | null>(null)

export function useNeteasePlayer(): PlayerState {
  const c = useContext(Ctx)
  if (!c) throw new Error("useNeteasePlayer 必须在 NeteasePlayerProvider 内使用")
  return c
}

function fmtTime(sec: number) {
  if (!sec || sec < 0) return "0:00"
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function NeteasePlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<NeteaseTrack[]>([])
  const [index, setIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<NeteaseTrack[]>([])
  queueRef.current = queue
  const current: NeteaseTrack | null = index >= 0 && index < queue.length ? queue[index]! : null

  const loadAndPlay = useCallback(async (track: NeteaseTrack) => {
    setLoading(true); setError(null)
    try {
      const r = await api.neteaseUrl(track.id)
      if (!r.url) {
        setError("该歌曲无可用播放源（版权限制或已下架）")
        setIsPlaying(false)
        return
      }
      const audio = audioRef.current
      if (!audio) return
      audio.src = r.url
      try {
        await audio.play()
        setIsPlaying(true)
      } catch {
        // 自动续播可能被浏览器拦截，留给用户手动点击
        setIsPlaying(false)
      }
    } catch (e: any) {
      setError(e?.message ?? "播放失败")
      setIsPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // index / queue 变化 → 加载并播放当前曲
  useEffect(() => {
    if (index >= 0 && index < queue.length) loadAndPlay(queue[index]!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue])

  const playTrack = useCallback((track: NeteaseTrack, q?: NeteaseTrack[]) => {
    const base = q && q.length ? q : [track]
    const i = q && q.length ? q.findIndex((t) => t.id === track.id) : 0
    setQueue(base)
    setIndex(i >= 0 ? i : 0)
  }, [])

  const playQueue = useCallback((q: NeteaseTrack[], startIndex = 0) => {
    setQueue(q)
    setIndex(startIndex)
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      audio.pause(); setIsPlaying(false)
    }
  }, [])

  const next = useCallback(() => {
    const len = queueRef.current.length
    if (len === 0) return
    setIndex((i) => (i + 1) % len)
  }, [])

  const prev = useCallback(() => {
    const len = queueRef.current.length
    if (len === 0) return
    setIndex((i) => (i - 1 + len) % len)
  }, [])

  const seek = useCallback((sec: number) => {
    const audio = audioRef.current
    if (audio && duration) {
      audio.currentTime = sec
      setCurrentTime(sec)
      setProgress(duration ? sec / duration : 0)
    }
  }, [duration])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) { audio.pause(); audio.src = "" }
    setIsPlaying(false); setQueue([]); setIndex(-1); setError(null)
    setCurrentTime(0); setDuration(0); setProgress(0)
  }, [])

  // 音频事件
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setCurrentTime(audio.currentTime)
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    }
    const onDur = () => setDuration(audio.duration || 0)
    const onEnd = () => {
      if (queueRef.current.length <= 1) {
        audio.currentTime = 0
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
      } else {
        next()
      }
    }
    const onPause = () => setIsPlaying(false)
    const onPlay = () => setIsPlaying(true)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onDur)
    audio.addEventListener("ended", onEnd)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("play", onPlay)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onDur)
      audio.removeEventListener("ended", onEnd)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("play", onPlay)
    }
  }, [next])

  const value: PlayerState = {
    queue, index, current, isPlaying, loading, error,
    currentTime, duration, progress,
    playTrack, playQueue, toggle, next, prev, seek, stop,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} style={{ display: "none" }} />
      <PlayerBar />
    </Ctx.Provider>
  )
}

function PlayerBar() {
  const {
    current, isPlaying, loading, error, currentTime, duration, progress,
    toggle, next, prev, seek, stop,
  } = useNeteasePlayer()

  if (!current) return null

  const extUrl = `https://music.163.com/#/song?id=${current.id}`

  return (
    <>
      <style>{barCss}</style>
      <div className="npl-bar">
        <div className="npl-left">
          <div className="npl-cover" style={current.pic ? { backgroundImage: `url(${current.pic})` } : undefined}>
            {!current.pic && <Music2 size={18} />}
            {loading && <div className="npl-cover-loading" />}
          </div>
          <div className="npl-meta">
            <div className="npl-name" title={current.name}>{current.name}</div>
            <div className="npl-artist">{current.artists?.join(" / ") || "未知歌手"}</div>
          </div>
        </div>

        <div className="npl-center">
          <div className="npl-ctrls">
            <button className="npl-btn" onClick={prev} title="上一首"><SkipBack size={16} /></button>
            <button className="npl-btn npl-play" onClick={toggle} title={isPlaying ? "暂停" : "播放"} disabled={loading}>
              {loading ? <span className="npl-spin" /> : isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="npl-btn" onClick={next} title="下一首"><SkipForward size={16} /></button>
          </div>
          <div className="npl-progress">
            <span className="npl-time">{fmtTime(currentTime)}</span>
            <div
              className="npl-track"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                const ratio = (e.clientX - rect.left) / rect.width
                seek(ratio * duration)
              }}
            >
              <div className="npl-fill" style={{ width: `${progress * 100}%` }}>
                <div className="npl-knob" />
              </div>
            </div>
            <span className="npl-time">{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="npl-right">
          {error && (
            <span className="npl-err" title={error}><AlertCircle size={13} /> {error}</span>
          )}
          <a className="npl-ext" href={extUrl} target="_blank" rel="noreferrer" title="在网易云打开">
            <ExternalLink size={14} />
          </a>
          <button className="npl-btn" onClick={stop} title="关闭"><X size={15} /></button>
        </div>
      </div>
    </>
  )
}

const barCss = `
.npl-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
  display: flex; align-items: center; gap: 16px;
  padding: 10px 18px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 28px rgba(0,0,0,.18);
  animation: npl-in .3s both;
}
@keyframes npl-in { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
.npl-left { display:flex; align-items:center; gap:11px; min-width: 180px; flex: 1; }
.npl-cover { width:44px; height:44px; border-radius:10px; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); position:relative; overflow:hidden; flex-shrink:0; }
.npl-cover-loading { position:absolute; inset:0; background:rgba(0,0,0,.35); }
.npl-meta { min-width:0; }
.npl-name { font-size:13.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-artist { font-size:11.5px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-center { flex: 2; display:flex; flex-direction:column; align-items:center; gap:6px; max-width: 620px; }
.npl-ctrls { display:flex; align-items:center; gap:14px; }
.npl-btn { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:50%; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); cursor:pointer; transition:all .14s; }
.npl-btn:hover { border-color:${RED}; color:${RED}; }
.npl-play { width:42px; height:42px; background:linear-gradient(135deg, ${RED}, #c20c0c); color:#fff; border-color:transparent; }
.npl-play:hover { color:#fff; filter:brightness(1.08); }
.npl-play:disabled { opacity:.7; cursor:default; }
.npl-spin { width:16px; height:16px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:npl-spin .7s linear infinite; }
@keyframes npl-spin { to { transform: rotate(360deg); } }
.npl-progress { display:flex; align-items:center; gap:9px; width:100%; }
.npl-time { font-size:11px; color:var(--text-faint); font-variant-numeric:tabular-nums; width:34px; text-align:center; flex-shrink:0; }
.npl-track { flex:1; height:5px; background:var(--bg-soft); border-radius:3px; cursor:pointer; position:relative; }
.npl-fill { height:100%; background:linear-gradient(90deg, ${RED}, #ff9a9a); border-radius:3px; position:relative; }
.npl-knob { position:absolute; right:-5px; top:50%; transform:translateY(-50%); width:11px; height:11px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.3); opacity:0; transition:opacity .12s; }
.npl-track:hover .npl-knob { opacity:1; }
.npl-right { display:flex; align-items:center; gap:8px; min-width: 120px; justify-content:flex-end; flex:1; }
.npl-err { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--danger); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-ext { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); cursor:pointer; }
.npl-ext:hover { border-color:${RED}; color:${RED}; }
@media (max-width: 720px) {
  .npl-left { min-width: 0; flex: 1; }
  .npl-right { display:none; }
  .npl-center { flex: 3; max-width:none; }
}
`
