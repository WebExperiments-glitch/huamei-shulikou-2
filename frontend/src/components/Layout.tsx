import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Menu } from "antd"
import type { MenuProps } from "antd"
import {
  LayoutDashboard, Trophy, Crown, CalendarDays, Sun, Clock, Flame, Mic2, Activity,
  Search, GitCompareArrows, BarChart3, Moon, Sigma, Music2, Heart, Menu as MenuIcon, X, Star, Bot,
  Download, TrendingUp, Database, FileText, Settings as SettingsIcon, Sparkles,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import CommandPalette from "./CommandPalette"
import RefreshButton from "./RefreshButton"
import ErrorBoundary from "./ErrorBoundary"
import ManualIngest from "./ManualIngest"
import Effects from "./Effects"
import SettingsPanel from "./SettingsPanel"
import { useTheme } from "../lib/theme"
import { AnimatePresence, MotionConfig, PageMotion } from "../lib/motion"
import { useChatStore } from "../airi/store/chat-store"

interface NavItem { label: string; to: string; icon: LucideIcon }
interface NavGroup { group: string }

const nav: (NavItem | NavGroup)[] = [
  { group: "榜单" },
  { label: "总览", to: "/", icon: LayoutDashboard },
  { label: "周榜", to: "/board/weekly", icon: Trophy },
  { label: "传说曲周榜", to: "/board/legend", icon: Crown },
  { label: "年榜 / 半年榜", to: "/board/annual", icon: CalendarDays },
  { label: "年度回顾", to: "/annual", icon: Star },
  { label: "传说曲晋升", to: "/legend-timeline", icon: Crown },
  { label: "月榜（聚合）", to: "/monthly", icon: Sun },
  { label: "日榜（快照）", to: "/daily", icon: Clock },
  { group: "数据" },
  { label: "歌曲库", to: "/songs", icon: Flame },
  { label: "P主榜", to: "/artists", icon: Mic2 },
  { label: "歌姬榜", to: "/vocalists", icon: Mic2 },
  { group: "分析" },
  { label: "预警与洞察", to: "/insights", icon: Activity },
  { label: "歌曲对比", to: "/compare", icon: GitCompareArrows },
  { label: "数据分析", to: "/analytics", icon: BarChart3 },
  { label: "公式与试算", to: "/formula", icon: Sigma },
  { label: "公式实验室", to: "/formula-lab", icon: Sigma },
  { label: "下期冲榜预测", to: "/predict", icon: TrendingUp },
  { group: "实时" },
  { label: "实时热度", to: "/hot", icon: Activity },
  { label: "AI 伴侣", to: "__airi__", icon: Sparkles },
  { label: "AI 智能体", to: "/agent", icon: Bot },
  { group: "工具" },
  { label: "报告与海报", to: "/reports", icon: FileText },
  { label: "数据导出", to: "/export", icon: Download },
  { group: "音乐" },
  { label: "网易云+QQ", to: "/netease", icon: Music2 },
  { group: "我的" },
  { label: "收藏的歌曲", to: "/favorites", icon: Heart },
  { label: "特效设置", to: "/settings", icon: SettingsIcon },
]

const navItems = nav.filter((n): n is NavItem => !("group" in n))

// 按分组组装 AntD Menu items
const groups: { group: string; items: NavItem[] }[] = []
let currentGroup: { group: string; items: NavItem[] } | null = null
for (const item of nav) {
  if ("group" in item) {
    currentGroup = { group: item.group, items: [] }
    groups.push(currentGroup)
  } else if (currentGroup) {
    currentGroup.items.push(item)
  }
}
const antdMenuItems: MenuProps["items"] = groups.map((g) => ({
  type: "group",
  label: g.group,
  children: g.items.map((it) => ({
    key: it.to,
    icon: <it.icon size={15} />,
    label: it.label,
  })),
}))

export default function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // 计算当前激活的菜单项：优先精确匹配，其次按路径前缀取最长匹配
  const selectedKey =
    navItems
      .map((n) => n.to)
      .filter((to) => (to === "/" ? location.pathname === "/" : location.pathname === to || location.pathname.startsWith(to + "/")))
      .sort((a, b) => b.length - a.length)[0] ?? "/"

  const menuProps: MenuProps = {
    mode: "inline",
    items: antdMenuItems,
    selectedKeys: [selectedKey],
    onClick: ({ key }) => {
      if (key === "/settings") {
        setSettingsOpen(true)
        setSidebarOpen(false)
        return
      }
      if (key === "__airi__") {
        useChatStore.getState().setOpen(true)
        setSidebarOpen(false)
        return
      }
      navigate(key)
      setSidebarOpen(false)
    },
  }

  // 移动端：路由切换时自动收起抽屉
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // 路由切换时回到顶部：新页面从头部开始阅读，避免停留在上一页滚动位置
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
  }, [location.pathname])

  // 抽屉开启时锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [sidebarOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="layout">
      <div
        className={`sidebar-backdrop${sidebarOpen ? " show" : ""}`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSidebarOpen(false) }}
        role="button"
        tabIndex={0}
        aria-label="关闭侧边栏"
      />
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-head">
          <div className="logo">
            <div className="mark" aria-label="huamei术力口">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <rect x="3" y="9" width="2" height="6" rx="1" opacity="0.65" />
                <rect x="6.5" y="6" width="2" height="12" rx="1" opacity="0.85" />
                <rect x="10" y="3" width="2" height="18" rx="1" />
                <rect x="13.5" y="6" width="2" height="12" rx="1" opacity="0.85" />
                <rect x="17" y="9" width="2" height="6" rx="1" opacity="0.65" />
              </svg>
            </div>
            <div>
              <div className="name">huamei术力口</div>
              <div className="sub">VOCALOID CHART</div>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单">
            <X size={18} />
          </button>
        </div>
        <button className="sidebar-search" onClick={() => setPaletteOpen(true)}>
          <Search size={13} />
          <span>搜索 / 跳转</span>
          <kbd>⌘K</kbd>
        </button>
        <button className="sidebar-search" onClick={toggle} title="切换深浅主题">
          {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
          <span>{theme === "dark" ? "浅色模式" : "深色模式"}</span>
        </button>
        <RefreshButton />
        <button className="sidebar-search accent" onClick={() => setIngestOpen(true)}>
          <Database size={13} />
          <span>手动入库</span>
        </button>
        <div className="sidebar-menu">
          <Menu {...menuProps} />
        </div>
      </aside>
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="打开菜单">
          <MenuIcon size={20} />
        </button>
        <div className="brand-mini">
          <span className="bm-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="3" y="9" width="2" height="6" rx="1" opacity="0.65" />
              <rect x="6.5" y="6" width="2" height="12" rx="1" opacity="0.85" />
              <rect x="10" y="3" width="2" height="18" rx="1" />
              <rect x="13.5" y="6" width="2" height="12" rx="1" opacity="0.85" />
              <rect x="17" y="9" width="2" height="6" rx="1" opacity="0.65" />
            </svg>
          </span> huamei术力口
        </div>
        <button className="mobile-search" onClick={() => setPaletteOpen(true)} aria-label="搜索">
          <Search size={16} />
        </button>
      </div>
      <main className="main">
        <AnimatePresence mode="wait">
          <PageMotion key={location.pathname}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </PageMotion>
        </AnimatePresence>
      </main>
      <Effects />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ManualIngest open={ingestOpen} onClose={() => setIngestOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
    </MotionConfig>
  )
}
