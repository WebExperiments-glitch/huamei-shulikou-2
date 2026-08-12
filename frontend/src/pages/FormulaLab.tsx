import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Autocomplete, type Suggestion } from "../components/Autocomplete"
import { Empty, Spinner, fmt } from "../components/ui"

const NEW_W = { view: 1, favorite: 15, like: 3, coin: 30 }
const OLD_W = { view: 2, favorite: 30, like: 3, coin: 10 }

// 官方新公式 t 还原（2026-08-11 极限还原，与后端 services/rank.py 逐字一致、可核验）
const T_TABLE = [1.0527, 1.1381, 1.3900, 1.6061, 1.6900, 2.1574, 2.4700]
const ANCHOR_OFFSET_DAYS = 0.5
const T_CLAMP_MIN = 1.0
const T_CLAMP_MAX = 2.615

// 模拟 Python round（银行家舍入：.5 取偶），使前端与 rank.py 逐字一致
function pyRound(x: number): number {
  const f = Math.floor(x)
  const frac = x - f
  if (frac < 0.5) return f
  if (frac > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

function tNew(pub: number, prev: number): number {
  if (!pub) return T_CLAMP_MIN
  const dt = pub - prev
  if (dt < 0) return T_CLAMP_MIN
  if (dt > 365 * 86400) return T_CLAMP_MIN // pubtime 异常（晚于本期起点 1 年以上）→ 按老曲
  const dDays = dt / 86400.0
  if (dDays > 7.0) return T_CLAMP_MIN
  const k = Math.max(0, Math.min(6, pyRound(dDays - ANCHOR_OFFSET_DAYS)))
  const t = T_TABLE[k] ?? T_CLAMP_MIN
  return Math.min(Math.max(t, T_CLAMP_MIN), T_CLAMP_MAX)
}
function tOld(pub: number, end: number): number {
  if (!pub) return 2.47
  const d = Math.floor((end - pub) / 86400)
  const ladder: [number, number][] = [
    [1, 2.47], [2, 2.06], [3, 1.69], [4, 1.39], [5, 1.18], [6, 1.08], [7, 1.03], [8, 1.01],
  ]
  for (const [thr, val] of ladder) if (d <= thr) return val
  return 1
}

export default function FormulaLab() {
  const [q, setQ] = useState("")
  const [bvid, setBvid] = useState<string | null>(null)
  const [title, setTitle] = useState("")

  const [dv, setDv] = useState(500000)
  const [df, setDf] = useState(20000)
  const [dc, setDc] = useState(8000)
  const [dl, setDl] = useState(15000)
  const [pub, setPub] = useState("2025-06-20T12:00")
  const [prevEnd, setPrevEnd] = useState("2025-06-17T00:00")
  const [end, setEnd] = useState("2025-06-24T00:00")

  const cmpQ = useQuery({
    queryKey: ["formula-compare", bvid],
    queryFn: () => (bvid ? api.formulaCompare(bvid) : Promise.resolve(null)),
    enabled: !!bvid,
  })

  const manual = useMemo(() => {
    const p = pub ? Math.floor(new Date(pub).getTime() / 1000) : 0
    const pe = prevEnd ? Math.floor(new Date(prevEnd).getTime() / 1000) : 0
    const ce = end ? Math.floor(new Date(end).getTime() / 1000) : 0
    const tn = tNew(p, pe), to = tOld(p, ce)
    const oldScore = dv * OLD_W.view * to + df * OLD_W.favorite + dl * OLD_W.like + dc * OLD_W.coin
    const newScore = dv * NEW_W.view * tn + df * NEW_W.favorite + dl * NEW_W.like + dc * NEW_W.coin
    return { tn, to, oldScore, newScore, diff: newScore - oldScore }
  }, [dv, df, dc, dl, pub, prevEnd, end])

  return (
    <>
      <div className="topbar">
        <div>
          <div className="crumb"><Link to="/">总览</Link> · 公式实验室</div>
          <h1>公式可视化实验室</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            选任意歌曲，查看其在新/旧两代公式下的因子构成对比；或用下方试算器填入增量，直接对比两套公式的打分差异。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">选歌曲 · 历史公式对比 <span className="badge">周榜历史</span></div>
        <div className="lib-filters">
          <Autocomplete
            value={q}
            onChange={setQ}
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
            onSelectItem={(item) => { setBvid(item.value); setTitle(item.label) }}
            onCommit={(v) => {
              const m = v.match(/BV[0-9A-Za-z]+/i)
              if (m) { setBvid(m[0]); setTitle(v) }
            }}
          />
          {bvid && (
            <button className="chip" onClick={() => { setBvid(null); setQ(""); setTitle("") }}>清除</button>
          )}
        </div>
        {bvid && <div className="muted" style={{ fontSize: 12.5, margin: "6px 0" }}>已选：{title}（{bvid}）</div>}
        {cmpQ.isLoading && <Spinner />}
        {cmpQ.data && cmpQ.data.entries.length === 0 && <Empty />}
        {cmpQ.data && cmpQ.data.entries.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="rank-table">
              <thead>
                <tr>
                  <th>期</th><th>排名</th><th>官方版</th><th>t新</th><th>t旧</th>
                  <th>旧公式总分</th><th>新公式总分</th>
                  <th>旧·播放</th><th>旧·硬币</th><th>新·播放</th><th>新·硬币</th>
                </tr>
              </thead>
              <tbody>
                {cmpQ.data.entries.map((e) => (
                  <tr key={e.issue}>
                    <td>{e.issue}</td>
                    <td>{e.rank}</td>
                    <td>
                      <span className={"tag-mini " + (e.official_version === "old" ? "tag-old" : "tag-new")}>
                        {e.official_version === "old" ? "旧" : "新"}
                      </span>
                    </td>
                    <td className="num">{e.t_new}</td>
                    <td className="num">{e.t_old}</td>
                    <td className="num">{fmt(e.old.total)}</td>
                    <td className="num">{fmt(e.new.total)}</td>
                    <td className="num">{fmt(e.old.comp_view)}</td>
                    <td className="num">{fmt(e.old.comp_coin)}</td>
                    <td className="num">{fmt(e.new.comp_view)}</td>
                    <td className="num">{fmt(e.new.comp_coin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          注：官方周榜表未收录播放量，两套总分均按「官方分 − 其余三因子」反推还原，故相等；差异体现在各因子的权重分配（旧公式重播放 2×、新公式重硬币 30×）。要看真实打分差异，见下方试算器。
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">增量试算 · 新旧公式打分对比</div>
        <div className="calc-grid">
          <label className="field"><span>Δ 播放</span><input type="number" value={dv} onChange={(e) => setDv(+e.target.value)} /></label>
          <label className="field"><span>Δ 收藏</span><input type="number" value={df} onChange={(e) => setDf(+e.target.value)} /></label>
          <label className="field"><span>Δ 点赞</span><input type="number" value={dl} onChange={(e) => setDl(+e.target.value)} /></label>
          <label className="field"><span>Δ 硬币</span><input type="number" value={dc} onChange={(e) => setDc(+e.target.value)} /></label>
          <label className="field"><span>投稿时间</span><input type="datetime-local" value={pub} onChange={(e) => setPub(e.target.value)} /></label>
          <label className="field"><span>前一期截止（新公式 t 锚点）</span><input type="datetime-local" value={prevEnd} onChange={(e) => setPrevEnd(e.target.value)} /></label>
          <label className="field"><span>本周期结算（旧公式 t 锚点）</span><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <div className="calc-result">
          <div className="cr-row"><span>旧公式：2×播放×t + 30×收藏 + 3×点赞 + 10×硬币</span><b>{fmt(manual.oldScore)}</b></div>
          <div className="cr-row"><span>新公式：播放×t + 15×收藏 + 3×点赞 + 30×硬币</span><b>{fmt(manual.newScore)}</b></div>
          <div className="cr-row strong"><span>时间修正 t（新 / 旧）</span><b>{manual.tn.toFixed(4)} / {manual.to.toFixed(4)}</b></div>
          <div className="cr-total"><span>差异（新 − 旧）</span><b className={manual.diff >= 0 ? "pos" : "neg"}>{manual.diff >= 0 ? "+" : ""}{fmt(manual.diff)}</b></div>
        </div>
      </div>
    </>
  )
}
