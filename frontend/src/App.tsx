import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ConfigProvider } from "antd"
import zhCN from "antd/locale/zh_CN"
import Layout from "./components/Layout"
import { Spinner } from "./components/ui"
import { ToastProvider } from "./lib/toast"
import { NeteasePlayerProvider } from "./lib/neteasePlayer"
import { useTheme } from "./lib/theme"
import { antdConfig } from "./lib/antdTheme"

// AI 伴侣（AiriCompanion）携 three/R3F/VRM 等重型 3D 依赖，非首屏必用，
// 故懒加载拆出独立 chunk，避免将其打入首屏主 bundle 拖慢首屏。
const AiriCompanion = lazy(() =>
  import("./airi").then((m) => ({ default: m.AiriCompanion })),
)

const Dashboard = lazy(() => import("./pages/Dashboard"))
const OfficialBoard = lazy(() => import("./pages/OfficialBoard"))
const MonthlyBoard = lazy(() => import("./pages/MonthlyBoard"))
const DailyBoard = lazy(() => import("./pages/DailyBoard"))
const SongLibrary = lazy(() => import("./pages/SongLibrary"))
const SongDetail = lazy(() => import("./pages/SongDetail"))
const Artists = lazy(() => import("./pages/Artists"))
const Vocalists = lazy(() => import("./pages/Vocalists"))
const HotBoard = lazy(() => import("./pages/HotBoard"))
const Compare = lazy(() => import("./pages/Compare"))
const Analytics = lazy(() => import("./pages/Analytics"))
const Formula = lazy(() => import("./pages/Formula"))
const FormulaLab = lazy(() => import("./pages/FormulaLab"))
const ExportCenter = lazy(() => import("./pages/Export"))
const Predict = lazy(() => import("./pages/Predict"))
const Netease = lazy(() => import("./pages/Netease"))
const NeteaseDetail = lazy(() => import("./pages/NeteaseDetail"))
const Favorites = lazy(() => import("./pages/Favorites"))
const AnnualReview = lazy(() => import("./pages/AnnualReview"))
const LegendTimeline = lazy(() => import("./pages/LegendTimeline"))
const ArtistDetail = lazy(() => import("./pages/ArtistDetail"))
const Agent = lazy(() => import("./pages/Agent"))
const Insights = lazy(() => import("./pages/Insights"))
const Reports = lazy(() => import("./pages/Reports"))
const Showcase = lazy(() => import("./pages/Showcase"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      retry: 1,
      // 关闭切回标签页时的自动刷新：避免聚焦 refetch 产生 net::ERR_ABORTED 噪音。
      // 数据仍按 staleTime 缓存，重新进入页面或手动刷新都会正常拉取。
      refetchOnWindowFocus: false,
    },
  },
})

function withSuspense(el: React.ReactNode) {
  return <Suspense fallback={<Spinner />}>{el}</Suspense>
}

export default function App() {
  const { theme } = useTheme()
  return (
    <ConfigProvider locale={zhCN} theme={antdConfig(theme === "dark")}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={withSuspense(<Dashboard />)} />
              <Route path="annual" element={withSuspense(<AnnualReview />)} />
              <Route path="legend-timeline" element={withSuspense(<LegendTimeline />)} />
              <Route path="artist/:kind/:name" element={withSuspense(<ArtistDetail />)} />
              <Route path="agent" element={withSuspense(<Agent />)} />
              <Route path="board/:type" element={withSuspense(<OfficialBoard />)} />
              <Route path="monthly" element={withSuspense(<MonthlyBoard />)} />
              <Route path="daily" element={withSuspense(<DailyBoard />)} />
              <Route path="songs" element={withSuspense(<SongLibrary />)} />
              <Route path="song/:bvid" element={withSuspense(<SongDetail />)} />
              <Route path="artists" element={withSuspense(<Artists />)} />
              <Route path="vocalists" element={withSuspense(<Vocalists />)} />
              <Route path="hot" element={withSuspense(<HotBoard />)} />
              <Route path="compare" element={withSuspense(<Compare />)} />
              <Route path="analytics" element={withSuspense(<Analytics />)} />
              <Route path="insights" element={withSuspense(<Insights />)} />
              <Route path="reports" element={withSuspense(<Reports />)} />
              <Route path="formula" element={withSuspense(<Formula />)} />
              <Route path="formula-lab" element={withSuspense(<FormulaLab />)} />
              <Route path="showcase" element={withSuspense(<Showcase />)} />
              <Route path="export" element={withSuspense(<ExportCenter />)} />
              <Route path="predict" element={withSuspense(<Predict />)} />
              <Route path="favorites" element={withSuspense(<Favorites />)} />
              <Route path="netease" element={<NeteasePlayerProvider><Outlet /></NeteasePlayerProvider>}>
                <Route index element={withSuspense(<Netease />)} />
                <Route path=":kind/:id" element={withSuspense(<NeteaseDetail />)} />
              </Route>
            </Route>
          </Routes>
          </BrowserRouter>
          <Suspense fallback={null}>
            <AiriCompanion />
          </Suspense>
        </ToastProvider>
      </QueryClientProvider>
    </ConfigProvider>
  )
}