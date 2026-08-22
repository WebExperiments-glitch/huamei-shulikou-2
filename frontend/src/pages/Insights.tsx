import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle, ArrowDown, ArrowUp, Crown, Flame, Gauge, History,
  Mic2, TrendingUp, Users,
} from "lucide-react"
import { api } from "../lib/api"
import { Empty, Spinner } from "../components/ui"
import { fmtInt, fmtWan } from "../lib/format"
import type { InsightsOverview, MilestoneItem } from "../lib/types"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

const TIER_META: Record<string, { label: string; cls: string; bar: string; icon: typeof Crown }> = {
  myth: { label: "神话曲", cls: "tag-myth", bar: "#b56bff", icon: Crown },
  legend: { label: "传说曲", cls: "tag-legend", bar: "#ffd166", icon: Flame },
  hall: { label: "殿堂曲", cls: "tag-hall", bar: "#4fc3f7", icon: Mic2 },
}

function Progress({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="ip-bar">
      <div className="ip-bar-fill" style={{ width: `${Math.round(pct * 100)}%`, background: color }} />
    </div>
  )
}

function MilestoneCard({ tier, items }: { tier: string; items: MilestoneItem[] }) {
  const meta = TIER_META[tier]
  const Icon = meta?.icon ?? TrendingUp
  return (
    <div className="card">
      <div className="card-title">
        <Icon size={15} />
        <span>{meta?.label ?? tier} · 冲刺预警</span>
        <span className="badge">{meta?.bar ? "即将达成" : ""}</span>
      </div>
      {items.length === 0 ? (
        <Empty label="暂无冲刺中的歌曲" />
      ) : (
        <div className="ip-list">
          {items.map((it) => (
            <a className="ip-row" key={it.bvid} href={`https://www.bilibili.com/video/${it.bvid}`} target="_blank" rel="noreferrer">
              <div className="ip-row-head">
                <span className={`tag-mini ${meta?.cls ?? ""}`}>{it.tier_label}</span>
                <span className="ip-title">{it.title}</span>
                <span className="ip-view">{fmtWan(it.view)}</span>
              </div>
              <Progress pct={it.progress} color={meta?.bar ?? "#4fc3f7"} />
              <div className="ip-row-foot">
                <span className="ip-pct">{(it.progress * 100).toFixed(1)}%</span>
                <span className="ip-remain">距 {it.tier_label} 还差 {fmtWan(it.remain)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Insights() {
  const q = useQuery<InsightsOverview>({
    queryKey: ["insights-overview"],
    queryFn: api.insightsOverview,
  })

  if (q.isLoading)
    return (
      <div className="card" style={{ padding: 24 }}>
        <Spinner label="正在聚合洞察…" />
      </div>
    )
  if (q.isError)
    return (
      <div className="card" style={{ padding: 24 }}>
        <Empty label={`洞察数据加载失败：${(q.error as Error)?.message ?? "未知错误"}`} />
      </div>
    )

  const d = q.data!
  const kpis = d.kpis
  const freshness = d.freshness

  const stats = [
    { k: "曲库总量", v: fmtInt(kpis.songs_total), icon: Users },
    { k: "最新期上榜", v: fmtInt(kpis.board_count), icon: Gauge },
    { k: "神话曲", v: fmtInt(kpis.tier_counts.myth), icon: Crown },
    { k: "传说曲", v: fmtInt(kpis.tier_counts.legend), icon: Flame },
    { k: "殿堂曲", v: fmtInt(kpis.tier_counts.hall), icon: Mic2 },
    { k: "冲刺预警中", v: fmtInt(kpis.milestone_shots.myth + kpis.milestone_shots.legend + kpis.milestone_shots.hall), icon: TrendingUp },
  ]

  return (
    <>
      <Reveal>
        <PageHeader crumb="分析 · 预警与洞察" title="数据预警与洞察中心" />
      </Reveal>

      {freshness.stale && (
        <Reveal>
          <div className="ip-alert">
            <AlertTriangle size={16} />
            <span>
              数据新鲜度预警：最新周榜 <b>{freshness.latest_weekly_issue ?? "—"}</b> 已距今{" "}
              <b>{freshness.age_days ?? "—"} 天</b>，可能为同步静默失败。请前往「手动入库 / 数据同步」刷新。
            </span>
          </div>
        </Reveal>
      )}

      <StaggerGroup className="stat-row" style={{ marginBottom: 16 }}>
        {stats.map((s) => (
          <StaggerItem key={s.k}>
            <div className="stat">
              <div className="k"><s.icon size={12} /> {s.k}</div>
              <div className="v">{s.v}<small>项</small></div>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <StaggerGroup className="grid-2">
        <StaggerItem><MilestoneCard tier="myth" items={d.milestones.myth} /></StaggerItem>
        <StaggerItem><MilestoneCard tier="legend" items={d.milestones.legend} /></StaggerItem>
      </StaggerGroup>
      <StaggerGroup className="grid-2" style={{ marginTop: 16 }}>
        <StaggerItem><MilestoneCard tier="hall" items={d.milestones.hall} /></StaggerItem>

        <StaggerItem>
          <div className="card">
            <div className="card-title">
              <ArrowUp size={15} />
              <span>新曲首秀</span>
              {d.newcomers.issue && <span className="badge">{d.newcomers.issue}</span>}
            </div>
            {d.newcomers.items.length === 0 ? (
              <Empty label="本期暂无新曲首秀" />
            ) : (
              <div className="ip-list">
                {d.newcomers.items.map((it) => (
                  <a className="ip-row plain" key={it.bvid} href={it.url} target="_blank" rel="noreferrer">
                    <span className="rank-badge">{it.rank}</span>
                    <span className="ip-title">{it.title}</span>
                    <span className="ip-view">{fmtInt(it.score)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </StaggerItem>
      </StaggerGroup>

      <Reveal>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <ArrowDown size={15} />
            <span>排名突进</span>
            {d.surges.cur_issue && (
              <span className="badge">{d.surges.cur_issue} vs {d.surges.prev_issue}</span>
            )}
          </div>
          {d.surges.items.length === 0 ? (
            <Empty label="两期之间无显著排名突进" />
          ) : (
            <div className="table-scroll">
              <table className="rank-table">
                <thead>
                  <tr>
                    <th>本期</th>
                    <th>上期</th>
                    <th>名次上升</th>
                    <th>歌曲</th>
                    <th>得分</th>
                  </tr>
                </thead>
                <tbody>
                  {d.surges.items.map((it) => (
                    <tr key={it.bvid}>
                      <td>{it.rank}</td>
                      <td>{it.prev_rank}</td>
                      <td><span className="delta up">+{it.gain}</span></td>
                      <td>
                        <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
                      </td>
                      <td>{fmtInt(it.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>

      <Reveal>
        <div className="ip-note">
          <History size={13} />
          里程碑进度基于「当前最佳播放量」快照，仅在进入 75%~99% 冲刺窗口时预警；数据每 3 分钟自动刷新。
        </div>
      </Reveal>
    </>
  )
}
