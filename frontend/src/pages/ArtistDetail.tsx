import { useMemo } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Mic2, Music2, Crown, Flame } from "lucide-react"
import { api } from "../lib/api"
import { useTheme, getChartPalette } from "../lib/theme"
import { fmtInt, fmtWan, tierOf } from "../lib/format"
import { ChartCard } from "../components/ChartCard"
import { SkeletonTable } from "../components/Skeleton"
import type { EChartsCoreOption } from "echarts/core"

export default function ArtistDetail() {
  const { kind, name } = useParams()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const decoded = decodeURIComponent(name ?? "")
  const isVocalist = kind === "vocalist"

  const songsQ = useQuery({
    queryKey: ["artistSongs", kind, decoded],
    queryFn: () =>
      api.searchSongs(
        isVocalist ? { vocalist: decoded, limit: 200, sort: "view", order: "desc" } : { producer: decoded, limit: 200, sort: "view", order: "desc" },
      ),
  })
  const songs = useMemo(() => songsQ.data?.items ?? [], [songsQ.data])

  const stats = useMemo(() => {
    if (!songs.length) return null
    const totalView = songs.reduce((a, s) => a + (s.view ?? 0), 0)
    const legend = songs.filter((s) => s.tier === "legend" || s.tier === "myth").length
    const myth = songs.filter((s) => s.tier === "myth").length
    return { totalView, legend, myth }
  }, [songs])

  const barOpt: EChartsCoreOption | null = useMemo(() => {
    if (!songs.length) return null
    const top = songs.slice(0, 12).slice().reverse()
    return {
      grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => fmtWan(v) },
      xAxis: { type: "value", axisLabel: { color: pal.axis, formatter: (v: number) => fmtWan(v) }, splitLine: { lineStyle: { color: pal.split } } },
      yAxis: {
        type: "category",
        data: top.map((s) => s.title_cn || s.title),
        axisLabel: { color: pal.text, width: 150, overflow: "truncate" },
        axisLine: { lineStyle: { color: pal.split } },
      },
      series: [{
        type: "bar", data: top.map((s) => s.view ?? 0),
        itemStyle: { borderRadius: [0, 6, 6, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [
          { offset: 0, color: isVocalist ? "#cf2390" : "#0a84d8" },
          { offset: 1, color: isVocalist ? "#7b3fd4" : "#0a8ed6" },
        ] } },
        barWidth: "62%",
      }],
    }
  }, [songs, pal, isVocalist])

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="crumb">数据 / {isVocalist ? "歌姬" : "P主"}详情</div>
          <h1>{decoded}</h1>
        </div>
        <Link to={isVocalist ? "/vocalists" : "/artists"} className="chip" style={{ alignSelf: "center" }}>
          返回{isVocalist ? "歌姬榜" : "P主榜"}
        </Link>
      </div>

      {songsQ.isLoading ? (
        <div className="card" style={{ padding: 20 }}><SkeletonTable rows={12} /></div>
      ) : songs.length === 0 ? (
        <div className="empty">未收录该{isVocalist ? "歌姬" : "P主"}的歌曲</div>
      ) : (
        <>
          <div className="detail-head" style={{ marginBottom: 16 }}>
            <div className="t-t" style={{ fontSize: 40, width: 64, height: 64, borderRadius: 14, display: "grid", placeItems: "center", background: "var(--bg-soft)", border: "1px solid var(--border)", color: "var(--neon)" }}>
              {isVocalist ? <Mic2 size={28} /> : <Music2 size={28} />}
            </div>
            <div>
              <div className="t-t" style={{ fontSize: 22 }}>{decoded}</div>
              <div className="t-meta">
                <span><b>{fmtInt(songs.length)}</b> 首收录</span>
                <span><b>{fmtWan(stats!.totalView)}</b> 总播放</span>
                <span><Crown size={12} /> <b>{stats!.legend}</b> 传说/神话</span>
                <span><Flame size={12} /> <b>{stats!.myth}</b> 神话曲</span>
              </div>
            </div>
          </div>

          <ChartCard
            title={`${decoded} · 代表作 Top 12（按播放）`}
            option={barOpt}
            filename={`artist-${kind}-${decoded}`}
            height={360}
          />

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">全部收录歌曲（{songs.length}）</div>
            <table className="rank-table">
              <thead>
                <tr>
                  <th className="rank-no">#</th>
                  <th>曲目</th>
                  <th className="num-th">播放</th>
                  <th className="num-th">收藏</th>
                  <th className="num-th">硬币</th>
                  <th className="num-th">点赞</th>
                  <th className="num-th">在榜</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((s, i) => {
                  const t = tierOf(s.view)
                  return (
                    <tr key={s.bvid} className="song-row" onClick={() => navigate(`/song/${s.bvid}`)}>
                      <td className="rank-no">{i + 1}</td>
                      <td className="song-cell">
                        <div className="t">
                          {s.title_cn || s.title}
                          {s.title_cn && <span className="t-cn">{s.title}</span>}
                          {t.key && <span className={`t-badge ${t.key === "myth" ? "new" : "old"}`} style={{ marginLeft: 6 }}>{t.label}</span>}
                        </div>
                        <div className="meta">
                          {s.producers?.map((p: any) => p.name).join("、") || "—"}
                          {(s.vocalists?.length ?? 0) > 0 && ` · ${s.vocalists.map((v: any) => v.name).join("、")}`}
                        </div>
                      </td>
                      <td className="num-r">{fmtWan(s.view)}</td>
                      <td className="num-r">{fmtWan(s.favorite)}</td>
                      <td className="num-r">{fmtWan(s.coin)}</td>
                      <td className="num-r">{fmtWan(s.like)}</td>
                      <td className="num-r">{s.weeks_on_board ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
