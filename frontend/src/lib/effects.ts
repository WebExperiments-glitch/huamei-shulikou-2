import { create } from "zustand"

/**
 * 全局动效设置（zustand + localStorage 持久化）。
 * 每个 JS 驱动的动画组件读取对应开关；CSS 驱动的动画通过
 * <html> 上的 data-fx* 属性做开关门控（见 index.css 末尾）。
 */

export type FxDensity = "low" | "medium" | "high"

export interface FxSettings {
  master: boolean // 总开关：一键关闭全部动画
  pageTransition: boolean // 路由转场
  reveal: boolean // 滚动揭示
  stagger: boolean // 交错入场
  countUp: boolean // 数字滚动
  cardMicro: boolean // 卡片微动效（聚光灯 / 微升 / 3D 倾斜 / 边框流光）
  dataAnim: boolean // 榜单数据动画（排名弹入 / 新上榜高亮 / 得分滚动）
  textAnim: boolean // 文本动画（打字机 / 渐变闪烁）
  particles: boolean // 粒子光效背景
  scrollProgress: boolean // 顶部滚动进度条
  glassBg: boolean // 玻璃背景光斑
  liquidGlass: boolean // 液态玻璃表面（镜面高光 + 透镜/快照折射）
  density: FxDensity // 动画密度
}

// v2：性能优先默认值上线，存储键升级一次让所有设备重置到新默认
// （老用户自定义可在特效设置里用预设快速恢复）
const KEY = "hb-fx2"

/** 性能优先默认值：只保留近零成本的一次性入场动画（页面转场/滚动揭示/交错入场）。
 *  面向移动端 60FPS 目标：一切持续型 GPU 特效（光斑/网格/液态玻璃/粒子/滚动条）
 *  默认关闭，需要时在特效设置或预设里手动开启。 */
const DEFAULTS: FxSettings = {
  master: true,
  pageTransition: true, // 一次性淡入，近零成本
  reveal: true, // IntersectionObserver 驱动的一次性浮现
  stagger: true, // 一次性交错入场
  countUp: false,
  cardMicro: false,
  dataAnim: false,
  textAnim: false,
  particles: false,
  scrollProgress: false,
  glassBg: false,
  liquidGlass: false,
  density: "low",
}

/** 供预设按钮等场景复用的默认值 */
export const FX_DEFAULTS: Readonly<FxSettings> = DEFAULTS

function load(): FxSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

/** 将设置同步到 <html> 的 data 属性，供 CSS 门控使用。
 *  注意：属性名必须与 index.css 中的选择器一致（全小写无连字符，
 *  即 data-fxcard / data-fxglass / data-fxscroll / data-fxdata /
 *  data-fxtext / data-fxliquid / data-fxdensity）。 */
function apply(s: FxSettings) {
  const el = document.documentElement
  el.dataset.fx = s.master ? "on" : "off"
  el.dataset.fxcard = s.master && s.cardMicro ? "on" : "off"
  el.dataset.fxglass = s.master && s.glassBg ? "on" : "off"
  el.dataset.fxliquid = s.master && s.liquidGlass ? "on" : "off"
  el.dataset.fxscroll = s.master && s.scrollProgress ? "on" : "off"
  el.dataset.fxdata = s.master && s.dataAnim ? "on" : "off"
  el.dataset.fxtext = s.master && s.textAnim ? "on" : "off"
  el.dataset.fxdensity = s.density
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

interface FxStore extends FxSettings {
  set: (patch: Partial<FxSettings>) => void
  toggle: (k: keyof FxSettings) => void
  reset: () => void
}

export const useEffects = create<FxStore>((set, get) => {
  const init = load()
  return {
    ...init,
    set: (patch) => {
      const next = { ...get(), ...patch }
      apply(next)
      set(next)
    },
    toggle: (k) => {
      if (k === "density") return
      get().set({ [k]: !get()[k] } as Partial<FxSettings>)
    },
    reset: () => {
      const d = { ...DEFAULTS }
      apply(d)
      set(d)
    },
  }
})

// 模块加载即应用一次（兜底，配合 index.html 内联脚本避免闪白）
apply(useEffects.getState())

/** 组件内便捷读取：某个特效是否实际生效（含总开关与密度门控）。 */
export function useFx(key: keyof FxSettings): boolean {
  const master = useEffects((s) => s.master)
  const v = useEffects((s) => s[key])
  return !!(master && (key === "master" || key === "density" ? true : v))
}
