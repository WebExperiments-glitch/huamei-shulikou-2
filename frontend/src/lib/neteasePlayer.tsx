import {
  createContext, useContext, useState, useRef, useEffect, useCallback,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { api } from "./api"
import type { NeteaseTrack } from "./types"
import { Music2, Play, Pause, SkipBack, SkipForward, ExternalLink, X, AlertCircle, Waves } from "lucide-react"
import VisualizerModal from "../components/VisualizerModal"
import { LottiePlayer } from "../components/fx/lottie"
import { LiquidGlass } from "../components/fx/liquid-glass"
import { engine } from "./sonic/AudioEngine"
import { BASE } from "./apis/request"
import { useContentMirror } from "./contentMirror"
import { lensBleed } from "./liquidGlass"
import { useFx } from "./effects"

// 播放条液态玻璃参数（strength=40 对应的镜像出血）
const BAR_BLEED = lensBleed(40)

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
  audioUrl: string
  audioElement: HTMLAudioElement | null
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
      const isQQ = track.source === "qqmusic"
      const r = isQQ
        ? await api.qqmusicUrl(String(track.id), track.mid)
        : await api.neteaseUrl(track.id)
      if (!r.url) {
        setError(isQQ ? "该歌曲为绿钻专属或已下架，需会员才能播放" : "该歌曲无可用播放源（版权限制或已下架）")
        setIsPlaying(false)
        return
      }
      const audio = audioRef.current
      if (!audio) return
      // 网易云音频外链无 CORS 头：一旦被 Web Audio 图（createMediaElementSource）接管
      // 便静音、频谱全零。走后端代理（/api/netease/audio 带回 CORS 头）+ crossOrigin
      // 匿名模式，才能既正常出声又让可视化拿到真实频谱。QQ 音乐保留原直链。
      audio.src = isQQ ? r.url : `${BASE}/api/netease/audio/${track.id}`
      try {
        await audio.play()
        setIsPlaying(true)
      } catch {
        // 自动续播可能被浏览器拦截，留给用户手动点击
        setIsPlaying(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "播放失败")
      setIsPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // index / queue 变化 → 加载并播放当前曲
  useEffect(() => {
    if (index >= 0 && index < queue.length) loadAndPlay(queue[index]!)
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
    audioUrl: audioRef.current?.src || "",
    audioElement: audioRef.current,
    playTrack, playQueue, toggle, next, prev, seek, stop,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} style={{ display: "none" }} crossOrigin="anonymous" />
      <PlayerBar />
    </Ctx.Provider>
  )
}

function PlayerBar() {
  const {
    current, isPlaying, loading, error, currentTime, duration, progress,
    audioElement, toggle, next, prev, seek, stop,
  } = useNeteasePlayer()
  const [showVisualizer, setShowVisualizer] = useState(false)
  const liquidOn = useFx("liquidGlass")
  const barRef = useRef<HTMLDivElement>(null)
  const mirrorHost = useRef<HTMLDivElement>(null)
  // 真·内容折射：截取玻璃背后的真实页面作为镜像层（滚动停止 260ms 后补截，
  // 移动端/窄屏在 hook 内自动跳过，降级为磨砂）
  useContentMirror(mirrorHost, barRef, liquidOn, BAR_BLEED)

  if (!current) return null

  const source = current.source ?? "netease"
  const accent = source === "qqmusic" ? GREEN : RED
  const sourceLabel = source === "qqmusic" ? "QQ音乐" : "网易云"
  const extUrl = source === "qqmusic"
    ? `https://y.qq.com/n/ryqq/songDetail/${current.id}`
    : `https://music.163.com/#/song?id=${current.id}`

  return createPortal(
    <>
      <style>{barCss(accent)}</style>
      <LiquidGlass
        ref={barRef}
        className="npl-bar"
        radius={18}
        strength={40}
        enabled={liquidOn}
        backdrop={<div ref={mirrorHost} className="absolute inset-0" />}
      >
        <div className="npl-left">
          <div className="npl-cover" style={current.pic ? { backgroundImage: `url(${current.pic})` } : undefined}>
            {!current.pic && <Music2 size={18} />}
            {loading && <div className="npl-cover-loading" />}
            {/* 播放中在封面右下角叠加均衡器动画（cardMicro 门控） */}
            {isPlaying && !loading && (
              <LottiePlayer
                name="equalizer"
                size={34}
                className="absolute right-0 bottom-0"
                style={{ background: "rgba(0,0,0,.32)", borderRadius: "6px 0 8px 0", padding: 2 }}
              />
            )}
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
          <span
            className="npl-src"
            onClick={() => {
              // 在用户手势内同步接管音频元素并激活 AudioContext，避免音乐被静音
              if (audioElement) {
                engine.attachPlayerElement(audioElement)
                engine.resume()
              }
              setShowVisualizer(true)
            }}
            title="3D 音乐可视化"
          >
            <Waves size={12} /> {sourceLabel}
          </span>
          <a className="npl-ext" href={extUrl} target="_blank" rel="noreferrer" title={`在${sourceLabel}打开`}>
            <ExternalLink size={14} />
          </a>
          <button className="npl-btn" onClick={stop} title="关闭"><X size={15} /></button>
        </div>
      </LiquidGlass>

      {showVisualizer && audioElement && (
        <VisualizerModal
          audioElement={audioElement}
          isPlaying={isPlaying}
          onToggle={toggle}
          onNext={next}
          onPrev={prev}
          current={current}
          onClose={() => setShowVisualizer(false)}
        />
      )}
    </>,
    document.body,
  )
}

const RED = "#ec4141"
const GREEN = "#11af52"

const barCss = (accent: string) => `
.npl-bar {
  position: fixed; left: 50%; bottom: 14px; z-index: 200;
  width: min(1040px, calc(100vw - 28px));
  display: flex; align-items: center;
  padding: 10px 18px;
  border-radius: 18px;
  animation: npl-in .35s cubic-bezier(.22,.61,.36,1) both;
}
@keyframes npl-in { from { transform: translate(-50%, 110%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.npl-bar .lg-content { display: flex; align-items: center; gap: 16px; width: 100%; }
.npl-left { display:flex; align-items:center; gap:11px; min-width: 180px; flex: 1; }
.npl-cover { width:44px; height:44px; border-radius:10px; background:var(--bg-soft) center/cover no-repeat; display:flex; align-items:center; justify-content:center; color:var(--text-faint); position:relative; overflow:hidden; flex-shrink:0; }
.npl-cover-loading { position:absolute; inset:0; background:rgba(0,0,0,.35); }
.npl-meta { min-width:0; }
.npl-name { font-size:13.5px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-artist { font-size:11.5px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-center { flex: 2; display:flex; flex-direction:column; align-items:center; gap:6px; max-width: 620px; }
.npl-ctrls { display:flex; align-items:center; gap:14px; }
.npl-btn { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:50%; border:1px solid var(--border); background:var(--bg-elev); color:var(--text); cursor:pointer; transition:all .14s; }
.npl-btn:hover { border-color:${accent}; color:${accent}; }
.npl-play { width:42px; height:42px; background:linear-gradient(135deg, ${accent}, ${accent}); color:#fff; border-color:transparent; }
.npl-play:hover { color:#fff; filter:brightness(1.08); }
.npl-play:disabled { opacity:.7; cursor:default; }
.npl-spin { width:16px; height:16px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:npl-spin .7s linear infinite; }
@keyframes npl-spin { to { transform: rotate(360deg); } }
.npl-progress { display:flex; align-items:center; gap:9px; width:100%; }
.npl-time { font-size:11px; color:var(--text-faint); font-variant-numeric:tabular-nums; width:34px; text-align:center; flex-shrink:0; }
.npl-track { flex:1; height:5px; background:var(--bg-soft); border-radius:3px; cursor:pointer; position:relative; }
.npl-fill { height:100%; background:linear-gradient(90deg, ${accent}, ${accent}); border-radius:3px; position:relative; }
.npl-knob { position:absolute; right:-5px; top:50%; transform:translateY(-50%); width:11px; height:11px; border-radius:50%; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.3); opacity:0; transition:opacity .12s; }
.npl-track:hover .npl-knob { opacity:1; }
.npl-right { display:flex; align-items:center; gap:8px; min-width: 120px; justify-content:flex-end; flex:1; }
.npl-err { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:var(--danger); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npl-src { font-size:10px; color:var(--text-faint); border:1px solid var(--border); padding:2px 7px; border-radius:6px; white-space:nowrap; cursor:pointer; display:inline-flex; align-items:center; gap:3px; transition:all .14s; }
.npl-src:hover { border-color:${accent}; color:${accent}; background:color-mix(in srgb, ${accent} 8%, transparent); }
.npl-ext { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; border:1px solid var(--border); background:var(--bg-elev); color:var(--text-dim); cursor:pointer; }
.npl-ext:hover { border-color:${accent}; color:${accent}; }
@media (max-width: 720px) {
  .npl-left { min-width: 0; flex: 1; }
  .npl-right { display:none; }
  .npl-center { flex: 3; max-width:none; }
  .npl-bar { bottom: calc(10px + env(safe-area-inset-bottom, 0px)); width: calc(100vw - 20px); }
}
/* 液态玻璃胶囊样式（半透明底/磨砂/镜面高光）由 .lg-glass 类提供；
   关闭液态玻璃时 CSS 门控自动退化为实底面板 */
`
