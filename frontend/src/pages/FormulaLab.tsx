import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import type { BiliSearchItem } from "../lib/types"
import { Autocomplete, type Suggestion } from "../components/Autocomplete"
import { Spinner, fmt } from "../components/ui"

function extractBvid(raw: string): string | null {
  const m = raw.match(/BV[0-9A-Za-z]+/i)
  return m ? m[0] : null
}

function isUrl(raw: string): boolean {
  return /https?:\/\//.test(raw) || raw.includes("b23.tv") || raw.toLowerCase().includes("bilibili")
}

function fmtDate(ts?: number | null): string {
  if (!ts) return "未知"
  try {
    return new Date(ts * 1000).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return "未知"
  }
}

const FACTORS = [
  { key: "comp_view", label: "播放", color: "#4f8cff" },
  { key: "comp_favorite", label: "收藏", color: "#ff6fae" },
  { key: "comp_like", label: "点赞", color: "#3ecf8e" },
  { key: "comp_coin", label: "硬币", color: "#ffb020" },
] as const

export default function FormulaLab() {
  const [q, setQ] = useState("")
  const [bvid, setBvid] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [candidates, setCandidates] = useState<BiliSearchItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)

  const scoreQ = useQuery({
    queryKey: ["auto-score", bvid],
    queryFn: async () => {
      if (!bvid) return null
      try {
        return await api.autoScore(bvid)
      } catch (e: any) {
        // 未在收录库：自动入库（爬虫自己爬 —— 服务端子进程回源 B站，当前出口可通），再重试算分
        const msg = String(e?.message || "")
        if (msg.includes("404")) {
          await api.ingestSong(bvid)
          return await api.autoScore(bvid)
        }
        throw e
      }
    },
    enabled: !!bvid,
    retry: false,
  })

  async function doSearch(text: string) {
    setSearching(true)
    setSearchErr(null)
    try {
      const r = await api.searchBilibili(text, 10)
      if (r.items && r.items.length) {
        setCandidates(r.items)
        setBvid(null)
      } else {
        setCandidates([])
        setSearchErr("在 B站 没搜到相关视频，换个关键词试试？")
      }
    } catch (e: any) {
      setSearchErr(String(e?.message || "搜索失败"))
    } finally {
      setSearching(false)
    }
  }

  async function resolveUrl(raw: string) {
    setSearching(true)
    setSearchErr(null)
    try {
      // 交给后端解析（支持 b23.tv 短链/重定向），并自动入库（爬虫自己爬）
      const song = await api.ingestSong(raw)
      setBvid(song.bvid)
      setTitle(song.title || raw)
      setCandidates(null)
    } catch (e: any) {
      setSearchErr(String(e?.message || "解析失败"))
    } finally {
      setSearching(false)
    }
  }

  function handleCommit(v: string) {
    const bv = extractBvid(v)
    if (bv) {
      setBvid(bv)
      setTitle(v)
      setCandidates(null)
      setSearchErr(null)
      return
    }
    if (isUrl(v)) {
      void resolveUrl(v)
      return
    }
    // 纯曲名：在 B站 搜歌名定位 BV
    void doSearch(v)
  }

  function clearAll() {
    setBvid(null)
    setQ("")
    setTitle("")
    setCandidates(null)
    setSearchErr(null)
  }

  const data = scoreQ.data
  const latest = data?.latest ?? null
  const newFactors = latest?.new ?? null
  const factorRows = newFactors
    ? FACTORS.map((f) => ({ ...f, val: (newFactors as any)[f.key] as number | null }))
    : []
  const factorTotal = factorRows.reduce((s, f) => s + (f.val ?? 0), 0)

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">
            <Link to="/">总览</Link> · 公式实验室
          </div>
          <h1>公式可视化实验室</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            把 B站 视频链接、BV 号，或直接搜曲名粘贴到下面——系统会自动爬数据、按现行公式算分并拆解，
            不用你填任何数字。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          粘贴即算分 <span className="badge">自动爬取 + 自动算分</span>
        </div>
        <div className="lib-filters">
          <Autocomplete
            value={q}
            onChange={(v) => {
              setQ(v)
              if (candidates) setCandidates(null)
            }}
            placeholder="粘贴 B站 视频链接 / BV号，或直接搜曲名…"
            fetchSuggestions={(qq) =>
              api.songSuggest(qq, 8).then((r) =>
                r.items.map(
                  (it): Suggestion => ({
                    value: it.bvid,
                    label: it.title_cn || it.title,
                    sublabel: it.bvid,
                  }),
                ),
              )
            }
            onSelectItem={(item) => {
              setBvid(item.value)
              setTitle(item.label)
              setCandidates(null)
              setSearchErr(null)
            }}
            onCommit={handleCommit}
          />
          {bvid && (
            <button className="chip" onClick={clearAll}>
              清除
            </button>
          )}
        </div>

        {searching && <Spinner />}

        {candidates && (
          <div className="bili-candidates">
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
              在 B站 搜到以下视频，点选一个：
            </div>
            {candidates.length === 0 && <div className="muted">无结果</div>}
            {candidates.map((c) => (
              <button
                key={c.bvid}
                className="cand-item"
                onClick={() => {
                  setBvid(c.bvid)
                  setTitle(c.title)
                  setCandidates(null)
                }}
              >
                <span className="cand-title">{c.title}</span>
                <span className="cand-sub">
                  {c.author} · 播放 {fmt(c.play)} · {c.bvid}
                </span>
              </button>
            ))}
          </div>
        )}

        {searchErr && <div className="error-box">{searchErr}</div>}

        {bvid && (
          <div className="muted" style={{ fontSize: 12.5, margin: "6px 0" }}>
            已选：{title || bvid}（{bvid}）
          </div>
        )}

        {scoreQ.isLoading && <Spinner />}

        {scoreQ.isError && (
          <div className="error-box">
            无法自动算分：{(scoreQ.error as any)?.message || "未知错误"}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              提示：粘贴的链接/BV 需是真实存在的 B站 视频；视频被删除或设为私享时会抓取失败。
            </div>
          </div>
        )}

        {data && !latest && (
          <div className="auto-crawled-box">
            <div className="ac-badge">已从 B站 自动抓取 ✓</div>
            <div className="song-meta-row">
              <span className="meta-title">
                {(data.live?.title) || data.song.title_cn || data.song.title}
              </span>
              <span className="muted">
                {fmtDate(data.live?.pubtime || data.song.pubtime)} 投稿 · {bvid}
              </span>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              当前 B站 数据：播放 {fmt(data.live?.view ?? 0)} · 收藏{" "}
              {fmt(data.live?.favorite ?? 0)} · 点赞 {fmt(data.live?.like ?? 0)} · 硬币{" "}
              {fmt(data.live?.coin ?? 0)} · 分享 {fmt(data.live?.share ?? 0)}
              {data.live?.author ? ` · UP ${data.live.author}` : ""}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              这首暂未上过术力口周榜，没有周榜分数可算（公式算的是周榜每周增量）。已自动把它收进收录库。
            </div>
          </div>
        )}

        {data && latest && (
          <div style={{ marginTop: 12 }}>
            <div className="song-meta-row">
              <span className="meta-title">{data.song.title_cn || data.song.title}</span>
              <span className="muted">
                {fmtDate(data.song.pubtime)} 投稿 · {bvid}
              </span>
            </div>

            <div className="score-hero">
              <div className="sh-item">
                <span className="sh-label">最新一期官方得分</span>
                <b className="sh-num">{fmt(latest.official_score ?? 0)}</b>
                <span className="sh-sub">
                  第 {latest.issue} 期 · 排名 {latest.rank ?? "-"}
                </span>
              </div>
              <div className="sh-item">
                <span className="sh-label">新公式得分</span>
                <b className="sh-num sh-new">{fmt(latest.new.total)}</b>
                <span className="sh-sub">t 时间修正 = {latest.t_new.toFixed(4)}</span>
              </div>
              <div className="sh-item">
                <span className="sh-label">旧公式得分</span>
                <b className="sh-num sh-old">{fmt(latest.old.total)}</b>
                <span className="sh-sub">t 时间修正 = {latest.t_old.toFixed(4)}</span>
              </div>
            </div>

            <div className="card-title" style={{ marginTop: 16 }}>
              得分从哪来 · 新公式因子构成
            </div>
            <div className="factor-list">
              {factorRows.map((f) => {
                const pct =
                  factorTotal > 0 && f.val != null ? Math.max(2, (f.val / factorTotal) * 100) : 0
                return (
                  <div className="factor-row" key={f.key}>
                    <span className="factor-label">{f.label}</span>
                    <div className="factor-track">
                      <div
                        className="factor-fill"
                        style={{ width: `${pct}%`, background: f.color }}
                      />
                    </div>
                    <span className="factor-val">
                      {fmt(f.val ?? 0)}
                      {newFactors!.view_implied && f.key === "comp_view" ? " *" : ""}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              * 播放贡献为反推值（官方周榜表未收录播放量，按「官方分 − 其余三因子」还原，用于说明公式构成）。
            </div>
          </div>
        )}

        {data && latest && (
          <details className="adv-toggle" style={{ marginTop: 18 }}>
            <summary>查看各期历史对比</summary>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="rank-table">
                <thead>
                  <tr>
                    <th>期</th>
                    <th>排名</th>
                    <th>官方版</th>
                    <th>官方分</th>
                    <th>新公式</th>
                    <th>旧公式</th>
                    <th>t新</th>
                    <th>t旧</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.issue}>
                      <td>{e.issue}</td>
                      <td>{e.rank}</td>
                      <td>
                        <span
                          className={
                            "tag-mini " + (e.official_version === "old" ? "tag-old" : "tag-new")
                          }
                        >
                          {e.official_version === "old" ? "旧" : "新"}
                        </span>
                      </td>
                      <td className="num">{fmt(e.official_score ?? 0)}</td>
                      <td className="num">{fmt(e.new.total)}</td>
                      <td className="num">{fmt(e.old.total)}</td>
                      <td className="num">{e.t_new.toFixed(3)}</td>
                      <td className="num">{e.t_old.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </>
  )
}
