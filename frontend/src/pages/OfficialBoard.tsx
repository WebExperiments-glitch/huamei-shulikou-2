import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { ChipRow, Empty, Spinner } from "../components/ui"
import { SkeletonTable } from "../components/Skeleton"
import { RankTable } from "../components/RankTable"
import { PageHeader } from "../components/PageHeader"
import { Badge } from "../components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip"
import { Reveal } from "../lib/motion"
import { TypewriterText } from "../lib/fx"

const TITLES: Record<string, string> = {
  weekly: "周榜",
  legend: "传说曲周榜",
  annual: "年榜 / 半年榜",
}

// 四代公式说明（与后端 rank.py 分代口径一致）：
//   old(<54) / mid(54-102) / early(103-110) / current(≥111)
type FormulaGen = "old" | "mid" | "early" | "current"
const FORMULA_LABEL: Record<FormulaGen, string> = {
  old: "旧公式",
  mid: "过渡公式",
  early: "现行早期",
  current: "现行公式",
}
const FORMULA_TEXT: Record<FormulaGen, string> = {
  old: "得分 = 2·Δ播放×t + Δ收藏×30 + Δ点赞×3 + Δ投币×10",
  mid: "得分 = Δ播放×t + Δ收藏×30 + Δ点赞×3 + Δ投币×10",
  early: "得分 = Δ播放×t + Δ收藏×30 + Δ点赞×3 + Δ投币×15",
  current: "得分 = Δ播放×t + Δ收藏×15 + Δ点赞×3 + Δ投币×30",
}

function ReentriesView({ boardType }: { boardType: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reentries", boardType],
    queryFn: () => api.reentries(boardType, 200),
  })

  if (isLoading) return <Spinner />
  const items = data?.items ?? []
  if (items.length === 0) return <Empty label="暂无二次上榜数据" />

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div className="card-title">
        历史二次上榜追踪
        <span className="badge">{items.length} 首</span>
      </div>
      <table className="rank-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>歌曲</th>
            <th className="num-th">上榜段数</th>
            <th className="num-th">累计周数</th>
            <th style={{ width: 130 }}>最近上榜期</th>
            <th>上榜历程（段）</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t, i) => (
            <tr key={t.bvid}>
              <td className="rank-no">{i + 1}</td>
              <td className="song-cell">
                <Link to={`/song/${t.bvid}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="t">{t.title}</span>
                </Link>
              </td>
              <td className="num">{t.segment_count}</td>
              <td className="num">{t.total_weeks}</td>
              <td className="num">{t.latest_issue}</td>
              <td style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                {t.segments.map((s, si) => (
                  <span key={si} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                    {s.start.slice(4)}~{s.end.slice(4)}
                    <span style={{ color: "var(--text-faint)" }}>
                      {" "}{s.weeks}周 最佳#{s.best_rank}
                    </span>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OfficialBoard() {
  const { type = "weekly" } = useParams()
  const [issue, setIssue] = useState<string>("")
  const [showReentry, setShowReentry] = useState(false)

  const issuesQ = useQuery({
    queryKey: ["issues", type],
    queryFn: () => api.boardIssues(type),
  })

  const effectiveIssue = issue || issuesQ.data?.issues[0]?.issue || ""

  const rankQ = useQuery({
    queryKey: ["rankings", type, effectiveIssue],
    queryFn: () => api.rankings(type, effectiveIssue, 100),
    enabled: !!effectiveIssue && !showReentry,
  })

  const issues = issuesQ.data?.issues ?? []
  const currentIssue = issues.find(i => i.issue === effectiveIssue)
  const formulaVersion = currentIssue?.formula_version ?? "new"
  const formulaGen: FormulaGen = currentIssue?.formula_gen ?? "current"

  return (
    <>
      <Reveal>
      <PageHeader
        crumb={<>榜单 · {TITLES[type] ?? type}</>}
        title={<TypewriterText text={TITLES[type] ?? type} />}
        extra={`${issues.length} 期 · 数据范围 ${issues[issues.length - 1]?.issue} ~ ${issues[0]?.issue}`}
      />
      </Reveal>

      {type === "legend" && (
        <Reveal delay={0.06}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            className="chip"
            style={!showReentry ? { background: "var(--accent)", color: "#fff" } : {}}
            onClick={() => setShowReentry(false)}
          >
            当期榜
          </button>
          <button
            className="chip"
            style={showReentry ? { background: "var(--accent)", color: "#fff" } : {}}
            onClick={() => setShowReentry(true)}
          >
            历史二次上榜
          </button>
        </div>
        </Reveal>
      )}

      {showReentry ? (
        <Reveal>
        <ReentriesView boardType={type} />
        </Reveal>
      ) : issuesQ.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Reveal>
          <div className="issue-picker">
            <ChipRow
              issues={issues}
              value={effectiveIssue}
              onChange={setIssue}
            />
          </div>
          </Reveal>
          {type === "weekly" && (
            <Reveal delay={0.06}>
            <div className="formula-note" style={{ marginBottom: 12 }}>
              <span className={`formula-dot ${formulaVersion === "old" ? "formula-old" : "formula-new"}`} />
              <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                {FORMULA_LABEL[formulaGen]}：{FORMULA_TEXT[formulaGen]}
                {" · "}分界：第 54 / 103 / 111 期
              </span>
            </div>
            </Reveal>
          )}
          <Reveal delay={0.12}>
          {rankQ.isLoading ? (
            <div className="card" style={{ padding: 20 }}><SkeletonTable rows={20} /></div>
          ) : rankQ.error ? (
            <Empty label="加载失败" />
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <div className="card-title">
                {effectiveIssue} 期
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant={formulaVersion === "old" ? "secondary" : "default"}
                        className={`cursor-help ${formulaVersion === "old" ? "formula-old" : "formula-new"}`}
                      >
                        {FORMULA_LABEL[formulaGen]}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                        {FORMULA_TEXT[formulaGen]}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline">{rankQ.data?.items.length ?? 0} 首</Badge>
              </div>
              <RankTable
                items={rankQ.data?.items ?? []}
                showStats
                showRate={type !== "annual"}
                exportName={`${type}-${effectiveIssue}`}
                boardType={type}
                issue={effectiveIssue}
                sparkline
              />
            </div>
          )}
          </Reveal>
        </>
      )}
    </>
  )
}