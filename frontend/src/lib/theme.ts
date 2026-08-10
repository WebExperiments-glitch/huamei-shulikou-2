import { create } from "zustand"

export type Theme = "dark" | "light"
const KEY = "hb-theme"

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* ignore */
  }
  return "light"
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.documentElement.style.colorScheme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeStore>((set) => ({
  theme: initialTheme(),
  toggle: () =>
    set((s) => {
      const t: Theme = s.theme === "dark" ? "light" : "dark"
      applyTheme(t)
      return { theme: t }
    }),
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },
}))

// 模块加载即应用一次（兜底，配合 index.html 内联脚本避免首屏闪白）
applyTheme(initialTheme())

export interface ChartPalette {
  axis: string
  split: string
  text: string
  tooltipBg: string
  tooltipBorder: string
}

/** 图表坐标轴 / 分割线 / 文字配色，随主题切换，避免浅色背景下深色写死不可读。 */
export function getChartPalette(theme: Theme): ChartPalette {
  if (theme === "light") {
    return {
      axis: "#6b7589",
      split: "#e6e9f0",
      text: "#3a4254",
      tooltipBg: "rgba(255,255,255,0.96)",
      tooltipBorder: "#d6dce6",
    }
  }
  return {
    axis: "#7d8aa5",
    split: "#162036",
    text: "#c9d4e8",
    tooltipBg: "rgba(15,21,34,0.96)",
    tooltipBorder: "#1e2a3f",
  }
}
