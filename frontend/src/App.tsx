import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { lazy, Suspense } from "react"
import Layout from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import { Spinner } from "./components/ui"
import { NeteasePlayerProvider } from "./lib/neteasePlayer"

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
const Netease = lazy(() => import("./pages/Netease"))
const NeteaseDetail = lazy(() => import("./pages/NeteaseDetail"))
const Favorites = lazy(() => import("./pages/Favorites"))
const AnnualReview = lazy(() => import("./pages/AnnualReview"))
const LegendTimeline = lazy(() => import("./pages/LegendTimeline"))
const ArtistDetail = lazy(() => import("./pages/ArtistDetail"))
const Agent = lazy(() => import("./pages/Agent"))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } },
})

function withSuspense(el: React.ReactNode) {
  return <Suspense fallback={<Spinner />}>{el}</Suspense>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
          <Route path="formula" element={withSuspense(<Formula />)} />
          <Route path="favorites" element={withSuspense(<Favorites />)} />
          <Route path="netease" element={<NeteasePlayerProvider><Outlet /></NeteasePlayerProvider>}>
            <Route index element={withSuspense(<Netease />)} />
            <Route path=":kind/:id" element={withSuspense(<NeteaseDetail />)} />
          </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}