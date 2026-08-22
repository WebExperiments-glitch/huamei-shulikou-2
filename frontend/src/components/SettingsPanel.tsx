import { Button, Divider, Drawer, Segmented, Space, Switch } from "antd"
import { useNavigate } from "react-router-dom"
import { BarChart3, Image as ImageIcon, MousePointer2, Palette, RotateCcw, ScrollText, Sparkles, Type, Wind, Zap, Droplets, BatteryLow, Scale, Monitor, Rocket, ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { useEffects } from "../lib/effects"
import type { FxSettings, FxDensity } from "../lib/effects"

const BOOL_KEYS: (keyof FxSettings)[] = [
  "pageTransition",
  "reveal",
  "stagger",
  "countUp",
  "cardMicro",
  "dataAnim",
  "textAnim",
  "scrollProgress",
  "glassBg",
  "liquidGlass",
  "particles",
]

/** 一键预设：省电 / 均衡（性能优先默认）/ 桌面增强 / 全特效 */
const PRESETS: { key: string; label: string; icon: ReactNode; patch: Partial<FxSettings> }[] = [
  {
    key: "eco", label: "省电模式", icon: <BatteryLow size={13} />,
    patch: {
      pageTransition: false, reveal: false, stagger: false, countUp: false,
      cardMicro: false, dataAnim: false, textAnim: false, particles: false,
      density: "low",
    },
  },
  {
    key: "balance", label: "均衡（推荐）", icon: <Scale size={13} />,
    patch: {
      pageTransition: true, reveal: true, stagger: true, countUp: false,
      cardMicro: false, dataAnim: false, textAnim: false, particles: false,
      density: "low",
    },
  },
  {
    key: "desktop", label: "桌面增强", icon: <Monitor size={13} />,
    patch: {
      pageTransition: true, reveal: true, stagger: true, countUp: true,
      cardMicro: true, dataAnim: true, textAnim: false, particles: false,
      density: "medium",
    },
  },
  {
    key: "full", label: "全特效", icon: <Rocket size={13} />,
    patch: {
      pageTransition: true, reveal: true, stagger: true, countUp: true,
      cardMicro: true, dataAnim: true, textAnim: true, particles: true,
      density: "high",
    },
  },
]

function Row({ icon, title, desc, on, onToggle }: {
  icon: ReactNode
  title: ReactNode
  desc: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="fx-row">
      <div className="fx-row-icon">{icon}</div>
      <div className="fx-row-body">
        <div className="fx-row-title">{title}</div>
        <div className="fx-row-desc">{desc}</div>
      </div>
      <Switch size="small" checked={on} onChange={onToggle} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fx-section">
      <div className="fx-section-title">{title}</div>
      {children}
    </div>
  )
}

export default function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useEffects()
  const navigate = useNavigate()
  const toggle = (k: keyof FxSettings) => s.toggle(k)
  const allOn = s.master && BOOL_KEYS.every((k) => s[k])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={16} /> 特效设置
        </div>
      }
      size={380}
    >
      {/* 总开关 */}
      <div className="fx-master">
        <div>
          <div className="fx-row-title">总开关</div>
          <div className="fx-row-desc">一键关闭 / 开启全部动画特效</div>
        </div>
        <Switch checked={s.master} onChange={(v) => s.set({ master: v })} />
      </div>

      <Divider style={{ margin: "14px 0" }} />

      {/* 密度 + 预设 */}
      <Section title="动画密度">
        <Segmented<FxDensity>
          block
          value={s.density}
          disabled={!s.master}
          options={[
            { label: "低", value: "low" },
            { label: "中", value: "medium" },
            { label: "高", value: "high" },
          ]}
          onChange={(v) => s.set({ density: v })}
        />
        <div className="fx-row-desc" style={{ marginTop: 6 }}>
          密度越高，粒子数量、交错节奏越快；中等为推荐值。
        </div>
      </Section>

      <Section title="一键预设">
        <Space wrap size={8}>
          {PRESETS.map((p) => (
            <Button key={p.key} size="small" icon={p.icon} onClick={() => s.set({ ...p.patch, master: true })}>
              {p.label}
            </Button>
          ))}
        </Space>
        <div className="fx-row-desc" style={{ marginTop: 6 }}>
          预设会整体覆盖下面的单项开关。默认即「均衡」：只开近零成本的一次性入场动画，
          保证移动端 60FPS；桌面端可选「桌面增强」获得光斑 / 玻璃 / 微动效全家桶。
        </div>
      </Section>

      {/* 页面动效 */}
      <Section title="页面动效">
        <Row
          icon={<Zap size={14} />}
          title="路由转场"
          desc="页面切换时的淡入上移聚焦"
          on={s.master && s.pageTransition}
          onToggle={() => toggle("pageTransition")}
        />
        <Row
          icon={<ScrollText size={14} />}
          title="滚动揭示"
          desc="滚动到视口时淡入浮现"
          on={s.master && s.reveal}
          onToggle={() => toggle("reveal")}
        />
        <Row
          icon={<Wind size={14} />}
          title="交错入场"
          desc="卡片组依次错峰出现"
          on={s.master && s.stagger}
          onToggle={() => toggle("stagger")}
        />
        <Row
          icon={<BarChart3 size={14} />}
          title="数字滚动"
          desc="统计数字从 0 滚到目标值"
          on={s.master && s.countUp}
          onToggle={() => toggle("countUp")}
        />
      </Section>

      {/* 卡片与交互 */}
      <Section title="卡片与交互">
        <Row
          icon={<MousePointer2 size={14} />}
          title="卡片微动效"
          desc="聚光灯跟随、悬停微升、3D 倾斜"
          on={s.master && s.cardMicro}
          onToggle={() => toggle("cardMicro")}
        />
        <Row
          icon={<BarChart3 size={14} />}
          title="榜单数据动画"
          desc="排名弹入、新上榜高亮、得分滚动"
          on={s.master && s.dataAnim}
          onToggle={() => toggle("dataAnim")}
        />
        <Row
          icon={<Type size={14} />}
          title="文本动画"
          desc="打字机标题、文字流光"
          on={s.master && s.textAnim}
          onToggle={() => toggle("textAnim")}
        />
      </Section>

      {/* 背景装饰 */}
      <Section title="背景装饰">
        <Row
          icon={<ScrollText size={14} />}
          title="顶部滚动进度条"
          desc="页面顶部渐变进度线"
          on={s.master && s.scrollProgress}
          onToggle={() => toggle("scrollProgress")}
        />
        <Row
          icon={<ImageIcon size={14} />}
          title="玻璃背景光斑"
          desc="背景漂浮的液态光斑与网格"
          on={s.master && s.glassBg}
          onToggle={() => toggle("glassBg")}
        />
        <Row
          icon={<Sparkles size={14} />}
          title="粒子光效"
          desc="背景漂浮的细小光点（高密度下略耗性能）"
          on={s.master && s.particles}
          onToggle={() => toggle("particles")}
        />
      </Section>

      {/* 液态玻璃 */}
      <Section title="液态玻璃">
        <Row
          icon={<Droplets size={14} />}
          title="液态玻璃表面"
          desc="iOS 26 风格：统计卡/可视化控制条折射 3D 场景，播放条折射真实页面（移动端自动降级磨砂）"
          on={s.master && s.liquidGlass}
          onToggle={() => toggle("liquidGlass")}
        />
      </Section>

      <Divider style={{ margin: "14px 0" }} />

      {/* UI 实验室入口：shadcn / Magic UI / Aceternity / React Bits / Animate.css / Lottie 组件全集 */}
      <div
        className="fx-master"
        style={{ cursor: "pointer", gap: 10 }}
        onClick={() => {
          onClose()
          navigate("/showcase")
        }}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onClose()
            navigate("/showcase")
          }
        }}
      >
        <div className="fx-row-icon"><Palette size={15} /></div>
        <div className="fx-row-body" style={{ flex: 1 }}>
          <div className="fx-row-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            UI 实验室
            <span className="badge" style={{ fontSize: 10, padding: "1px 7px" }}>NEW</span>
          </div>
          <div className="fx-row-desc">shadcn/ui · Magic UI · Aceternity · React Bits · Animate.css · Lottie 组件与特效全集预览</div>
        </div>
        <ArrowRight size={14} style={{ color: "var(--text-faint)", flex: "none" }} />
      </div>

      <Divider style={{ margin: "14px 0" }} />

      <div className="fx-actions">
        <Button size="small" onClick={() => s.set({ master: true, ...Object.fromEntries(BOOL_KEYS.map((k) => [k, true])) })}>
          全部开启
        </Button>
        <Button size="small" onClick={() => s.set({ master: false })}>
          全部关闭
        </Button>
        <Button size="small" icon={<RotateCcw size={12} />} onClick={() => s.reset()}>
          恢复默认
        </Button>
      </div>
      {!allOn && (
        <div className="fx-row-desc" style={{ marginTop: 10 }}>
          当前为部分开启状态，可逐项调整。
        </div>
      )}
    </Drawer>
  )
}
