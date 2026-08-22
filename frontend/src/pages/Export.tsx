import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, FileJson, FileText, Table2, RefreshCw } from "lucide-react"
import { api } from "../lib/api"
import { Autocomplete, type Suggestion } from "../components/Autocomplete"
import { Empty, Spinner } from "../components/ui"
import { PageHeader } from "../components/PageHeader"
import {
  safeName,
  stamp,
  downloadBytes,
  mimeFor,
  type ExportFormat,
} from "../lib/csv"
import { serializeInWorker, zipInWorker } from "../lib/exportWorker"
import { COLS, BOARD_LABEL, type DatasetKey } from "../lib/exportSchema"
import { AnimatedNumber, TypewriterText } from "../lib/fx"

/* ------------------------------------------------------------------ *
 * 数据集注册表
 * 每个数据集声明：取数函数、列定义、文件名基名。
 * 行类型跨数据集不同，统一按 any 处理（列的 get 内部各自收敛）。
 * 列定义统一在 exportSchema.ts 中维护。
 * ------------------------------------------------------------------ */

interface DatasetMeta {
  key: DatasetKey
  label: string
  desc: string
}

const DATASETS: DatasetMeta[] = [
  { key: "board", label: "官方榜单期", desc: "周榜 / 传说榜 / 年榜任意一期完整排名（含得分与四维指标）" },
  { key: "library", label: "曲库检索结果", desc: "12,381 首收录池，支持关键词 / P主 / 歌姬 / 分档 / 上榜周数筛选" },
  { key: "artists", label: "P主战力榜", desc: "P主聚合统计：收录曲数、总播放、传说/神话曲、上榜期数、战力分" },
  { key: "vocalists", label: "歌姬战力榜", desc: "歌姬（虚拟歌手）维度的同口径聚合统计" },
  { key: "hot", label: "实时热度榜", desc: "自建爬虫最新快照的累计指标榜（含较上次快照增量）" },
  { key: "momentum", label: "涨速榜", desc: "相邻两次快照差分得到的增量榜（播放/收藏/硬币/点赞/分享涨幅）" },
  { key: "monthly", label: "自建月榜", desc: "按月聚合的自建榜单排名" },
  { key: "daily", label: "自建日榜", desc: "按日聚合的自建榜单排名" },
  { key: "history", label: "单曲全历史", desc: "指定曲目在全部榜种中的历次上榜记录（跨榜合并）" },
]

const HOT_SORTS = [
  { v: "score", label: "综合分" },
  { v: "view", label: "播放" },
  { v: "favorite", label: "收藏" },
  { v: "coin", label: "硬币" },
  { v: "like", label: "点赞" },
]
const MOM_METRICS = [
  { v: "view", label: "播放增量" },
  { v: "score", label: "涨速综合分" },
  { v: "favorite", label: "收藏增量" },
  { v: "coin", label: "硬币增量" },
  { v: "like", label: "点赞增量" },
  { v: "share", label: "分享增量" },
]
const LIB_SORTS = [
  { v: "id", label: "收录序号" },
  { v: "view", label: "播放" },
  { v: "favorite", label: "收藏" },
  { v: "coin", label: "硬币" },
  { v: "pubtime", label: "投稿时间" },
  { v: "weeks", label: "上榜周数" },
]

export default function ExportCenter() {
  const [ds, setDs] = useState<DatasetKey>("board")
  const [fmt, setFmt] = useState<ExportFormat>("csv")

  // ---- 各数据集参数 ----
  const [boardType, setBoardType] = useState("weekly")
  // 周榜/传说榜/年榜支持多选期数批量导出（多期自动打包 zip）
  const [boardSel, setBoardSel] = useState<string[]>([])
  const [topN, setTopN] = useState(100)
  const [exporting, setExporting] = useState(false)

  const [libQ, setLibQ] = useState("")
  const [libProducer, setLibProducer] = useState("")
  const [libVocalist, setLibVocalist] = useState("")
  const [libTier, setLibTier] = useState("")
  const [libBoard, setLibBoard] = useState("")
  const [libSort, setLibSort] = useState("view")
  const [libLimit, setLibLimit] = useState(500)

  const [artLimit, setArtLimit] = useState(500)
  const [hotSort, setHotSort] = useState("score")
  const [hotLimit, setHotLimit] = useState(200)
  const [momMetric, setMomMetric] = useState("view")
  const [momLimit, setMomLimit] = useState(200)

  const [monthIssue, setMonthIssue] = useState("")
  const [dailyIssue, setDailyIssue] = useState("")

  const [histBvid, setHistBvid] = useState("")
  const [histTitle, setHistTitle] = useState("")
  const [histQ, setHistQ] = useState("")

  // ---- 下拉选项 ----
  const issues = useQuery({
    queryKey: ["exp-issues", boardType],
    queryFn: () => api.boardIssues(boardType),
    enabled: ds === "board",
  })
  const monthIssues = useQuery({
    queryKey: ["exp-month-issues"],
    queryFn: () => api.monthIssues(),
    enabled: ds === "monthly",
  })
  const dailyIssues = useQuery({
    queryKey: ["exp-daily-issues"],
    queryFn: () => api.dailyIssues(),
    enabled: ds === "daily",
  })

  const boardIssues = issues?.data?.issues ?? []
  const firstIssue = boardSel[0]

  // 榜种切换后默认选最新一期
  useEffect(() => {
    if (boardIssues.length && boardSel.length === 0) setBoardSel([boardIssues[0]!.issue])
  }, [boardIssues, boardSel.length])
  useEffect(() => {
    const list = monthIssues.data?.issues
    if (list?.length && !monthIssue) setMonthIssue(list[0]!.issue)
  }, [monthIssues.data, monthIssue])
  useEffect(() => {
    const list = dailyIssues.data
    if (list?.length && !dailyIssue) setDailyIssue(list[0]!.issue)
  }, [dailyIssues.data, dailyIssue])

  // ---- 取数 ----
  const queryKey = useMemo(
    () => [
      "exp-data",
      ds,
      boardType,
      firstIssue,
      topN,
      libQ,
      libProducer,
      libVocalist,
      libTier,
      libBoard,
      libSort,
      libLimit,
      artLimit,
      hotSort,
      hotLimit,
      momMetric,
      momLimit,
      monthIssue,
      dailyIssue,
      histBvid,
    ],
    [ds, boardType, firstIssue, topN, libQ, libProducer, libVocalist, libTier, libBoard, libSort,
      libLimit, artLimit, hotSort, hotLimit, momMetric, momLimit, monthIssue, dailyIssue, histBvid],
  )

  const ready =
    (ds === "board" && !!firstIssue) ||
    ds === "library" ||
    ds === "artists" ||
    ds === "vocalists" ||
    ds === "hot" ||
    ds === "momentum" ||
    (ds === "monthly" && !!monthIssue) ||
    (ds === "daily" && !!dailyIssue) ||
    (ds === "history" && !!histBvid)

  const dataQ = useQuery({
    queryKey,
    enabled: ready,
    queryFn: async (): Promise<any[]> => {
      switch (ds) {
        case "board":
          return (await api.rankings(boardType, firstIssue ?? "", topN)).items
        case "library":
          return (
            await api.searchSongs({
              q: libQ || undefined,
              producer: libProducer || undefined,
              vocalist: libVocalist || undefined,
              tier: libTier || undefined,
              board: libBoard || undefined,
              sort: libSort,
              order: "desc",
              limit: libLimit,
            })
          ).items
        case "artists":
          return (await api.artists(artLimit)).items
        case "vocalists":
          return (await api.vocalists(artLimit)).items
        case "hot":
          return (await api.hotSongs(hotSort, hotLimit, 0)).items
        case "momentum":
          return (await api.hotMomentum(momMetric, momLimit, 0)).items
        case "monthly":
          return (await api.MonthRanks(monthIssue, topN)).items
        case "daily":
          return (await api.dailyRankings(dailyIssue, topN)).items
        case "history": {
          const r = await api.allHistory(histBvid)
          const rows: unknown[] = []
          for (const [board, list] of Object.entries(r.histories)) {
            for (const it of list) rows.push({ ...it, __board: BOARD_LABEL[board] ?? board })
          }
          return rows
        }
      }
    },
  })

  const rows = dataQ.data ?? []
  const allCols = COLS[ds]

  // ---- 字段勾选：切换数据集时重置为全选 ----
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  const activeSet = picked[ds] ?? new Set(allCols.map((c) => c.key))
  const cols = allCols.filter((c) => activeSet.has(c.key))

  function toggleCol(key: string) {
    const next = new Set(activeSet)
    if (next.has(key)) {
      if (next.size <= 1) return // 至少保留一列
      next.delete(key)
    } else next.add(key)
    setPicked({ ...picked, [ds]: next })
  }
  function setAllCols(on: boolean) {
    setPicked({ ...picked, [ds]: on ? new Set(allCols.map((c) => c.key)) : new Set([allCols[0]!.key]) })
  }

  // ---- 文件名 ----
  const basename = useMemo(() => {
    const t = stamp()
    switch (ds) {
      case "board":
        if (boardSel.length > 1)
          return safeName(`术力口_${BOARD_LABEL[boardType] ?? boardType}_${boardSel.length}期_top${topN}_${t}`)
        return safeName(`术力口_${BOARD_LABEL[boardType] ?? boardType}_${firstIssue}_top${topN}_${t}`)
      case "library":
        return safeName(`术力口_曲库_${libQ || libProducer || libVocalist || "全部"}_${rows.length}条_${t}`)
      case "artists":
        return safeName(`术力口_P主战力榜_top${artLimit}_${t}`)
      case "vocalists":
        return safeName(`术力口_歌姬战力榜_top${artLimit}_${t}`)
      case "hot":
        return safeName(`术力口_实时热度_${hotSort}_top${hotLimit}_${t}`)
      case "momentum":
        return safeName(`术力口_涨速榜_${momMetric}_top${momLimit}_${t}`)
      case "monthly":
        return safeName(`术力口_月榜_${monthIssue}_${t}`)
      case "daily":
        return safeName(`术力口_日榜_${dailyIssue}_${t}`)
      case "history":
        return safeName(`术力口_历史_${histTitle || histBvid}_${t}`)
    }
  }, [ds, boardType, firstIssue, boardSel.length, topN, libQ, libProducer, libVocalist, artLimit, hotSort, hotLimit,
    momMetric, momLimit, monthIssue, dailyIssue, histBvid, histTitle, rows.length])

  const [log, setLog] = useState<{ name: string; rows: number; at: string }[]>([])

  function doExport() {
    // 周榜/传说榜/年榜多选期数：逐期取数，后台线程打包成 zip 下载
    if (ds === "board" && boardSel.length > 1) {
      setExporting(true)
      void (async () => {
        const t = stamp()
        const label = BOARD_LABEL[boardType] ?? boardType
        try {
          const entries: { name: string; data: Uint8Array }[] = []
          let totalRows = 0
          for (const iss of boardSel) {
            const r = await api.rankings(boardType, iss, topN)
            totalRows += r.items.length
            const data = await serializeInWorker("board", r.items, fmt)
            entries.push({
              name: safeName(`术力口_${label}_${iss}_top${topN}.${fmt}`),
              data,
            })
          }
          const zipName = safeName(`术力口_${label}_${boardSel.length}期_top${topN}_${t}.zip`)
          const bytes = await zipInWorker(entries)
          downloadBytes(zipName, bytes, "application/zip")
          setLog((l) =>
            [
              { name: zipName, rows: totalRows, at: new Date().toLocaleTimeString("zh-CN") },
              ...l,
            ].slice(0, 8),
          )
        } catch (e) {
          alert(`批量导出失败：${e instanceof Error ? e.message : String(e)}`)
        } finally {
          setExporting(false)
        }
      })()
      return
    }

    if (!rows.length) return
    setExporting(true)
    void (async () => {
      try {
        const bytes = await serializeInWorker(ds, rows, fmt)
        downloadBytes(`${basename}.${fmt}`, bytes, mimeFor(fmt))
        setLog((l) =>
          [{ name: `${basename}.${fmt}`, rows: rows.length, at: new Date().toLocaleTimeString("zh-CN") }, ...l].slice(0, 8),
        )
      } catch (e) {
        alert(`导出失败：${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setExporting(false)
      }
    })()
  }

  const meta = DATASETS.find((d) => d.key === ds)!
  const preview = rows.slice(0, 8)

  function toggleBoardSel(iss: string) {
    setBoardSel((s) => (s.includes(iss) ? s.filter((x) => x !== iss) : [...s, iss]))
  }
  function setAllBoardSel() {
    setBoardSel(boardIssues.map((i) => i.issue))
  }

  return (
    <>
      <PageHeader
        crumb="工具 · 数据导出"
        title={<TypewriterText text="数据导出中心" />}
        extra="9 类数据集 · CSV / JSON / Markdown · 字段可裁剪"
      />

      <div className="card">
        <div className="card-title">1 · 选择数据集</div>
        <div className="chips">
          {DATASETS.map((d) => (
            <button
              key={d.key}
              className={"chip" + (ds === d.key ? " active" : "")}
              onClick={() => setDs(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{meta.desc}</div>
      </div>

      <div className="card">
        <div className="card-title">2 · 参数</div>
        <div className="lib-filters" style={{ alignItems: "flex-end", gap: 12 }}>
          {ds === "board" && (
            <>
              <label className="field">
                榜种
                <select value={boardType} onChange={(e) => setBoardType(e.target.value)}>
                  <option value="weekly">周榜</option>
                  <option value="legend">传说榜</option>
                  <option value="annual">年榜</option>
                </select>
              </label>
              <div className="field">
                <span className="ms-head">
                  <span>期数（可多选）</span>
                  <span className="ms-acts">
                    <button type="button" className="ms-act" onClick={setAllBoardSel}>全选</button>
                    <button type="button" className="ms-act" onClick={() => setBoardSel([])}>清空</button>
                  </span>
                </span>
                <div className="ms-box">
                  {boardIssues.map((i) => {
                    const on = boardSel.includes(i.issue)
                    return (
                      <label key={i.issue} className={"ms-item" + (on ? " on" : "")}>
                        <input type="checkbox" checked={on} onChange={() => toggleBoardSel(i.issue)} />
                        <span className="ms-name">{i.issue} · {i.date}</span>
                        <span className="ms-count">{i.entries} 条</span>
                      </label>
                    )
                  })}
                </div>
                {boardSel.length > 1 && (
                  <span className="ms-hint">已选 {boardSel.length} 期，导出时自动打包为 zip</span>
                )}
              </div>
              <label className="field">
                取前 N 名
                <input
                  type="text"
                  className="num-in"
                  value={topN}
                  onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            </>
          )}

          {ds === "library" && (
            <>
              <label className="field">
                关键词
                <input type="text" value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="曲名 / BV号" />
              </label>
              <label className="field">
                P主
                <input type="text" value={libProducer} onChange={(e) => setLibProducer(e.target.value)} placeholder="留空不限" />
              </label>
              <label className="field">
                歌姬
                <input type="text" value={libVocalist} onChange={(e) => setLibVocalist(e.target.value)} placeholder="留空不限" />
              </label>
              <label className="field">
                里程碑
                <select value={libTier} onChange={(e) => setLibTier(e.target.value)}>
                  <option value="">不限</option>
                  <option value="hall">殿堂曲（10万+）</option>
                  <option value="legend">传说曲（100万+）</option>
                  <option value="myth">神话曲（1000万+）</option>
                </select>
              </label>
              <label className="field">
                上榜榜种
                <select value={libBoard} onChange={(e) => setLibBoard(e.target.value)}>
                  <option value="">不限</option>
                  <option value="weekly">周榜</option>
                  <option value="legend">传说榜</option>
                  <option value="annual">年榜</option>
                </select>
              </label>
              <label className="field">
                排序
                <select value={libSort} onChange={(e) => setLibSort(e.target.value)}>
                  {LIB_SORTS.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                条数上限
                <input
                  type="text"
                  className="num-in"
                  value={libLimit}
                  onChange={(e) => setLibLimit(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
            </>
          )}

          {(ds === "artists" || ds === "vocalists") && (
            <label className="field">
              条数上限
              <input
                type="text"
                className="num-in"
                value={artLimit}
                onChange={(e) => setArtLimit(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))}
              />
            </label>
          )}

          {ds === "hot" && (
            <>
              <label className="field">
                排序维度
                <select value={hotSort} onChange={(e) => setHotSort(e.target.value)}>
                  {HOT_SORTS.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                条数
                <input
                  type="text"
                  className="num-in"
                  value={hotLimit}
                  onChange={(e) => setHotLimit(Math.min(2000, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
            </>
          )}

          {ds === "momentum" && (
            <>
              <label className="field">
                涨速维度
                <select value={momMetric} onChange={(e) => setMomMetric(e.target.value)}>
                  {MOM_METRICS.map((s) => (
                    <option key={s.v} value={s.v}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                条数
                <input
                  type="text"
                  className="num-in"
                  value={momLimit}
                  onChange={(e) => setMomLimit(Math.min(2000, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
            </>
          )}

          {ds === "monthly" && (
            <>
              <label className="field">
                月份
                <select value={monthIssue} onChange={(e) => setMonthIssue(e.target.value)} style={{ minWidth: 160 }}>
                  {(monthIssues.data?.issues ?? []).map((i) => (
                    <option key={i.issue} value={i.issue}>{i.issue}（{i.entries} 条）</option>
                  ))}
                </select>
              </label>
              <label className="field">
                取前 N 名
                <input type="text" className="num-in" value={topN} onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))} />
              </label>
            </>
          )}

          {ds === "daily" && (
            <>
              <label className="field">
                日期
                <select value={dailyIssue} onChange={(e) => setDailyIssue(e.target.value)} style={{ minWidth: 160 }}>
                  {(dailyIssues.data ?? []).map((i) => (
                    <option key={i.issue} value={i.issue}>{i.issue}（{i.entries} 条）</option>
                  ))}
                </select>
              </label>
              <label className="field">
                取前 N 名
                <input type="text" className="num-in" value={topN} onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))} />
              </label>
            </>
          )}

          {ds === "history" && (
            <div style={{ flex: 1, minWidth: 280 }}>
              <Autocomplete
                value={histQ}
                onChange={setHistQ}
                placeholder="搜索曲名 / BV号…"
                fetchSuggestions={(qq) =>
                  api.songSuggest(qq, 8).then((r) =>
                    r.items.map((it): Suggestion => ({
                      value: it.bvid,
                      label: it.title_cn || it.title,
                      sublabel: it.bvid,
                    })),
                  )
                }
                onSelectItem={(item) => {
                  setHistBvid(item.value)
                  setHistTitle(item.label)
                }}
                onCommit={(v) => {
                  const m = v.match(/BV[0-9A-Za-z]+/i)
                  if (m) {
                    setHistBvid(m[0])
                    setHistTitle(v)
                  }
                }}
              />
              {histBvid && (
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-faint)" }}>
                  已选：<b style={{ color: "var(--text)" }}>{histTitle || histBvid}</b>（{histBvid}）
                </div>
              )}
            </div>
          )}

          <span className="spacer" style={{ flex: 1 }} />
          <button className="chip" onClick={() => dataQ.refetch()} disabled={!ready}>
            <RefreshCw size={12} /> 重新取数
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          3 · 字段裁剪
          <span className="badge">{cols.length} / {allCols.length}</span>
        </div>
        <div className="chips">
          {allCols.map((c) => (
            <button
              key={c.key}
              className={"chip" + (activeSet.has(c.key) ? " active" : "")}
              onClick={() => toggleCol(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="chip" onClick={() => setAllCols(true)}>全选</button>
          <button className="chip" onClick={() => setAllCols(false)}>仅保留首列</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          4 · 预览与导出
          {ready && !dataQ.isLoading && <span className="badge"><AnimatedNumber value={rows.length} /> 行</span>}
        </div>

        <div className="lib-filters" style={{ alignItems: "center" }}>
          <div className="seg">
            <button className={"seg-btn" + (fmt === "csv" ? " active" : "")} onClick={() => setFmt("csv")}>
              <Table2 size={12} /> CSV
            </button>
            <button className={"seg-btn" + (fmt === "json" ? " active" : "")} onClick={() => setFmt("json")}>
              <FileJson size={12} /> JSON
            </button>
            <button className={"seg-btn" + (fmt === "md" ? " active" : "")} onClick={() => setFmt("md")}>
              <FileText size={12} /> Markdown
            </button>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
            {ds === "board" && boardSel.length > 1 ? `${basename}.zip` : `${basename}.${fmt}`}
          </span>
          <button className="chip primary" onClick={doExport} disabled={exporting || !rows.length}>
            {exporting ? <RefreshCw size={12} className="spin" /> : <Download size={12} />}{" "}
            {exporting
              ? "打包中…"
              : ds === "board" && boardSel.length > 1
                ? `导出 ${boardSel.length} 期 zip`
                : rows.length
                  ? <>导出 <AnimatedNumber value={rows.length} /> 行</>
                  : "导出"}
          </button>
        </div>

        {!ready ? (
          <Empty label="请先在上方选择必填参数" />
        ) : dataQ.isLoading ? (
          <Spinner />
        ) : dataQ.isError ? (
          <Empty label="取数失败，请检查后端服务" />
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="rank-table">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} style={{ whiteSpace: "nowrap" }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => {
                      const v = c.get(r)
                      return (
                        <td key={c.key} className={typeof v === "number" ? "num-r" : ""} style={{ whiteSpace: "nowrap" }}>
                          {v == null || v === "" ? (
                            <span className="text-faint">—</span>
                          ) : typeof v === "number" ? (
                            v.toLocaleString()
                          ) : (
                            String(v).length > 28 ? String(v).slice(0, 28) + "…" : String(v)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > preview.length && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-faint)" }}>
                仅预览前 {preview.length} 行，导出文件包含全部 {rows.length.toLocaleString()} 行。
              </div>
            )}
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="card">
          <div className="card-title">本次会话导出记录</div>
          <table className="rank-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th style={{ textAlign: "right" }}>行数</th>
                <th style={{ textAlign: "right" }}>时间</th>
              </tr>
            </thead>
            <tbody>
              {log.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{l.name}</td>
                  <td className="num-r"><AnimatedNumber value={l.rows} /></td>
                  <td className="num-r">{l.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.9 }}>
          · CSV 输出带 UTF-8 BOM，Excel / WPS 双击直接打开不乱码；转义遵循 RFC 4180。
          <br />
          · 以 <code>=</code> <code>+</code> <code>-</code> <code>@</code> 开头的文本会自动加前置单引号，防止 Excel 当公式执行。
          <br />
          · 全部在浏览器本地生成，不经过第三方服务；数据源为本机 8010 后端。
          <br />
          · 曲库单次最多 5,000 行（后端上限）；需要全量请分批调整筛选条件。
        </div>
      </div>
    </>
  )
}
