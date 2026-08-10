import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { RefreshCw, TrendingUp, Search, Flame, ArrowUpRight, Brain, Eye, ThumbsUp, Coins, Star, MessageCircle, Subtitles, Sparkles, Square, Send } from "lucide-react"
import { api } from "../lib/api"
import { ChipRow, Empty, Spinner, fmt, fmtDate } from "../components/ui"
import { MarkdownLite } from "../components/MarkdownLite"
import { useDebounce } from "../hooks/useDebounce"
import { extractBv } from "../lib/bvid"
import type { AiTurn, SongThink, HotSong, MomentumItem } from "../lib/types"

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

  // 术曲思考：搜索 + 实时详情
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
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "var(--accent)",
                transition: "width .3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
            首次拉取全量约 1.2 万首，需 1–2 小时；本轮默认抓取各榜单最近 10 期，约几分钟完成
          </div>
        </div>
      )}

      {/* 模式切换 */}
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
          {/* 概览 KPI */}
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

          {/* 搜索 + 标签筛选 */}
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
          {/* 涨速榜：本轮净增概览 */}
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

function SongThinkCard({ d }: { d: SongThink }) {
  const ratios = [
    { label: "点赞率", v: d.view ? d.like / d.view : 0 },
    { label: "投币率", v: d.view ? d.coin / d.view : 0 },
    { label: "收藏率", v: d.view ? d.favorite / d.view : 0 },
    { label: "评论率", v: d.view ? d.reply / d.view : 0 },
    { label: "弹幕率", v: d.view ? d.danmaku / d.view : 0 },
  ]
  const maxR = Math.max(...ratios.map((r) => r.v), 1e-9)
  const metrics = [
    { icon: Eye, label: "浏览量", v: d.view, color: "var(--accent)" },
    { icon: ThumbsUp, label: "点赞数", v: d.like, color: "var(--green)" },
    { icon: Coins, label: "投币数", v: d.coin, color: "var(--pink)" },
    { icon: Star, label: "收藏数", v: d.favorite, color: "var(--gold)" },
    { icon: MessageCircle, label: "评论条数", v: d.reply, color: "var(--myth)" },
    { icon: Subtitles, label: "弹幕条数", v: d.danmaku, color: "var(--sky)" },
  ]
  const mm = Math.floor(d.duration / 60)
  const ss = String(d.duration % 60).padStart(2, "0")
  return (
    <div className="think-card">
      <div className="think-head">
        {d.cover && (
          <img
            className="think-cover"
            src={d.cover.startsWith("http") ? d.cover : `https:${d.cover}`}
            alt=""
          />
        )}
        <div className="think-titlewrap">
          <div className="think-title">{d.title || d.title_cn || d.bvid}</div>
          {d.title_cn && d.title_cn !== d.title && <div className="think-cn">中文名：{d.title_cn}</div>}
          <div className="think-meta">
            <span>UP：<b>{d.owner || "—"}</b></span>
            <span>分区：{d.category || "—"}</span>
            <span>投稿：{fmtDate(d.pubtime)}</span>
            <span>时长：{mm}:{ss}</span>
          </div>
          <div className="think-links">
            <a href={`https://www.bilibili.com/video/${d.bvid}`} target="_blank" rel="noreferrer" className="ext-link">B站原视频 ↗</a>
            <Link to={`/song/${d.bvid}`} className="ext-link">单曲详情页 ↗</Link>
          </div>
        </div>
      </div>

      <div className="think-metrics">
        {metrics.map((m) => (
          <div className="metric-tile" key={m.label}>
            <m.icon size={16} style={{ color: m.color }} />
            <div className="metric-val" style={{ color: m.color }}>{fmt(m.v)}</div>
            <div className="metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="think-section-title">互动健康度（占浏览量比例）</div>
      <div className="ratio-list">
        {ratios.map((r) => (
          <div className="ratio-row" key={r.label}>
            <span className="ratio-label">{r.label}</span>
            <div className="ratio-track"><div className="ratio-fill" style={{ width: `${(r.v / maxR) * 100}%` }} /></div>
            <span className="ratio-pct">{(r.v * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>

      {d.desc && (
        <div className="think-desc">
          <div className="think-section-title">视频简介</div>
          <div className="think-desc-body">{d.desc}</div>
        </div>
      )}

      <div className="think-foot">数据实时抓取自 B站 · 更新于 {fmtDate(d.fetched_at)}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 术曲思考 · AI 深度分析（本地大模型，多轮对话）
// 复用后端 /api/ai/stream-song：system + 一次注入真实数据 + 完整对话历史。
// 通用 /api/ai/stream 已预留给其它页面。
// 该模型为思维链蒸馏模型，始终会先思考再作答；思考过程可折叠查看。
// ---------------------------------------------------------------------------
const AI_PRESETS = [
  { label: "🩺 互动健康度", ask: "请重点分析这首曲子的互动健康度：点赞率、投币率、收藏率、评论率、弹幕率各处于什么水平，哪些指标异常，说明原因。" },
  { label: "🚀 破圈潜力", ask: "请重点评估这首曲子的破圈潜力：有没有可能被搬运、翻唱或二创，走向圈外，依据数据说明理由。" },
  { label: "📣 运营建议", ask: "请给 UP 主一些可落地的运营建议：针对这首曲子的数据短板，具体该做哪些事来提升热度。" },
  { label: "⚠️ 风险提示", ask: "请评估这首曲子当前的风险：是否存在热度见顶、数据异常、受众错位等问题，以及如何应对。" },
]

function SongAIAnalysis({ d }: { d: SongThink }) {
  const [conv, setConv] = useState<AiTurn[]>([])
  const [question, setQuestion] = useState("")
  const [pending, setPending] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReasoning, setShowReasoning] = useState(true)
  const [cacheHit, setCacheHit] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bufRef = useRef("")
  const rBufRef = useRef("")
  const errRef = useRef(false)
  const doneRef = useRef(false)
  const cacheHitRef = useRef(false)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  const [modelInfo, setModelInfo] = useState<{ model?: string; active?: string; cloud?: boolean }>({})

  useEffect(() => {
    let alive = true
    api
      .aiHealth()
      .then((r) => {
        if (!alive) return
        setModelReady(r.ready)
        setModelInfo({ model: r.model, active: r.active, cloud: r.cloud })
      })
      .catch(() => alive && setModelReady(false))
    return () => {
      alive = false
    }
  }, [])

  const modelLabel =
    modelInfo.cloud === true
      ? `云端模型 ● ${modelInfo.model || ""}`
      : modelInfo.active === "2b"
        ? `本地模型 ● 2B（降级）`
        : `本地模型 ● 4B`

  // 切换歌曲时清空对话
  useEffect(() => {
    setConv([])
    setPending("")
    setReasoning("")
    setError(null)
    setQuestion("")
    setCacheHit(false)
    bufRef.current = ""
    rBufRef.current = ""
    errRef.current = false
    doneRef.current = false
    cacheHitRef.current = false
  }, [d.bvid])

  const run = (prefilled?: string) => {
    if (loading) return
    const text = (prefilled ?? question).trim()
    if (conv.length > 0 && !text) return // 追问必须有内容
    const userTurn: AiTurn = {
      role: "user",
      content: text || "请对该曲做一次全面的互动健康度与传播力分析。",
    }
    const history = [...conv, userTurn]
    setConv(history)
    setQuestion("")
    setPending("")
    setReasoning("")
    setShowReasoning(true)
    setError(null)
    setCacheHit(false)
    cacheHitRef.current = false
    setLoading(true)
    bufRef.current = ""
    rBufRef.current = ""
    errRef.current = false
    doneRef.current = false
    const ctrl = new AbortController()
    abortRef.current = ctrl
    api.aiStreamSong(d.bvid, history, {
      signal: ctrl.signal,
      onContent: (t) => {
        bufRef.current += t
        setPending(bufRef.current)
      },
      onReasoning: (t) => {
        rBufRef.current += t
        setReasoning(rBufRef.current)
      },
      onCache: (hit) => {
        cacheHitRef.current = hit
        setCacheHit(hit)
      },
      onError: (msg) => {
        errRef.current = true
        setError(msg)
        setLoading(false)
        abortRef.current = null
      },
      onDone: () => {
        if (doneRef.current) return // 防止重复提交（onDone 只应触发一次）
        doneRef.current = true
        if (!errRef.current) {
          setConv((c) => [
            ...c,
            {
              role: "assistant",
              content: bufRef.current,
              reasoning: rBufRef.current,
              cached: cacheHitRef.current,
            },
          ])
        }
        setPending("")
        setLoading(false)
        abortRef.current = null
      },
    })
  }

  const stop = () => {
    abortRef.current?.abort()
    setLoading(false)
  }

  const canSend = !loading && (conv.length === 0 || question.trim().length > 0)

  // 单个 AI 气泡：思维链顶部内联 + 正文，可折叠；isLive 表示是否带光标（流式中）
  const renderAi = (r: string, c: string, isLive: boolean) => (
    <div className="ai-bubble ai">
      {r && (
        <details className="ai-think" open={showReasoning} onToggle={(e) => setShowReasoning((e.target as HTMLDetailsElement).open)}>
          <summary>🧠 模型思考链</summary>
          <div className="ai-reasoning-body">{r}</div>
        </details>
      )}
      <div className="ai-bubble-main">
        {c ? <MarkdownLite text={c} /> : isLive && <span className="ai-cursor-only">▍</span>}
        {isLive && c && <span className="ai-cursor">▍</span>}
      </div>
    </div>
  )

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div className="ai-title">
          <Sparkles size={15} style={{ color: "var(--accent)", verticalAlign: -2 }} />
          AI 分析师
          <span className={`ai-dot ${modelReady === true ? "ok" : modelReady === false ? "bad" : ""}`} title={modelReady ? "本地模型已就绪" : "本地模型离线"}>
            {modelReady === true ? modelLabel : modelReady === false ? "模型离线 ○" : "检测中…"}
          </span>
        </div>
        <div className="ai-sub">基于上方真实互动数据，由 AI 大模型深度分析 · 可连续追问</div>
      </div>

      {/* 一键分析预设 */}
      <div className="ai-presets">
        {AI_PRESETS.map((p) => (
          <button key={p.label} className="chip" disabled={loading} onClick={() => run(p.ask)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* 对话区 */}
      <div className="ai-chat">
        {conv.length === 0 && !pending && (
          <div className="ai-empty">输入问题或点上方预设，AI 就会基于该曲真实数据给出深度分析 👇</div>
        )}
        {conv.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ai-bubble user">{t.content}</div>
          ) : (
            <div key={`a-${i}`}>
              {t.cached && <span className="ai-cache-badge">⚡ 命中缓存</span>}
              {renderAi(t.reasoning || "", t.content, false)}
            </div>
          ),
        )}
        {(pending || reasoning) && (
          <div key="ai-live">
            {cacheHit && <span className="ai-cache-badge">⚡ 命中缓存 · 秒回</span>}
            {renderAi(reasoning, pending, true)}
          </div>
        )}
        {loading && !pending && !reasoning && (
          <div className="ai-thinking">
            {modelInfo.cloud
              ? "AI 正在生成分析…（云端模型，通常数秒内返回）"
              : "AI 正在深入思考并生成分析…（本地模型不限制思考长度，通常需要 1–4 分钟）"}
          </div>
        )}
      </div>

      {error && <div className="callout callout-err">分析失败：{error}（请确认本地模型服务已启动）</div>}

      {/* 输入区 */}
      <div className="ai-input-row">
        <textarea
          className="ai-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (canSend) run()
            }
          }}
          placeholder={conv.length === 0 ? "想让 AI 重点关注什么？如：它为什么能火 / 和同类术曲相比如何（留空则全面分析）" : "继续追问…（Enter 发送，Shift+Enter 换行）"}
          rows={2}
        />
        {!loading ? (
          <button className="chip primary" disabled={!canSend} onClick={() => run()}>
            <Send size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            发送
          </button>
        ) : (
          <button className="chip" onClick={stop}>
            <Square size={12} style={{ marginRight: 5, verticalAlign: -2, fill: "currentColor" }} />
            停止
          </button>
        )}
      </div>
    </div>
  )
}
