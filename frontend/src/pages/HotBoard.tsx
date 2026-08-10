import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { RefreshCw, TrendingUp, Search, Flame, ArrowUpRight, Brain } from "lucide-react"
import { api } from "../lib/api"
import { ChipRow, Empty, Spinner, fmt, fmtDate } from "../components/ui"
import { useDebounce } from "../hooks/useDebounce"
import { extractBv } from "../lib/bvid"
import type { HotSong, MomentumItem } from "../lib/types"
import { SongThinkCard } from "./HotBoard/SongThinkCard"
import { SongAIAnalysis } from "./HotBoard/SongAIAnalysis"

const SORTS = [
  { key: "score", label: "综合热度" },
  { key: "view", label: "播放" },
  { key: "favorite", label: "收藏" },
  { key: "coin", label: "硬币" },
  { key: "like", label: "点赞" },
  { key: "share", label: "分享" },
  { key: "pubtime", label: "最新投稿" },
]

const TIERS = [
  { key: "", label: "全部" },
  { key: "hall", label: "殿堂曲" },
  { key: "legend", label: "传说曲" },
  { key: "myth", label: "神话曲" },
]

const MOMENTUM_METRICS = [
  { key: "view", label: "播放增量" },
  { key: "score", label: "涨速综合分" },
  { key: "favorite", label: "收藏增量" },
  { key: "coin", label: "硬币增量" },
  { key: "like", label: "点赞增量" },
  { key: "share", label: "分享增量" },
]

function tierTag(view: number): { label: string; cls: string } | null {
  if (!view) return null
  if (view >= 10_000_000) return { label: "神话", cls: "tag-myth" }
  if (view >= 1_000_000) return { label: "传说", cls: "tag-legend" }
  if (view >= 100_000) return { label: "殿堂", cls: "tag-hall" }
  return null
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="c-faint">—</span>
  if (value === 0) return <span className="c-faint">0</span>
  const up = value > 0
  return (
    <span className={up ? "delta up" : "delta down"}>
      {up ? "▲" : "▼"} {fmt(Math.abs(value))}
    </span>
  )
}

export default function HotBoard() {
  const [mode, setMode] = useState<"board" | "momentum" | "think">("board")
  const [sort, setSort] = useState("score")
  const [mMetric, setMMetric] = useState("view")
  const [page, setPage] = useState(0)
  const [tier, setTier] = useState("")
  const [qInput, setQInput] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const debouncedQ = useDebounce(qInput, 350)

  const { data: st, refetch: refetchStatus } = useQuery({
    queryKey: ["hot-status"],
    queryFn: api.hotStatus,
    refetchInterval: refreshing ? 2000 : false,
  })

  useEffect(() => {
    if (st?.running) setRefreshing(true)
  }, [st?.running])

  const qArg = debouncedQ.trim() ? extractBv(debouncedQ) ?? debouncedQ.trim() : undefined

  const boardQ = useQuery({
    queryKey: ["hot-songs", sort, page, tier, qArg ?? "", mode],
    queryFn: () => api.hotSongs(sort, 50, page * 50, qArg, tier || undefined),
    placeholderData: (prev) => prev,
    enabled: mode === "board",
  })

  const momQ = useQuery({
    queryKey: ["hot-momentum", mMetric, page],
    queryFn: () => api.hotMomentum(mMetric, 50, page * 50),
    placeholderData: (prev) => prev,
    enabled: mode === "momentum",
  })

  const [thinkInput, setThinkInput] = useState("")
  const [selBvid, setSelBvid] = useState<string | null>(null)
  const debouncedThink = useDebounce(thinkInput, 350)
  const bvidFromInput = debouncedThink.trim() ? extractBv(debouncedThink) : null

  useEffect(() => {
    if (bvidFromInput) setSelBvid(bvidFromInput)
  }, [bvidFromInput])

  const thinkSearchQ = useQuery({
    queryKey: ["think-search", debouncedThink],
    queryFn: () => api.thinkSearch(debouncedThink),
    enabled: !!debouncedThink.trim() && !bvidFromInput,
    placeholderData: (prev) => prev,
  })
  const thinkDetailQ = useQuery({
    queryKey: ["think-detail", selBvid],
    queryFn: () => api.thinkDetail(selBvid!),
    enabled: !!selBvid,
  })

  const items = mode === "board" ? boardQ.data?.items ?? [] : momQ.data?.items ?? []
  const total = mode === "board" ? boardQ.data?.total ?? 0 : momQ.data?.total ?? 0
  const summary = boardQ.data?.summary
  const momSummary = momQ.data?.summary

  const startRefresh = async () => {
    try {
      await api.hotRefresh("recent")
      setRefreshing(true)
    } catch {
      setRefreshing(true)
    }
    refetchStatus()
    boardQ.refetch()
    momQ.refetch()
  }

  const pct =
    st && st.total > 0 ? Math.min(100, Math.round((st.done / st.total) * 100)) : 0

  const currentLabel = SORTS.find((s) => s.key === sort)?.label ?? SORTS[0].label
  const currentTierLabel = TIERS.find((t) => t.key === tier)?.label ?? TIERS[0].label
  const currentMMetricLabel = MOMENTUM_METRICS.find((m) => m.key === mMetric)?.label ?? MOMENTUM_METRICS[0].label

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">数据 · B站实时</div>
          <h1>实时热度</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
            已缓存 {st?.ok_count ?? 0} 首
            {st?.last_fetch ? ` · 更新于 ${fmtDate(st.last_fetch)}` : ""}
          </span>
          <button className="chip" onClick={startRefresh} disabled={refreshing}>
            <RefreshCw size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            {refreshing ? "刷新中…" : "刷新数据"}
          </button>
        </div>
      </div>

      {refreshing && st && (
        <div className="card" style={{ marginBottom: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 8 }}>
            <span style={{ color: "var(--text-faint)" }}>
              {st.message ?? "抓取中"} · {st.done}/{st.total}
            </span>
            <span style={{ color: "var(--text-faint)" }}>
              成功 {st.ok} · 删除 {st.deleted} · 失败 {st.failed}
            </span>
          </div>
          <div style={{ height: 6, background: "var(--bg-soft)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", transition: "width .3s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
            首次拉取全量约 1.2 万首，需 1–2 小时；本轮默认抓取各榜单最近 10 期，约几分钟完成
          </div>
        </div>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={`seg-btn${mode === "board" ? " active" : ""}`} onClick={() => { setMode("board"); setPage(0) }}>
          <TrendingUp size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
          综合榜
        </button>
        <button className={`seg-btn${mode === "momentum" ? " active" : ""}`} onClick={() => { setMode("momentum"); setPage(0) }}>
          <Flame size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
          涨速榜
        </button>
        <button className={`seg-btn${mode === "think" ? " active" : ""}`} onClick={() => { setMode("think"); setPage(0) }}>
          <Brain size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
          术曲思考
        </button>
      </div>

      {mode === "board" ? (
        <>
          <div className="hot-kpi">
            <div className="kpi">
              <div className="kpi-val">{summary ? fmt(summary.total) : "—"}</div>
              <div className="kpi-label">收录曲数</div>
            </div>
            <div className="kpi">
              <div className="kpi-val">{summary ? fmt(summary.view_sum) : "—"}</div>
              <div className="kpi-label">总播放量</div>
            </div>
            <div className="kpi">
              <div className="kpi-val" style={{ color: "var(--gold)" }}>{summary ? fmt(summary.legend) : "—"}</div>
              <div className="kpi-label">传说曲</div>
            </div>
            <div className="kpi">
              <div className="kpi-val" style={{ color: "var(--myth)" }}>{summary ? fmt(summary.myth) : "—"}</div>
              <div className="kpi-label">神话曲</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div className="hot-search">
                <Search size={14} style={{ color: "var(--text-faint)" }} />
                <input
                  type="text"
                  value={qInput}
                  onChange={(e) => { setQInput(e.target.value); setPage(0) }}
                  placeholder="搜索标题 / UP主 / 粘 B站链接自动提取 BV"
                  style={{ border: "none", background: "transparent", outline: "none", color: "inherit", flex: 1, minWidth: 220, fontSize: 13 }}
                />
              </div>
              <span style={{ fontSize: 12, color: "var(--text-faint)", alignSelf: "center" }}>标签：</span>
              <ChipRow
                issues={TIERS.map((t) => ({ issue: t.label }))}
                value={currentTierLabel}
                onChange={(label) => {
                  setTier(TIERS.find((t) => t.label === label)?.key ?? "")
                  setPage(0)
                }}
              />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-faint)", alignSelf: "center" }}>排序：</span>
              <ChipRow
                issues={SORTS.map((s) => ({ issue: s.label }))}
                value={currentLabel}
                onChange={(label) => {
                  setSort(SORTS.find((s) => s.label === label)?.key ?? "score")
                  setPage(0)
                }}
              />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
              综合热度 = 播放 + 收藏×15 + 硬币×30 + 点赞×3（Biliboard 周榜权重，累计口径）；「较上次」为相对最近一次快照的增量
            </div>
          </div>

          <div className="card">
            {boardQ.isLoading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <Empty label="暂无数据，点击右上角刷新数据" />
            ) : (
              <>
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>歌曲</th>
                      <th>UP主</th>
                      <th className="num-th">投稿日期</th>
                      <th className="num-th">播放</th>
                      <th className="num-th">收藏</th>
                      <th className="num-th">硬币</th>
                      <th className="num-th">点赞</th>
                      <th className="num-th">分享</th>
                      <th className="num-th">综合热度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items as HotSong[]).map((it, i) => {
                      const tt = tierTag(it.view)
                      return (
                        <tr key={it.bvid}>
                          <td className="rank-no">{page * 50 + i + 1}</td>
                          <td className="song-cell">
                            <Link to={`/song/${it.bvid}`} className="t">
                              {it.title || it.title_cn || it.bvid}
                            </Link>
                            <div className="meta">
                              {tt && <span className={`tag-mini ${tt.cls}`} style={{ marginRight: 6 }}>{tt.label}</span>}
                              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{it.bvid}</span>
                            </div>
                            <div className="meta">
                              <a href={`https://www.bilibili.com/video/${it.bvid}`} target="_blank" rel="noreferrer" className="ext-link">
                                B站原视频 ↗
                              </a>
                            </div>
                            {it.title_cn && it.title_cn !== it.title && (
                              <div className="meta">中文名：{it.title_cn}</div>
                            )}
                          </td>
                          <td className="num">{it.owner || "—"}</td>
                          <td className="num">{fmtDate(it.pubtime)}</td>
                          <td className="num">
                            {fmt(it.view)}
                            <div><Delta value={it.dv} /></div>
                          </td>
                          <td className="num">{fmt(it.favorite)}</td>
                          <td className="num">{fmt(it.coin)}</td>
                          <td className="num">{fmt(it.like)}</td>
                          <td className="num">{fmt(it.share)}</td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            <TrendingUp size={12} style={{ verticalAlign: -1, marginRight: 3, color: "var(--accent)" }} />
                            {fmt(it.score)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                  <button className="chip" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
                  <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-faint)" }}>
                    第 {page + 1} 页 · 共 {total} 首
                  </span>
                  <button className="chip" disabled={total <= (page + 1) * 50} onClick={() => setPage(page + 1)}>下一页</button>
                </div>
              </>
            )}
          </div>
        </>
      ) : mode === "momentum" ? (
        <>
          {momQ.data?.has_baseline === false ? (
            <div className="card" style={{ marginBottom: 14, padding: 16 }}>
              <div className="callout">
                涨速榜需要<strong>至少两次刷新快照</strong>才能计算。请先在右上角「刷新数据」抓取一轮，待下一次刷新后即可看到各曲的播放增量与涨速综合分。
              </div>
            </div>
          ) : (
            momSummary && (
              <div className="momentum-bar">
                <div className="mb-item">
                  <div className="mb-val up">+{fmt(momSummary.net_view)}</div>
                  <div className="mb-label">本轮净增播放 · {momSummary.window_days}天</div>
                </div>
                <div className="mb-item">
                  <div className="mb-val">+{fmt(momSummary.net_favorite)}</div>
                  <div className="mb-label">净增收藏</div>
                </div>
                <div className="mb-item">
                  <div className="mb-val">+{fmt(momSummary.net_coin)}</div>
                  <div className="mb-label">净增硬币</div>
                </div>
                <div className="mb-item">
                  <div className="mb-val">+{fmt(momSummary.net_like)}</div>
                  <div className="mb-label">净增点赞</div>
                </div>
                <div className="mb-item">
                  <div className="mb-val" style={{ color: "var(--text-dim)" }}>{fmt(momSummary.tracked)}</div>
                  <div className="mb-label">追踪曲数</div>
                </div>
              </div>
            )
          )}

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-faint)", alignSelf: "center" }}>排序维度：</span>
              <ChipRow
                issues={MOMENTUM_METRICS.map((m) => ({ issue: m.label }))}
                value={currentMMetricLabel}
                onChange={(label) => {
                  setMMetric(MOMENTUM_METRICS.find((m) => m.label === label)?.key ?? "view")
                  setPage(0)
                }}
              />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
              涨速综合分 = 播放增量 + 收藏增量×15 + 硬币增量×30 + 点赞增量×3；数据来自最近两次快照差分，仅统计两次都收录的歌曲
            </div>
          </div>

          <div className="card">
            {momQ.isLoading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <Empty label={momQ.data?.has_baseline === false ? "暂无快照基线" : "暂无数据"} />
            ) : (
              <>
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>歌曲</th>
                      <th>UP主</th>
                      <th className="num-th">周期(天)</th>
                      <th className="num-th">播放增量</th>
                      <th className="num-th">日均增量</th>
                      <th className="num-th">收藏增量</th>
                      <th className="num-th">硬币增量</th>
                      <th className="num-th">涨速综合分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items as MomentumItem[]).map((it, i) => {
                      const rank = page * 50 + i + 1
                      const burst = rank <= 3
                      return (
                        <tr key={it.bvid}>
                          <td className="rank-no">
                            {rank}
                            {burst && <span className="burst-badge" title="涨势 Top 3">🔥</span>}
                          </td>
                          <td className="song-cell">
                            <Link to={`/song/${it.bvid}`} className="t">
                              {it.title || it.title_cn || it.bvid}
                            </Link>
                            <div className="meta">
                              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{it.bvid}</span>
                            </div>
                            {it.title_cn && it.title_cn !== it.title && (
                              <div className="meta">中文名：{it.title_cn}</div>
                            )}
                          </td>
                          <td className="num">{it.owner || "—"}</td>
                          <td className="num">{it.window_days}</td>
                          <td className="num">
                            <span className="delta up"><ArrowUpRight size={11} style={{ verticalAlign: -1 }} />{fmt(it.dv)}</span>
                          </td>
                          <td className="num">{fmt(it.day_view)}/天</td>
                          <td className="num">+{fmt(it.df)}</td>
                          <td className="num">+{fmt(it.dc)}</td>
                          <td className="num" style={{ fontWeight: 600, color: "var(--accent)" }}>
                            {fmt(it.dscore)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                  <button className="chip" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
                  <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-faint)" }}>
                    第 {page + 1} 页 · 共 {total} 首
                  </span>
                  <button className="chip" disabled={total <= (page + 1) * 50} onClick={() => setPage(page + 1)}>下一页</button>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="hot-search" style={{ marginBottom: 12 }}>
              <Search size={14} style={{ color: "var(--text-faint)" }} />
              <input
                type="text"
                value={thinkInput}
                onChange={(e) => { setThinkInput(e.target.value); setSelBvid(null) }}
                placeholder="搜索术曲：中文名 / BV号 / 粘 B站链接自动识别"
                style={{ border: "none", background: "transparent", outline: "none", color: "inherit", flex: 1, minWidth: 220, fontSize: 13 }}
              />
            </div>
            {bvidFromInput ? (
              <div className="think-hint">已识别 BV：<b style={{ fontFamily: "var(--mono)" }}>{bvidFromInput}</b>，正在拉取实时数据…</div>
            ) : thinkSearchQ.data?.items?.length ? (
              <div className="think-cands">
                {thinkSearchQ.data.items.map((c) => (
                  <button key={c.bvid} className="compare-result" onClick={() => setSelBvid(c.bvid)}>
                    <span className="t">{c.title_cn || c.title || c.bvid}</span>
                    <span className="meta">{c.bvid}{c.owner ? ` · ${c.owner}` : ""}</span>
                  </button>
                ))}
              </div>
            ) : debouncedThink.trim() && !thinkSearchQ.isLoading ? (
              <div className="think-hint">未找到匹配术曲，换个关键词试试（支持中文名 / BV号 / B站链接）</div>
            ) : null}
          </div>

          {thinkDetailQ.isLoading ? (
            <div className="card"><Spinner /></div>
          ) : thinkDetailQ.isError ? (
            <div className="card"><div className="callout">未找到该单曲的实时数据：可能 BV 有误、视频已删除或触发 B站风控（请稍后重试）。</div></div>
          ) : thinkDetailQ.data ? (
            <>
              <SongThinkCard d={thinkDetailQ.data} />
              <SongAIAnalysis d={thinkDetailQ.data} />
            </>
          ) : null}
        </>
      )}
    </>
  )
}
