import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import * as echarts from "echarts/core"
import { LineChart, BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { TrendingUp, AlertTriangle, Sparkles, Info } from "lucide-react"
import { api } from "../lib/api"
import { Empty, Spinner, fmt, fmtScore } from "../components/ui"
import { ChartCard } from "../components/ChartCard"
import { useTheme, getChartPalette } from "../lib/theme"
import { exportRows, stamp, type ExportColumn } from "../lib/csv"
import type { PredictItem } from "../lib/types"

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer])

const BASELINES = [
  { v: "auto", label: "最宽窗口（推荐）" },
  { v: "prev", label: "相邻上一份快照" },
]

/** 概率 → 语义标签与配色 */
function probTag(p: number): { label: string; color: string } {
  if (p >= 0.85) return { label: "稳进", color: "var(--red, #e5484d)" }
  if (p >= 0.6) return { label: "大概率", color: "#f5a524" }
  if (p >= 0.4) return { label: "五五开", color: "#4fc3f7" }
  if (p >= 0.2) return { label: "有希望", color: "var(--text-dim)" }
  return { label: "偏低", color: "var(--text-faint)" }
}

const COLS: ExportColumn<PredictItem>[] = [
  { key: "pred_rank", label: "预测名次", get: (r) => r.pred_rank },
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title_cn || r.title },
  { key: "owner", label: "UP主", get: (r) => r.owner ?? "" },
  { key: "pred_score", label: "预测得分", get: (r) => r.pred_score },
  { key: "prob", label: "上榜概率", get: (r) => r.prob },
  { key: "margin", label: "距入榜线", get: (r) => r.margin },
  { key: "margin_pct", label: "距入榜线%", get: (r) => r.margin_pct },
  { key: "p7v", label: "预测7日播放增量", get: (r) => r.p7v },
  { key: "p7f", label: "预测7日收藏增量", get: (r) => r.p7f },
  { key: "p7c", label: "预测7日投币增量", get: (r) => r.p7c },
  { key: "p7l", label: "预测7日点赞增量", get: (r) => r.p7l },
  { key: "rate_view", label: "当前日均播放", get: (r) => r.rate_view },
  { key: "decay", label: "衰减系数", get: (r) => r.decay },
  { key: "t", label: "时间修正t", get: (r) => r.t },
  { key: "age_days", label: "投稿天数", get: (r) => r.age_days },
  { key: "view", label: "当前播放", get: (r) => r.view },
  { key: "on_last_board", label: "上期在榜", get: (r) => (r.on_last_board ? "是" : "否") },
  { key: "last_rank", label: "上期名次", get: (r) => r.last_rank ?? "" },
]

export default function Predict() {
  const { theme } = useTheme()
  const pal = getChartPalette(theme)

  const [baseline, setBaseline] = useState("auto")
  const [decay, setDecay] = useState(1.0)
  const [limit, setLimit] = useState(60)
  const [onlyNew, setOnlyNew] = useState(false)

  const q = useQuery({
    queryKey: ["predict", baseline, decay, limit],
    queryFn: () => api.predictNextWeek(baseline, decay, limit),
  })

  const data = q.data
  const s = data?.summary
  const cut = s?.cut_median ?? 0
  const boardSize = s?.board_size ?? 20

  const items = useMemo(() => {
    const list = data?.items ?? []
    return onlyNew ? list.filter((i) => !i.on_last_board) : list
  }, [data, onlyNew])

  // 入榜线趋势 + 本次预测的第 20 名标线
  const cutOpt = useMemo(() => {
    const hist = [...(data?.cutline.history ?? [])].reverse()
    if (!hist.length) return null
    const predAt20 = data?.items?.[boardSize - 1]?.pred_score ?? null
    return {
      grid: { left: 62, right: 24, top: 24, bottom: 42 },
      tooltip: {
        trigger: "axis",
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        textStyle: { color: pal.text },
        valueFormatter: (v: number) => (v / 1e4).toFixed(1) + "万",
      },
      xAxis: {
        type: "category",
        data: hist.map((h) => h.date.slice(5)),
        axisLabel: { color: pal.axis, fontSize: 10, rotate: 40 },
        axisLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "value",
        name: "末位得分",
        nameTextStyle: { color: pal.axis, fontSize: 11 },
        axisLabel: { color: pal.axis, formatter: (v: number) => (v / 1e4).toFixed(0) + "万" },
        splitLine: { lineStyle: { color: pal.split } },
      },
      series: [
        {
          name: "历史入榜线",
          type: "line",
          data: hist.map((h) => h.cut),
          smooth: true,
          symbolSize: 5,
          lineStyle: { color: "#f5a524", width: 2 },
          itemStyle: { color: "#f5a524" },
          areaStyle: { color: "rgba(245,165,36,0.10)" },
          markLine: predAt20
            ? {
                silent: true,
                symbol: "none",
                label: {
                  formatter: `本次预测第 ${boardSize} 名 ${(predAt20 / 1e4).toFixed(1)}万`,
                  color: "#4fc3f7",
                  fontSize: 10,
                  position: "insideEndTop",
                },
                lineStyle: { color: "#4fc3f7", type: "dashed", width: 1.5 },
                data: [{ yAxis: predAt20 }],
              }
            : undefined,
        },
      ],
    }
  }, [data, pal, boardSize])

  // Top 15 预测得分对比入榜线
  const scoreOpt = useMemo(() => {
    const top = (data?.items ?? []).slice(0, 15)
    if (!top.length) return null
    const names = top.map((i) => {
      const n = i.title_cn || i.title
      return n.length > 12 ? n.slice(0, 12) + "…" : n
    }).reverse()
    return {
      grid: { left: 110, right: 40, top: 12, bottom: 28 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: pal.tooltipBg,
        borderColor: pal.tooltipBorder,
        textStyle: { color: pal.text },
        valueFormatter: (v: number) => (v / 1e4).toFixed(1) + "万",
      },
      xAxis: {
        type: "value",
        axisLabel: { color: pal.axis, formatter: (v: number) => (v / 1e4).toFixed(0) + "万" },
        splitLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLabel: { color: pal.axis, fontSize: 10.5 },
        axisLine: { lineStyle: { color: pal.split } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: top.map((i) => ({
            value: i.pred_score,
            itemStyle: { color: i.pred_score >= cut ? "#e5484d" : "#5b7083", borderRadius: [0, 4, 4, 0] },
          })).reverse(),
          barWidth: "64%",
          markLine: cut
            ? {
                silent: true,
                symbol: "none",
                label: { formatter: "入榜线", color: "#f5a524", fontSize: 10 },
                lineStyle: { color: "#f5a524", type: "dashed", width: 1.5 },
                data: [{ xAxis: cut }],
              }
            : undefined,
        },
      ],
    }
  }, [data, pal, cut])

  function doExport() {
    if (!items.length) return
    exportRows(`术力口_下期冲榜预测_${stamp()}`, items, COLS, "csv")
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb">分析 · 预测</div>
          <h1>下期冲榜预测</h1>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          快照增量外推 7 日 · 现行公式计分 · 对比历史入榜线
        </div>
      </div>

      <div className="card">
        <div className="lib-filters" style={{ alignItems: "flex-end" }}>
          <label className="field">
            基线快照
            <select value={baseline} onChange={(e) => setBaseline(e.target.value)} style={{ minWidth: 170 }}>
              {BASELINES.map((b) => (
                <option key={b.v} value={b.v}>{b.label}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 210 }}>
            衰减系数 k = {decay.toFixed(2)}
            <input
              type="range"
              min={0.3}
              max={1.5}
              step={0.05}
              value={decay}
              onChange={(e) => setDecay(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
          <label className="field">
            展示条数
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[20, 40, 60, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            className={"chip" + (onlyNew ? " active" : "")}
            onClick={() => setOnlyNew(!onlyNew)}
            style={{ marginBottom: 2 }}
          >
            <Sparkles size={12} /> 只看新面孔
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="chip" onClick={doExport} disabled={!items.length} style={{ marginBottom: 2 }}>
            导出 CSV
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="card"><Spinner /></div>
      ) : q.isError ? (
        <div className="card"><Empty label="预测服务不可用，请检查后端" /></div>
      ) : !data?.ok ? (
        <div className="card">
          <Empty label={data?.reason ?? "数据不足"} />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-title">
              预测概览
              {s?.low_confidence && (
                <span className="badge" style={{ color: "#f5a524" }}>
                  <AlertTriangle size={11} /> 窗口不足 1 天，置信度低
                </span>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
                gap: 12,
              }}
            >
              <Stat label="预测入榜线" value={fmtScore(cut)} sub={`近 ${data.cutline.lookback} 期中位数`} />
              <Stat
                label="入榜线区间"
                value={`${fmtScore(s?.cut_min ?? 0)} ~ ${fmtScore(s?.cut_max ?? 0)}`}
                sub="历史波动范围"
              />
              <Stat label="预计过线" value={`${s?.expected_in ?? 0} 首`} sub={`榜单容量 ${boardSize} 席`} />
              <Stat label="预测新面孔" value={`${s?.newcomers_in_top ?? 0} 首`} sub={`Top ${boardSize} 中上期未在榜`} />
              <Stat label="追踪曲目" value={`${s?.tracked ?? 0} 首`} sub="自建爬虫覆盖范围" />
              <Stat
                label="观测窗口"
                value={`${s?.window_days.toFixed(2) ?? "—"} 天`}
                sub={`快照 #${s?.baseline_snapshot.id} → #${s?.latest_snapshot.id}`}
              />
            </div>
          </div>

          <div className="grid-2">
            {cutOpt && (
              <ChartCard
                title="历史入榜线趋势"
                option={cutOpt}
                filename="入榜线趋势"
                height={280}
                badge={`近 ${data.cutline.history.length} 期`}
              />
            )}
            {scoreOpt && (
              <ChartCard
                title="预测得分 Top 15"
                option={scoreOpt}
                filename="预测得分Top15"
                height={280}
                badge="红色为过线"
              />
            )}
          </div>

          <div className="card">
            <div className="card-title">
              预测榜单
              <span className="badge">{items.length} 条</span>
              <span className="badge" style={{ color: "var(--text-faint)" }}>
                <TrendingUp size={11} /> 前 {boardSize} 名为预测入榜区
              </span>
            </div>
            {items.length === 0 ? (
              <Empty />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>预测</th>
                      <th>曲目</th>
                      <th className="num-th" style={{ textAlign: "right" }}>预测得分</th>
                      <th style={{ width: 150 }}>上榜概率</th>
                      <th className="num-th" style={{ textAlign: "right" }}>距入榜线</th>
                      <th className="num-th" style={{ textAlign: "right" }}>预测7日播放</th>
                      <th className="num-th" style={{ textAlign: "right" }}>当前日均</th>
                      <th className="num-th" style={{ textAlign: "right" }}>t / 衰减</th>
                      <th style={{ width: 90 }}>上期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const tag = probTag(it.prob)
                      const inBoard = it.pred_rank <= boardSize
                      return (
                        <tr key={it.bvid} className={it.pred_rank <= 3 ? `rank-${it.pred_rank}` : ""}>
                          <td className="rank-no" style={{ opacity: inBoard ? 1 : 0.45 }}>
                            {it.pred_rank}
                          </td>
                          <td className="song-cell">
                            <Link to={`/song/${it.bvid}`} className="t">
                              {it.title_cn || it.title}
                            </Link>
                            <div className="meta" style={{ fontSize: 11 }}>
                              {it.owner} · 投稿 {it.age_days < 999 ? `${it.age_days} 天前` : "未知"}
                              {!it.on_last_board && it.pred_rank <= boardSize && (
                                <span className="tag-mini" style={{ marginLeft: 6, background: "rgba(79,195,247,.15)", color: "#4fc3f7" }}>
                                  新面孔
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num-r" style={{ fontWeight: inBoard ? 600 : 400 }}>
                            {fmtScore(it.pred_score)}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{
                                flex: 1, height: 6, borderRadius: 3,
                                background: "var(--bg-elev)", overflow: "hidden", minWidth: 52,
                              }}>
                                <div style={{
                                  width: `${Math.round(it.prob * 100)}%`,
                                  height: "100%",
                                  background: tag.color,
                                  borderRadius: 3,
                                }} />
                              </div>
                              <span style={{ fontSize: 11.5, color: tag.color, minWidth: 62, fontFamily: "var(--mono)" }}>
                                {(it.prob * 100).toFixed(0)}% {tag.label}
                              </span>
                            </div>
                          </td>
                          <td className="num-r" style={{ color: (it.margin ?? 0) >= 0 ? "var(--red, #e5484d)" : "var(--text-faint)" }}>
                            {it.margin == null ? "—" : `${it.margin >= 0 ? "+" : ""}${fmtScore(it.margin)}`}
                          </td>
                          <td className="num-r">{fmt(it.p7v)}</td>
                          <td className="num-r">{fmt(it.rate_view)}/天</td>
                          <td className="num-r" style={{ fontSize: 11.5 }}>
                            {it.t.toFixed(2)} / {it.decay.toFixed(2)}
                          </td>
                          <td>
                            {it.on_last_board ? (
                              <span className="rank-badge">第 {it.last_rank}</span>
                            ) : (
                              <span className="text-faint">未在榜</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card">
        <div className="card-title"><Info size={13} /> 模型说明与局限</div>
        <div style={{ fontSize: 11.8, color: "var(--text-faint)", lineHeight: 2 }}>
          <b style={{ color: "var(--text-dim)" }}>1 · 速率估计</b>：取基线与最新两份快照，求四维增量除以窗口天数得当前日均速率。
          <br />
          <b style={{ color: "var(--text-dim)" }}>2 · 热度衰减</b>：decay = 0.55 + 0.45 × min(投稿天数, 30) / 30，再乘可调系数 k。
          新曲当前速率处于爆发峰值，直接线性外推会系统性高估，故按年龄打折；30 天以上老曲速率已稳定，不额外打折。
          <br />
          <b style={{ color: "var(--text-dim)" }}>3 · 7 日外推</b>：预测增量 = 日均速率 × 7 × decay。
          <br />
          <b style={{ color: "var(--text-dim)" }}>4 · 计分</b>：套用现行官方公式（issue ≥ 54）
          <code> 得分 = Δ播放×t + 15Δ收藏 + 3Δ点赞 + 30Δ投币</code>，
          t = T[D_floor] 7 档阶梯（D0 周初 → D6 周末，单调上升）T = [1.0527, 1.1381, 1.3900, 1.6061, 1.6900, 2.1574, 2.4700]，
          D_floor = clamp(round((投稿时间 − 周期起点)/86400 − 0.5), 0, 6)，周期起点取最新快照时刻。
          <br />
          <b style={{ color: "var(--text-dim)" }}>5 · 入榜线</b>：近 {data?.cutline.lookback ?? 8} 期官方周榜第 {boardSize} 名得分的中位数。
          <br />
          <b style={{ color: "var(--text-dim)" }}>6 · 概率</b>：p = r^2.5 / (1 + r^2.5)，r = 预测得分 / 入榜线。r=1 → 50%，无拟合参数。
          <br />
          <b style={{ color: "#f5a524" }}>局限</b>：仅覆盖自建爬虫已追踪的 {s?.tracked ?? 0} 首曲目，不等于全站候选池；
          窗口越短速率噪声越大；不建模转载、二创爆火、官方推荐位等突发事件。结果为方法论演示，非投注建议。
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-val" style={{ fontSize: 19 }}>{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--text-faint)", opacity: 0.75, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
