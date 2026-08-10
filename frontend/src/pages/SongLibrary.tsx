import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUp, ArrowDown } from "lucide-react"
import { api } from "../lib/api"
import { useDebounce } from "../hooks/useDebounce"
import { Autocomplete, type Suggestion } from "../components/Autocomplete"
import { Empty, Spinner, fmt, fmtDate, downloadCSV, downloadJSON } from "../components/ui"
import { extractBv } from "../lib/bvid"
import type { Song } from "../lib/types"

const PAGE_SIZE = 50

type SortKey = "pubtime" | "view" | "favorite" | "coin" | "like" | "weeks" | "best_rank"

const TIER_META: Record<string, { label: string; cls: string }> = {
  hall: { label: "殿堂曲", cls: "tag-hall" },
  legend: { label: "传说曲", cls: "tag-legend" },
  myth: { label: "神话曲", cls: "tag-myth" },
}

type COL = { key: string; label: string; sort?: SortKey; r?: boolean; c?: boolean }
const COLS: COL[] = [
  { key: "id", label: "#" },
  { key: "title", label: "标题" },
  { key: "title_cn", label: "中文名" },
  { key: "producers", label: "P主" },
  { key: "vocalists", label: "歌姬" },
  { key: "pubtime", label: "投稿", sort: "pubtime", r: true },
  { key: "view", label: "播放", sort: "view", r: true },
  { key: "favorite", label: "收藏", sort: "favorite", r: true },
  { key: "coin", label: "投币", sort: "coin", r: true },
  { key: "like", label: "点赞", sort: "like", r: true },
  { key: "tier", label: "标签", c: true },
  { key: "weeks", label: "上榜周", sort: "weeks", r: true },
  { key: "best_rank", label: "最佳", sort: "best_rank", r: true },
]

function toUnixDate(v: string, end = false): number | undefined {
  if (!v) return undefined
  const t = new Date(v + (end ? "T23:59:59" : "T00:00:00")).getTime()
  if (Number.isNaN(t)) return undefined
  return Math.floor(t / 1000)
}

function songRows(items: Song[]) {
  const headers = ["序号", "bvid", "标题", "中文名", "P主", "歌姬", "投稿日期", "播放", "收藏", "投币", "点赞", "标签", "上榜周数", "最佳排名"]
  const rows = items.map((it, i) => [
    i + 1,
    it.bvid,
    it.title,
    it.title_cn ?? "",
    (it.producers ?? []).map((p) => p.name).join("/"),
    (it.vocalists ?? []).map((v) => v.name).join("/"),
    fmtDate(it.pubtime),
    it.view ?? "",
    it.favorite ?? "",
    it.coin ?? "",
    it.like ?? "",
    it.tier ? TIER_META[it.tier].label : "",
    it.weeks_on_board ?? "",
    it.best_rank ?? "",
  ])
  return { headers, rows }
}

export default function SongLibrary() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const q = params.get("q") ?? ""
  const producer = params.get("producer") ?? ""
  const vocalist = params.get("vocalist") ?? ""
  const board = params.get("board") ?? ""
  const tier = params.get("tier") ?? ""
  const sort = (params.get("sort") as SortKey) ?? "id"
  const order = (params.get("order") as "asc" | "desc") ?? "desc"
  const page = Number(params.get("page") ?? "0") || 0
  const minWeeks = Number(params.get("min_weeks") ?? "0") || 0
  const dateFrom = params.get("from") ?? ""
  const dateTo = params.get("to") ?? ""
  const minViewWan = Number(params.get("minv") ?? "0") || 0
  const maxViewWan = Number(params.get("maxv") ?? "0") || 0

  // q 走本地输入 + 防抖自动提交，避免每键一次请求
  const [qInput, setQInput] = useState(q)
  const debouncedQ = useDebounce(qInput, 350)
  useEffect(() => {
    if (debouncedQ !== q) setParam("q", debouncedQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ])

  const [producerInput, setProducerInput] = useState(producer)
  useEffect(() => setProducerInput(producer), [producer])

  function setParam(name: string, value: string, keepPage = false) {
    const next = new URLSearchParams(params)
    if (value === "" || value == null) next.delete(name)
    else next.set(name, value)
    if (!keepPage && name !== "page") next.delete("page")
    setParams(next, { replace: true })
  }

  const filters = useMemo(
    () => ({ q, producer, vocalist, board, tier, sort, order, page, minWeeks, dateFrom, dateTo, minViewWan, maxViewWan }),
    [q, producer, vocalist, board, tier, sort, order, page, minWeeks, dateFrom, dateTo, minViewWan, maxViewWan],
  )

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["song-search", filters],
    queryFn: () =>
      api.searchSongs({
        q,
        producer: producer || undefined,
        vocalist: vocalist || undefined,
        board: board || undefined,
        tier: tier || undefined,
        sort,
        order,
        minWeeks: minWeeks || undefined,
        minView: minViewWan ? minViewWan * 10000 : undefined,
        maxView: maxViewWan ? maxViewWan * 10000 : undefined,
        pubFrom: toUnixDate(dateFrom),
        pubTo: toUnixDate(dateTo, true),
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  })

  // 筛选面：tier 分布 + 歌姬候选
  const facetsQ = useQuery({ queryKey: ["song-facets"], queryFn: api.songFacets })
  const vocalistsQ = useQuery({ queryKey: ["voc-dropdown"], queryFn: () => api.vocalists(200) })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const fromNo = total === 0 ? 0 : page * PAGE_SIZE + 1
  const toNo = Math.min(total, (page + 1) * PAGE_SIZE)

  async function exportAll(kind: "csv" | "json") {
    const res = await api.searchSongs({
      q,
      producer: producer || undefined,
      vocalist: vocalist || undefined,
      board: board || undefined,
      tier: tier || undefined,
      sort,
      order,
      minWeeks: minWeeks || undefined,
      minView: minViewWan ? minViewWan * 10000 : undefined,
      maxView: maxViewWan ? maxViewWan * 10000 : undefined,
      pubFrom: toUnixDate(dateFrom),
      pubTo: toUnixDate(dateTo, true),
      limit: 5000,
      offset: 0,
    })
    const stamp = new Date().toISOString().slice(0, 10)
    if (kind === "csv") {
      const { headers, rows } = songRows(res.items)
      downloadCSV(headers, rows, `术力口歌曲库_${stamp}`)
    } else {
      downloadJSON(res.items, `术力口歌曲库_${stamp}`)
    }
  }

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setParam("order", order === "desc" ? "asc" : "desc", true)
    } else {
      setParam("sort", key)
      setParam("order", "desc")
    }
  }

  function resetAll() {
    setParams(new URLSearchParams(), { replace: true })
    setQInput("")
    setProducerInput("")
  }

  const tierMeta = tier ? TIER_META[tier] : null

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">数据 · 收录池</div>
          <h1>歌曲库</h1>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          {facetsQ.data ? `${facetsQ.data.total.toLocaleString()} 首收录` : "…"}
          {facetsQ.data && facetsQ.data.with_metrics > 0 && (
            <span> · {facetsQ.data.with_metrics.toLocaleString()} 首有播放指标</span>
          )}
        </div>
      </div>

      <div className="card">
        {/* 关键词（联想）+ P主 */}
        <div className="searchbox">
          <Autocomplete
            value={qInput}
            onChange={setQInput}
            placeholder="搜索标题 / 中文名 / bvid / 可直接粘贴 B站链接"
            fetchSuggestions={useCallback(
              (q) =>
                api.songSuggest(extractBv(q) ?? q, 8).then((r) =>
                  r.items.map(
                    (it): Suggestion => ({
                      value: it.title,
                      label: it.title,
                      sublabel: it.title_cn || undefined,
                      meta: it.bvid,
                    }),
                  ),
                ),
              [],
            )}
            onSelectItem={(item) => navigate(`/song/${item.meta as string}`)}
            onCommit={(v) => {
              const bv = extractBv(v)
              if (bv) {
                // 来自 B站链接或纯 BV 号：提取后填入搜索框并过滤，不跳走
                setQInput(bv)
                setParam("q", bv)
              } else {
                setParam("q", v)
              }
            }}
          />
          <input
            type="text"
            placeholder="P主（回车搜索）"
            value={producerInput}
            onChange={(e) => setProducerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("producer", producerInput.trim()) }}
            style={{ maxWidth: 150 }}
          />
        </div>

        {/* 筛选面 */}
        <div className="lib-filters">
          <select className="chip" value={vocalist} onChange={(e) => setParam("vocalist", e.target.value)}>
            <option value="">全部歌姬</option>
            {(vocalistsQ.data?.items ?? []).map((v) => (
              <option key={v.name} value={v.name}>{v.name}（{v.songs}）</option>
            ))}
          </select>
          <select className="chip" value={tier} onChange={(e) => setParam("tier", e.target.value)}>
            <option value="">全部标签</option>
            <option value="myth">神话曲（千万）</option>
            <option value="legend">传说曲（百万）</option>
            <option value="hall">殿堂曲（十万）</option>
            <option value="has">已达成里程碑</option>
            <option value="none">未达殿堂</option>
          </select>
          <select className="chip" value={board} onChange={(e) => setParam("board", e.target.value)}>
            <option value="">全部榜单</option>
            <option value="weekly">上过周榜</option>
            <option value="legend">上过传说榜</option>
            <option value="annual">上过年榜</option>
          </select>
          <input
            className="num-in" type="number" min={0} placeholder="上榜≥周"
            value={minWeeks || ""}
            onChange={(e) => setParam("min_weeks", String(Math.max(0, Number(e.target.value) || 0)))}
          />
          <input
            className="date-in" type="date" value={dateFrom}
            onChange={(e) => setParam("from", e.target.value)}
          />
          <span style={{ color: "var(--text-faint)", fontSize: 12 }}>~</span>
          <input
            className="date-in" type="date" value={dateTo}
            onChange={(e) => setParam("to", e.target.value)}
          />
          <input
            className="num-in" type="number" min={0} placeholder="播放≥万"
            value={minViewWan || ""}
            onChange={(e) => setParam("minv", String(Math.max(0, Number(e.target.value) || 0)))}
          />
          <input
            className="num-in" type="number" min={0} placeholder="播放≤万"
            value={maxViewWan || ""}
            onChange={(e) => setParam("maxv", String(Math.max(0, Number(e.target.value) || 0)))}
          />
          <span className="spacer" />
          <button className="lib-reset" onClick={resetAll}>重置</button>
        </div>

        {/* 工具栏：结果数 + 导出 */}
        <div className="board-toolbar">
          <span className="lib-count">
            {isFetching && !isLoading ? "更新中… " : ""}
            共 {total.toLocaleString()} 首
            {total > 0 && ` · 第 ${fromNo}–${toNo} 首`}
            {tierMeta && ` · ${tierMeta.label}`}
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="chip" onClick={() => exportAll("csv")}>导出 CSV</button>
          <button className="chip" onClick={() => exportAll("json")}>导出 JSON</button>
        </div>

        {isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty label="未找到，试试放宽筛选或输入日文原标题" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="rank-table">
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={(c.r ? "num-th " : "") + (c.sort ? "th-sort" : "") + (c.c ? "c" : "")}
                      style={c.r ? { textAlign: "right" } : c.c ? { textAlign: "center" } : undefined}
                      onClick={c.sort ? () => toggleSort(c.sort!) : undefined}
                    >
                      {c.label}
                      {c.sort && sort === c.sort && (
                        <span className="arr">{order === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const tm = it.tier ? TIER_META[it.tier] : null
                  return (
                    <tr
                      key={it.bvid}
                      className="song-row"
                      onClick={() => navigate(`/song/${it.bvid}`)}
                    >
                      <td className="rank-no">{page * PAGE_SIZE + i + 1}</td>
                      <td className="song-cell">
                        <Link to={`/song/${it.bvid}`}><span className="t">{it.title}</span></Link>
                        <div className="meta" style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{it.bvid}</div>
                      </td>
                      <td className="num">{it.title_cn || "—"}</td>
                      <td className="num">{it.producers?.map((p) => p.name).join(" / ") || "—"}</td>
                      <td className="num">{it.vocalists?.map((v) => v.name).join(" / ") || "—"}</td>
                      <td className="num-r">{fmtDate(it.pubtime)}</td>
                      <td className="num-r">{fmt(it.view)}</td>
                      <td className="num-r">{fmt(it.favorite)}</td>
                      <td className="num-r">{fmt(it.coin)}</td>
                      <td className="num-r">{fmt(it.like)}</td>
                      <td style={{ textAlign: "center" }}>
                        {tm ? <span className={`tag-mini ${tm.cls}`}>{tm.label}</span> : <span className="text-faint">—</span>}
                      </td>
                      <td className="num-r">{it.weeks_on_board || "—"}</td>
                      <td className="num-r">{it.best_rank ?? "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="chip" disabled={page === 0} onClick={() => setParam("page", String(page - 1), true)}>上一页</button>
            <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-faint)" }}>
              第 {page + 1} / {Math.ceil(total / PAGE_SIZE)} 页
            </span>
            <button className="chip" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setParam("page", String(page + 1), true)}>下一页</button>
          </div>
        )}
      </div>
    </>
  )
}
