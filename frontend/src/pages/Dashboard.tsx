import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { useMemo, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "antd"
import { api } from "../lib/api"
import { Empty, Spinner } from "../components/ui"
import { RankTable } from "../components/RankTable"
import { ChartCard } from "../components/ChartCard"
import { PageHeader } from "../components/PageHeader"
import { SpotlightCard, AuroraBackground } from "../components/fx/aceternity"
import { LiquidGlass } from "../components/fx/liquid-glass"
import { lensBleed } from "../lib/liquidGlass"
import { useFx } from "../lib/effects"
import { useTheme, getChartPalette } from "../lib/theme"
import { Reveal, StaggerGroup, StaggerItem } from "../lib/motion"
import { AnimatedNumber, TiltCard, TypewriterText } from "../lib/fx"

/** 带数字滚动动画的统计块（AnimatedNumber 驱动） */
function CountStatistic({ value, suffix, valueStyle }: {
  value: number
  suffix?: string
  valueStyle?: CSSProperties
}) {
  return (
    <div style={valueStyle}>
      <AnimatedNumber value={value} />
      {suffix && <small style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)", marginLeft: 4 }}>{suffix}</small>}
    </div>
  )
}

// 液态玻璃镜像层出血（与 strength=36 对应），镜像需再外扩 8px 覆盖极光的 -inset-8
const AURORA_BLEED = lensBleed(36)

export default function Dashboard() {
  const auroraWrapRef = useRef<HTMLDivElement>(null)
  const liquidOn = useFx("liquidGlass")
  const { data, isLoading, error } = useQuery({
    queryKey: ["boards"],
    queryFn: api.boards,
  })
  const weeklyQ = useQuery({ queryKey: ["issues", "weekly"], queryFn: () => api.boardIssues("weekly") })
  const { theme } = useTheme()
  const pal = getChartPalette(theme)
  const trendOpt = useMemo(() => {
    const issues = [...(weeklyQ.data?.issues ?? [])].sort((a, b) =>
      a.issue.localeCompare(b.issue, undefined, { numeric: true }),
    )
    if (issues.length === 0) return null
    return {
      tooltip: { trigger: "axis", backgroundColor: pal.tooltipBg, borderColor: pal.tooltipBorder, textStyle: { color: pal.text } },
      grid: { left: 48, right: 20, top: 16, bottom: 36 },
      xAxis: {
        type: "category", data: issues.map((i) => i.issue),
        axisLabel: { color: pal.axis, fontSize: 10, rotate: 45 },
        axisLine: { lineStyle: { color: pal.split } },
      },
      yAxis: {
        type: "value", name: "上榜首数", nameTextStyle: { color: pal.axis, fontSize: 11 },
        axisLabel: { color: pal.axis }, splitLine: { lineStyle: { color: pal.split } },
      },
      series: [{
        type: "line", data: issues.map((i) => i.entries), smooth: true, symbolSize: 4,
        areaStyle: { color: "rgba(79,195,247,0.12)" },
        lineStyle: { color: "#4fc3f7", width: 2 }, itemStyle: { color: "#4fc3f7" },
      }],
    }
  }, [weeklyQ.data, pal])

  if (isLoading) return <Spinner />
  if (error) return <Empty label={`后端连接失败: ${(error as Error).message}`} />

  const boards = data?.boards ?? []

  return (
    <>
      <PageHeader
        crumb="VOCALOID CHART · huamei术力口"
        title={<TypewriterText text="总览" />}
        live
        extra={`最新期次 ${boards[0]?.latest?.issue ?? "—"}`}
      />

      {/* 统计卡背后垫一层极光（glassBg 门控，关闭后无背景光斑）；
          整行套液态玻璃：镜像层复刻极光并相位同步，边缘真实折射 */}
      <div className="relative" ref={auroraWrapRef}>
        <AuroraBackground className="-inset-8 -z-10" />
        <LiquidGlass
          className="relative"
          radius={16}
          strength={36}
          enabled={liquidOn}
          syncFrom={auroraWrapRef}
          backdrop={
            <div
              style={{
                position: "absolute",
                left: AURORA_BLEED - 8, top: AURORA_BLEED - 8,
                right: AURORA_BLEED - 8, bottom: AURORA_BLEED - 8,
              }}
            >
              <AuroraBackground className="-inset-8" />
            </div>
          }
        >
        <StaggerGroup className="stat-row" stagger={0.07} style={{ marginBottom: 20, position: "relative", zIndex: 2 }}>
        {boards.map((b) => (
          <StaggerItem key={b.type}>
            <Link to={b.type === "weekly" ? "/board/weekly" : b.type === "legend" ? "/board/legend" : "/board/annual"} style={{ textDecoration: "none", color: "inherit" }}>
              <TiltCard>
                <SpotlightCard className="p-4 bg-card/55">
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>{b.label}</div>
                  <CountStatistic value={b.issue_count} suffix="期" valueStyle={{ fontSize: 24, fontWeight: 700, color: "var(--text)" }} />
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>
                    最新 {b.latest?.issue ?? "—"} · {b.latest?.date ?? ""}
                  </div>
                </SpotlightCard>
              </TiltCard>
            </Link>
          </StaggerItem>
        ))}
        <StaggerItem>
          <Link to="/monthly" style={{ textDecoration: "none", color: "inherit" }}>
            <TiltCard>
              <SpotlightCard className="p-4 bg-card/55" spotlightColor="rgba(194, 24, 140, 0.13)">
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>月榜（聚合）</div>
                <CountStatistic value={27} suffix="个月" valueStyle={{ fontSize: 24, fontWeight: 700, color: "var(--text)" }} />
                <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>周榜按自然月聚合</div>
              </SpotlightCard>
            </TiltCard>
          </Link>
        </StaggerItem>
        </StaggerGroup>
        </LiquidGlass>
      </div>

      <Reveal>
        {trendOpt && (
          <ChartCard
            title="周榜规模趋势"
            option={trendOpt}
            filename="dashboard-weekly-trend"
            badge={`${weeklyQ.data?.issues.length ?? 0} 期`}
          />
        )}
      </Reveal>
      <Reveal delay={0.08}>
        <LatestBoard type="weekly" title="最新·周榜 Top 20" to="/board/weekly" />
      </Reveal>
    </>
  )
}

function LatestBoard({ type, title, to }: { type: string; title: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["latest", type],
    queryFn: async () => {
      const boards = await api.boards()
      const latest = boards.boards.find((b) => b.type === type)?.latest
      if (!latest) return null
      return api.rankings(type, latest.issue, 20)
    },
  })

  return (
    <Card
      title={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span>{title}</span>
          <Link to={to} style={{ fontSize: 12.5 }}>查看全部 →</Link>
        </div>
      }
      styles={{ body: { paddingTop: 8 } }}
    >
      {isLoading ? <Spinner /> : data ? <RankTable items={data.items} showStats /> : <Empty />}
    </Card>
  )
}