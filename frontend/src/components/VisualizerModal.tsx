import { useEffect, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { MapScene } from "../lib/sonic/MapScene"
import { engine } from "../lib/sonic/AudioEngine"
import { themes } from "../lib/sonic/themes"
import { Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { LiquidGlass } from "./fx/liquid-glass"
import { useCanvasMirror } from "../lib/canvasMirror"
import { lensBleed } from "../lib/liquidGlass"
import { useFx } from "../lib/effects"

// 可视化控制条液态玻璃参数（strength=44 对应镜像出血）
const VIS_BLEED = lensBleed(44)
// 关闭按钮液态玻璃圆（strength=22 小透镜）
const CLOSE_BLEED = lensBleed(22)

interface Props {
  /** 播放器现有的 <audio> 元素，直接接管它的频谱分析，不重复加载音频 */
  audioElement: HTMLAudioElement
  /** 是否正在播放（来自播放器状态） */
  isPlaying: boolean
  /** 播放/暂停（驱动播放器自身，而非独立播放） */
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  /** 当前歌曲信息（可选展示用） */
  current: { name: string; artists?: string[] } | null
  onClose: () => void
}

export default function VisualizerModal({ audioElement, isPlaying, onToggle, onNext, onPrev, current, onClose }: Props) {
  const [themeId, setThemeId] = useState("minimal-monochrome")
  const canvasRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLCanvasElement>(null)
  const closeGlassRef = useRef<HTMLDivElement>(null)
  const closeMirrorRef = useRef<HTMLCanvasElement>(null)
  const liquidOn = useFx("liquidGlass")

  // 液态玻璃镜像：每帧从 WebGL 画布拷贝玻璃背后区域（含出血）到镜像画布
  useCanvasMirror(canvasRef, mirrorRef, glassRef, liquidOn, VIS_BLEED)
  useCanvasMirror(canvasRef, closeMirrorRef, closeGlassRef, liquidOn, CLOSE_BLEED)

  // 接管现有 audio 元素，只取频谱，不控制播放
  useEffect(() => {
    engine.attachPlayerElement(audioElement)
    return () => {}
  }, [audioElement])

  // 播放/暂停按钮：先在用户手势内激活 AudioContext，再驱动播放器
  const handleToggle = () => {
    engine.resume()
    onToggle()
  }
  const handleNext = () => {
    engine.resume()
    onNext()
  }
  const handlePrev = () => {
    engine.resume()
    onPrev()
  }

  const themeColors = themes[themeId] || themes["minimal-monochrome"]
  const hex = `#${themeColors!.uBaseColor1.getHexString()}`
  const themeList = Object.keys(themes)

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: hex,
      }}
    >
      {/* Close button：液态玻璃圆（小透镜，逐帧镜像 3D 场景） */}
      {liquidOn ? (
        <LiquidGlass
          ref={closeGlassRef}
          radius={20}
          strength={22}
          enabled={liquidOn}
          backdrop={<canvas ref={closeMirrorRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
          style={{ position: "absolute", top: 16, right: 16, zIndex: 10, width: 40, height: 40 }}
        >
          <button
            onClick={onClose}
            title="关闭可视化"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </LiquidGlass>
      ) : (
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="关闭可视化"
        >
          ✕
        </button>
      )}

      {/* Controls bar：液态玻璃（镜像层逐帧折射背后的 3D 场景） */}
      <LiquidGlass
        ref={glassRef}
        radius={16}
        strength={44}
        enabled={liquidOn}
        className="npl-vis"
        backdrop={<canvas ref={mirrorRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
        style={
          liquidOn
            ? { position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 10, color: "#fff", fontSize: 13 }
            : {
                // 特效关闭时的传统毛玻璃兜底（覆盖全局透明化规则）
                position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 10,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                color: "#fff", fontSize: 13,
              }
        }
      >
        {/* 当前歌曲 */}
        {current && (
          <div style={{ maxWidth: 220, overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {current.name}
            </div>
            {current.artists && current.artists.length > 0 && (
              <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {current.artists.join(" / ")}
              </div>
            )}
          </div>
        )}

        <span style={{ opacity: 0.5 }}>|</span>

        {/* 播放控制：驱动播放器自身 */}
        <button
          onClick={handlePrev}
          title="上一首"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SkipBack size={15} />
        </button>
        <button
          onClick={handleToggle}
          title={isPlaying ? "暂停" : "播放"}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "#fff",
            color: "#000",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>
        <button
          onClick={handleNext}
          title="下一首"
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SkipForward size={15} />
        </button>

        <span style={{ opacity: 0.5 }}>|</span>

        {/* Theme selector */}
        <select
          value={themeId}
          onChange={(e) => setThemeId(e.target.value)}
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {themeList.map((id) => (
            <option key={id} value={id} style={{ color: "#000" }}>
              {themes[id]!.name}
            </option>
          ))}
        </select>
      </LiquidGlass>

      {/* 3D Canvas：preserveDrawingBuffer 供液态玻璃镜像逐帧读取 GL 缓冲 */}
      <div ref={canvasRef} style={{ width: "100%", height: "100%" }}>
        <Canvas camera={{ position: [-37, 26, 92], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
          <MapScene themeColors={themeColors} />
        </Canvas>
      </div>
    </div>
  )
}
