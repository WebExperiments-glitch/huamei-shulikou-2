import { useCallback, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUp, ArrowDown, ExternalLink } from "lucide-react"
import { api } from "../lib/api"
import { Autocomplete, type Suggestion } from "../components/Autocomplete"
import { Empty, Spinner, fmt } from "../components/ui"
import { Reveal } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

const PAGE_SIZE = 50

type SortKey = "songs" | "total_view" | "legend" | "myth" | "board_count" | "best_rank" | "power"

function SortHead({ k, label, active, order, onSort }: {
  k: SortKey
  label: string
  active: boolean
  order: "desc" | "asc"
  onSort: (k: SortKey) => void
}) {
  return (
    <th className="th-sort num-th" style={{ textAlign: "right" }} onClick={() => onSort(k)}>
      {label}
      {active && (
        <span className="arr">{order === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />}</span>
      )}
    </th>
  )
}

export default function Artists() {
  return (
    <ArtistBoard
      title="P主榜"
      crumb="数据 · P主"
      kind="artist"
      drillKey="producer"
    />
  )
}

export function ArtistBoard({
  title,
  crumb,
  kind,
}: {
  title: string
  crumb: string
  kind: "artist" | "vocalist"
  drillKey: "producer" | "vocalist"
}) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: [kind],
    queryFn: () => (kind === "artist" ? api.artists(5000) : api.vocalists(5000)),
  })

  const items = data?.items ?? []
  const total = data?.total ?? items.length

  const [q, setQ] = useState("")
  const [sort, setSort] = useState<SortKey>("songs")
  const [order, setOrder] = useState<"desc" | "asc">("desc")
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const base = ql ? items.filter((it) => it.name.toLowerCase().includes(ql)) : items
    return [...base].sort((a, b) => {
      // 最高排名越小越好，排序时取负使「第 1 名」恒排最前
      const av = sort === "best_rank" ? -(a[sort] ?? 1e9) : (a[sort] ?? 0)
      const bv = sort === "best_rank" ? -(b[sort] ?? 1e9) : (b[sort] ?? 0)
      return order === "desc" ? bv - av : av - bv
    })
  }, [items, q, sort, order])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const role: "producers" | "vocalists" = kind === "artist" ? "producers" : "vocalists"

  function toggleSort(key: SortKey) {
    if (sort === key) setOrder(order === "desc" ? "asc" : "desc")
    else {
      setSort(key)
      setOrder("desc")
    }
  }

  return (
    <>
      <Reveal>
      <PageHeader
        crumb={crumb}
        title={title}
        extra={`${total.toLocaleString()} 位${title.replace("榜", "")} · 点击行查看其全部歌曲`}
      />
      </Reveal>

      <Reveal delay={0.06}>
      <div className="card">
        <div className="lib-filters">
          <Autocomplete
            value={q}
            onChange={setQ}
            placeholder={`搜索${title.replace("榜", "")}名…`}
            fetchSuggestions={useCallback(
              (q) =>
                api.nameSuggest(role, q, 8).then((r) =>
                  r.items.map(
                    (it): Suggestion => ({
                      value: it.name,
                      label: it.name,
                      sublabel: `${it.count} 首`,
                    }),
                  ),
                ),
              [role],
            )}
            onSelectItem={(item) => setQ(item.value)}
            onCommit={(v) => setQ(v)}
          />
          <span className="spacer" style={{ flex: 1 }} />
          <span className="lib-count">
            {filtered.length.toLocaleString()} 条结果
          </span>
        </div>

        {isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="rank-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>名字</th>
                  <SortHead k="songs" label="收录歌曲" active={sort === "songs"} order={order} onSort={toggleSort} />
                  <SortHead k="total_view" label="总播放*" active={sort === "total_view"} order={order} onSort={toggleSort} />
                  <SortHead k="legend" label="传说曲" active={sort === "legend"} order={order} onSort={toggleSort} />
                  <SortHead k="myth" label="神话曲" active={sort === "myth"} order={order} onSort={toggleSort} />
                  <SortHead k="board_count" label="上榜次数" active={sort === "board_count"} order={order} onSort={toggleSort} />
                  <SortHead k="best_rank" label="最高排名" active={sort === "best_rank"} order={order} onSort={toggleSort} />
                  <SortHead k="power" label="战力" active={sort === "power"} order={order} onSort={toggleSort} />
                  <th>代表曲（最高播放）</th>
                  <th>百科</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((it, i) => (
                  <tr
                    key={it.name}
                    className={(safePage * PAGE_SIZE + i < 3 ? `rank-${safePage * PAGE_SIZE + i + 1} ` : "") + "artist-row"}
                    onClick={() => navigate(`/artist/${kind}/${encodeURIComponent(it.name)}`)}
                  >
                    <td className="rank-no">{safePage * PAGE_SIZE + i + 1}</td>
                    <td className="song-cell">
                      <span className="t">{it.name}</span>
                    </td>
                    <td className="num-r">{it.songs.toLocaleString()} 首</td>
                    <td className="num-r">{fmt(it.total_view ?? 0)}</td>
                    <td className="num-r">
                      {it.legend ? <span className="tag-mini tag-legend">{it.legend}</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="num-r">
                      {it.myth ? <span className="tag-mini tag-myth">{it.myth}</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="num-r">
                      {it.board_count != null ? <span className="num">{it.board_count.toLocaleString()} 期</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="num-r">
                      {it.best_rank != null ? <span className="rank-badge">第 {it.best_rank}</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="num-r">
                      {it.power != null ? <span className="tag-mini tag-power">{it.power.toLocaleString()}</span> : <span className="text-faint">—</span>}
                    </td>
                    <td className="num">
                      {it.best_bvid ? (
                        <Link
                          to={`/song/${it.best_bvid}`}
                          className="best-song"
                          title={it.best_title ?? ""}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {it.best_title ? (it.best_title.length > 16 ? it.best_title.slice(0, 16) + "…" : it.best_title) : it.best_bvid}
                        </Link>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="num">
                      {it.url ? (
                        <a href={it.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={13} /> 百科
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && filtered.length > PAGE_SIZE && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="chip" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>上一页</button>
            <span style={{ alignSelf: "center", fontSize: 12.5, color: "var(--text-faint)" }}>
              第 {safePage + 1} / {pageCount} 页
            </span>
            <button className="chip" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>下一页</button>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--text-faint)" }}>
          * 总播放为「有播放指标的歌曲」合计（收录池 12,381 首中部分含指标，未含指标的歌曲不计入）。
          <br />
          战力分 = 总播放(百万计)×1 + 上榜期数×3 + 传说曲×200 + 神话曲×1000（透明加权，综合衡量持续产出与爆款能力）。
        </div>
      </div>
      </Reveal>
    </>
  )
}
