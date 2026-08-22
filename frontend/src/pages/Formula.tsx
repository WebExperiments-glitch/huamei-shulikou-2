import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { fmt } from "../components/ui"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

// 官方新公式 t 还原（2026-08-11 极限还原，与后端 services/rank.py 逐字一致、可核验）：
//   老曲（投稿早于周期起点）→ t = 1
//   新曲（本周期内投稿）→ t = T[D_floor]，D_floor = clamp(round((pubtime−起点)/86400 − 0.5), 0, 6)
//   T 为按「本周内投稿整天数」的 7 档阶梯，由官方 112 期 JSON stats(周增量) 反推 implied_t 鲁棒估计得到。
//   锚点偏移 ANCHOR_OFFSET_DAYS=0.5（真实锚点相对周期起点偏移约半天，奇偶半桶双峰揭示）。
//   约 1/3 新曲的 Δ 本身存在数据层噪声（与 t 无关），干净子集 score 相对误差中位≈0.38%，全体中位≈1.3%。
// 旧公式：t = 按「发行天数 D = floor((结束-投稿)/86400)」的阶梯系数
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

function timeCorrectionNew(pubtime: number, prevPeriodEnd: number): number {
  if (!pubtime) return T_CLAMP_MIN
  const dt = pubtime - prevPeriodEnd
  if (dt < 0) return T_CLAMP_MIN
  const dDays = dt / 86400.0
  if (dDays > 7.0) return T_CLAMP_MIN
  const k = Math.max(0, Math.min(6, pyRound(dDays - ANCHOR_OFFSET_DAYS)))
  const t = T_TABLE[k] ?? T_CLAMP_MIN
  return Math.min(Math.max(t, T_CLAMP_MIN), T_CLAMP_MAX)
}

function timeCorrectionOld(pubtime: number, periodEnd: number): number {
  if (!pubtime) return 2.47
  const d = Math.floor((periodEnd - pubtime) / 86400)
  const ladder: [number, number][] = [
    [1, 2.47], [2, 2.06], [3, 1.69], [4, 1.39], [5, 1.18],
    [6, 1.08], [7, 1.03], [8, 1.01],
  ]
  for (const [thr, val] of ladder) if (d <= thr) return val
  return 1.0
}

const NEW_WEIGHTS = { view: 1, favorite: 15, like: 3, coin: 30 }
const OLD_WEIGHTS = { view: 2, favorite: 30, like: 3, coin: 10 }

type Version = "new" | "old"

export default function Formula() {
  const [version, setVersion] = useState<Version>("new")
  const [dv, setDv] = useState(500000)
  const [df, setDf] = useState(20000)
  const [dc, setDc] = useState(8000)
  const [dl, setDl] = useState(15000)
  const [pubtime, setPubtime] = useState("2025-06-20T12:00")
  const [prevEnd, setPrevEnd] = useState("2025-06-17T00:00")
  const [periodEnd, setPeriodEnd] = useState("2025-06-24T00:00")

  const W = version === "new" ? NEW_WEIGHTS : OLD_WEIGHTS

  const result = useMemo(() => {
    const pub = pubtime ? Math.floor(new Date(pubtime).getTime() / 1000) : 0
    const pe = prevEnd ? Math.floor(new Date(prevEnd).getTime() / 1000) : 0
    const ce = periodEnd ? Math.floor(new Date(periodEnd).getTime() / 1000) : 0
    const tNew = timeCorrectionNew(pub, pe)
    const tOld = timeCorrectionOld(pub, ce)
    const t = version === "new" ? tNew : tOld
    const view = dv * W.view * t
    const fav = df * W.favorite
    const like = dl * W.like
    const coin = dc * W.coin
    const total = view + fav + like + coin
    return { tNew, tOld, t, view, fav, like, coin, total }
  }, [version, dv, df, dc, dl, pubtime, prevEnd, periodEnd, W])

  const comps = [
    { key: "view", label: "播放 Δ×t", value: result.view, color: "#4fc3f7" },
    { key: "favorite", label: "收藏 Δ", value: result.fav, color: "#ffd166" },
    { key: "like", label: "点赞 Δ", value: result.like, color: "#a78bfa" },
    { key: "coin", label: "硬币 Δ", value: result.coin, color: "#ff6fd8" },
  ]
  const maxComp = Math.max(...comps.map((c) => Math.abs(c.value)), 1)

  return (
    <>
      <Reveal>
      <PageHeader
        crumb={<><Link to="/">总览</Link> · 公式与试算</>}
        title="得分公式 · 透明与可核验"
        desc={
          <>
            本项目的核心理念是 <b>全量自采 + 公式透明 + API 可核验</b>。下方完整公开 B 站术力口周榜的计分公式，
            并提供一个交互试算器——你可以填入任意一期任意歌曲的增量，按文档公式精确复算得分，验证每一个数字。
          </>
        }
      />
      </Reveal>

      {/* 公式定义 */}
      <StaggerGroup className="grid-2">
        <StaggerItem key="current">
        <div className="card">
          <div className="card-title">现行公式（第 54 期起，≥2025-06-24）</div>
          <div className="formula-box">
            <div className="formula-line">得分 = <span className="hl-view">Δ播放 × t</span> + <span className="hl-fav">15 × Δ收藏</span> + <span className="hl-like">3 × Δ点赞</span> + <span className="hl-coin">30 × Δ硬币</span></div>
            <div className="formula-sub">时间修正 t = T[D_floor] 7 档阶梯（D0 周初 → D6 周末，单调上升）：T = [1.0527, 1.1381, 1.3900, 1.6061, 1.6900, 2.1574, 2.4700]</div>
            <div className="formula-sub">D_floor = clamp(round((投稿时间 − 周期起点)/86400 − 0.5), 0, 6)；周期起点 = 前一期统计截止；pubtime 缺失/异常按 t=1.0</div>
            <div className="formula-sub">系数与榜单排名 100% 可复现；逐曲 score 为近似还原（官方 t 含不可反推的首登榜加成）</div>
          </div>
          <div className="weight-table">
            <div className="wr"><span>Δ播放</span><b>× 1</b><i>再乘 t</i></div>
            <div className="wr"><span>Δ收藏</span><b>× 15</b></div>
            <div className="wr"><span>Δ点赞</span><b>× 3</b></div>
            <div className="wr"><span>Δ硬币</span><b>× 30</b></div>
          </div>
        </div>
        </StaggerItem>

        <StaggerItem key="old">
        <div className="card">
          <div className="card-title">旧公式（第 54 期前，&lt;54）</div>
          <div className="formula-box">
            <div className="formula-line">得分 = <span className="hl-view">2 × Δ播放 × t</span> + <span className="hl-fav">30 × Δ收藏</span> + <span className="hl-like">3 × Δ点赞</span> + <span className="hl-coin">10 × Δ硬币</span></div>
            <div className="formula-sub">时间修正 t = 按「发行天数 D」的阶梯系数：</div>
            <div className="formula-sub">D≤1:2.47 · D=2:2.06 · D=3:1.69 · D=4:1.39 · D=5:1.18 · D=6:1.08 · D=7:1.03 · D=8:1.01 · D&gt;8:1.0</div>
            <div className="formula-sub">D = floor((本周期结算时间 − 投稿时间) / 86400)，以时间戳秒差向下取整 24h 天。</div>
          </div>
          <div className="callout">
            <b>为何以第 54 期为界？</b> 这是 B 站术力口周榜官方在 2025-06-24 切换计分规则的分界点，
            本项目已用官方 112 期数据对拍验证过两代公式的边界与权重。
          </div>
        </div>
        </StaggerItem>
      </StaggerGroup>

      {/* 试算器 */}
      <Reveal delay={0.06}>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">交互试算器 <span className="badge">填入增量即可复算</span></div>
        <div className="calc-grid">
          <label className="field">
            <span>公式代</span>
            <select value={version} onChange={(e) => setVersion(e.target.value as Version)}>
              <option value="new">新公式（≥54）</option>
              <option value="old">旧公式（&lt;54）</option>
            </select>
          </label>
          <label className="field">
            <span>Δ 播放（本周新增）</span>
            <input type="number" value={dv} onChange={(e) => setDv(+e.target.value)} />
          </label>
          <label className="field">
            <span>Δ 收藏</span>
            <input type="number" value={df} onChange={(e) => setDf(+e.target.value)} />
          </label>
          <label className="field">
            <span>Δ 点赞</span>
            <input type="number" value={dl} onChange={(e) => setDl(+e.target.value)} />
          </label>
          <label className="field">
            <span>Δ 硬币</span>
            <input type="number" value={dc} onChange={(e) => setDc(+e.target.value)} />
          </label>
          <label className="field">
            <span>投稿时间</span>
            <input type="datetime-local" value={pubtime} onChange={(e) => setPubtime(e.target.value)} />
          </label>
          <label className="field">
            <span>前一期统计截止（新公式 t 锚点）</span>
            <input type="datetime-local" value={prevEnd} onChange={(e) => setPrevEnd(e.target.value)} />
          </label>
          <label className="field">
            <span>本周期结算时间（旧公式 t 锚点）</span>
            <input type="datetime-local" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
        </div>

        <div className="calc-result">
          <div className="cr-row">
            <span>时间修正 t（新公式）</span><b>{result.tNew.toFixed(4)}</b>
          </div>
          <div className="cr-row">
            <span>时间修正 t（旧公式）</span><b>{result.tOld.toFixed(4)}</b>
          </div>
          <div className="cr-row strong">
            <span>采用 t（{version === "new" ? "新" : "旧"}）</span><b>{result.t.toFixed(4)}</b>
          </div>
          <div className="cr-row">
            <span>播放贡献 Δ播放 × {W.view} × t</span><b>{fmt(result.view)}</b>
          </div>
          <div className="cr-row">
            <span>收藏贡献 Δ收藏 × {W.favorite}</span><b>{fmt(result.fav)}</b>
          </div>
          <div className="cr-row">
            <span>点赞贡献 Δ点赞 × {W.like}</span><b>{fmt(result.like)}</b>
          </div>
          <div className="cr-row">
            <span>硬币贡献 Δ硬币 × {W.coin}</span><b>{fmt(result.coin)}</b>
          </div>
          <div className="cr-total">
            <span>复算得分</span><b>{fmt(result.total)}</b>
          </div>
        </div>

        <div className="comp-chart">
          {comps.map((c) => (
            <div className="comp-row" key={c.key}>
              <span className="comp-label">{c.label}</span>
              <div className="comp-track">
                <div
                  className="comp-fill"
                  style={{ width: `${(Math.abs(c.value) / maxComp) * 100}%`, background: c.color }}
                />
              </div>
              <span className="comp-val">{fmt(c.value)}</span>
            </div>
          ))}
          <div className="comp-note">各因子对复算得分的绝对贡献（非百分比），直观看出分数主要来源。</div>
        </div>
      </div>
      </Reveal>

      {/* 数据口径说明 */}
      <Reveal delay={0.12}>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">数据口径与「可核验」说明</div>
        <ul className="doc-list">
          <li><b>Δ 是什么？</b> 官方周榜每期存的是<b>当期累计</b>指标（播放/收藏/点赞/硬币），真正的 Δ 是相邻两期之间的<b>增量</b>（由连续快照差分得到）。</li>
          <li><b>官方表 ≠ 增量快照。</b> 跨期直接相减会出现「数据回退」（负增量），因此无法仅用官方历史表忠实复算每首歌的官方得分——这是公开数据源的固有噪声。</li>
          <li><b>本项目如何解决？</b> 后端自建热度榜（<code>/hot</code>）使用<b>连续快照差分</b>计算 Δ，严格套用上述公式，自算分与原榜高度一致。</li>
          <li><b>本页试算器</b> 按文档公式逐因子精确复算，你可用任意一首歌某一周的增量自行验证，做到「公式透明、过程可核验」。</li>
          <li>单曲详情页的「得分与公式」卡片给出每期的<b>官方得分、原始指标与时间修正 t</b>，并以「因子构成参考」展示分数来源（明确标注非复算）。</li>
        </ul>
      </div>
      </Reveal>
    </>
  )
}
