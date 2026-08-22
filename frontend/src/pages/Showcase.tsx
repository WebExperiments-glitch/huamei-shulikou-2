import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Sparkles, Bot, TrendingUp, Music4, Trophy, Heart, Download, GripVertical } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"
import { Separator } from "../components/ui/separator"
import { Progress } from "../components/ui/progress"
import { Switch } from "../components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../components/ui/tooltip"
import {
  AnimatedGradientText, AnimatedBadge, BentoCard, BentoGrid, BorderBeam, DotPattern,
  GridPattern, Meteors, NumberTicker, ShineBorder, ShimmerText,
} from "../components/fx/magicui"
import {
  BackgroundBeams, CardHoverEffect, HoverBorderGradient, Spotlight, SpotlightCard, TextGenerateEffect, AuroraBackground,
} from "../components/fx/aceternity"
import { BlurText, GlowingCard, GradientText, SplitText, Magnetic, Marquee, WavyText } from "../components/fx/reactbits"
import { AnimateIn } from "../components/fx/animate"
import { LottiePlayer } from "../components/fx/lottie"
import { ConfettiBurst } from "../components/fx/confetti"
import { LiquidGlass } from "../components/fx/liquid-glass"
import { lensBleed } from "../lib/liquidGlass"
import { useFx } from "../lib/effects"
import { StaggerGroup, StaggerItem } from "../lib/motion"

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  // 入场动画由外层 StaggerGroup/StaggerItem 统一承担，此处不再叠 Reveal 避免双重动画
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Badge variant="outline" className="text-[10px]">{id}</Badge>
      </div>
      {desc && <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}
      {children}
    </section>
  )
}

/* ================= 液态玻璃演示 ================= */

const LIQUID_CHIPS = ["千本樱", "Tell Your World", "Phony", "テトリス", "ラビットホール", "人マニア", "マーシャル・マザー"]

/** 彩色演示场景：真实层与镜像层渲染同一组件，保证像素对齐（跑马灯同 commit 挂载 → 相位同步） */
function LiquidScene({ small = false }: { small?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(130deg,#ff3d81 0%,#7b6bff 42%,#2ee6a8 100%)" }}>
      <div className="absolute inset-0" style={{ color: "rgba(255,255,255,.45)" }}>
        <GridPattern width={34} height={34} className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="absolute font-black text-white"
        style={{ left: 18, top: small ? 12 : 22, fontSize: small ? 20 : 34, lineHeight: 1.15, textShadow: "0 2px 10px rgba(0,0,0,.25)" }}
      >
        VOCALOID
        {!small && <div style={{ fontSize: 15, fontWeight: 700 }}>术力口周榜 · 液态玻璃实验室</div>}
      </div>
      <div className="absolute inset-x-0" style={{ bottom: small ? 10 : 0, padding: small ? 0 : "12px 0", background: small ? "none" : "linear-gradient(to top, rgba(0,0,0,.22), transparent)" }}>
        <Marquee duration={small ? 14 : 20}>
          {LIQUID_CHIPS.map((t) => (
            <span key={t} className="whitespace-nowrap rounded-full bg-white/25 px-3 py-1 text-xs font-medium text-white">
              ♪ {t}
            </span>
          ))}
        </Marquee>
      </div>
    </div>
  )
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr) setW(Math.round(cr.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 可拖拽玻璃面板：拖动时镜像层跟随，边缘折射实时重算 */
function LiquidDragDemo({ strength, fxOn }: { strength: number; fxOn: boolean }) {
  const SCENE_H = 300
  const GLASS_W = 300
  const GLASS_H = 124
  const [heroRef, heroW] = useElementWidth<HTMLDivElement>()
  const [pos, setPos] = useState({ x: 170, y: 88 })
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const bleed = lensBleed(strength)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || !heroW) return
    setPos({
      x: clamp(d.x + e.clientX - d.px, 8, Math.max(8, heroW - GLASS_W - 8)),
      y: clamp(d.y + e.clientY - d.py, 8, SCENE_H - GLASS_H - 8),
    })
  }
  const endDrag = () => { drag.current = null }

  return (
    <div ref={heroRef} className="relative overflow-hidden rounded-xl border border-border" style={{ height: SCENE_H }}>
      <LiquidScene />
      <LiquidGlass
        radius={22}
        strength={strength}
        enabled={fxOn}
        backdrop={
          <div style={{ position: "absolute", left: bleed - pos.x, top: bleed - pos.y, width: Math.max(heroW, 1), height: SCENE_H }}>
            <LiquidScene />
          </div>
        }
        className="absolute z-10 cursor-grab select-none active:cursor-grabbing"
        style={{ left: pos.x, top: pos.y, width: GLASS_W, height: GLASS_H, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,.4)" }}>
            <GripVertical size={15} /> 拖动我 · Liquid Glass
          </div>
          <div className="text-[11px]" style={{ color: "rgba(255,255,255,.85)" }}>边缘折射 + 色散随位置实时重算</div>
        </div>
      </LiquidGlass>
    </div>
  )
}

/** 三档对比：毛玻璃 / +镜面高光 / +SDF 折射 */
function LiquidCompareBox({ label, variant, fxOn }: { label: string; variant: "plain" | "specular" | "liquid"; fxOn: boolean }) {
  const SCENE_H = 112
  const GLASS_W = 220
  const GLASS_H = 62
  const GX = 26
  const GY = 25
  const [sceneRef, sceneW] = useElementWidth<HTMLDivElement>()
  const bleed = lensBleed(46)
  return (
    <div>
      <div ref={sceneRef} className="relative overflow-hidden rounded-lg border border-border" style={{ height: SCENE_H }}>
        <LiquidScene small />
        <LiquidGlass
          radius={16}
          strength={46}
          enabled={fxOn}
          className={variant === "plain" ? "lg-nospec absolute" : "absolute"}
          style={{ left: GX, top: GY, width: GLASS_W, height: GLASS_H }}
          backdrop={
            variant === "liquid" ? (
              <div style={{ position: "absolute", left: bleed - GX, top: bleed - GY, width: Math.max(sceneW, 1), height: SCENE_H }}>
                <LiquidScene small />
              </div>
            ) : undefined
          }
        >
          <div className="flex h-full items-center justify-center text-xs font-semibold text-white" style={{ textShadow: "0 1px 5px rgba(0,0,0,.4)" }}>
            {variant === "liquid" ? "SDF 折射 + 色散" : variant === "specular" ? "+ 镜面高光" : "纯毛玻璃 blur"}
          </div>
        </LiquidGlass>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

export default function Showcase() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [progress, setProgress] = useState(68)
  const [confetti, setConfetti] = useState(0)
  const [lgStrength, setLgStrength] = useState(46)
  const fxLiquid = useFx("liquidGlass")

  return (
    <TooltipProvider delayDuration={200}>
      <div className="topbar">
        <div>
          <div className="crumb"><Link to="/">总览</Link> · UI 实验室</div>
          <h1>
            <AnimatedGradientText className="text-[26px] font-bold" speed={5}>
              UI 实验室 · 组件与特效全集
            </AnimatedGradientText>
          </h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            集成 shadcn/ui、Animate.css、Framer Motion（motion）、Lottie、Magic UI、Aceternity UI、React Bits
            七大体系的组件均在此展示。所有动效接入全局特效门控（汉堡菜单 → 特效设置），关闭后自动退化为静态。
          </p>
        </div>
      </div>

      <StaggerGroup stagger={0.08} className="flex flex-col gap-10">
        {/* ---------------- shadcn/ui 基础组件 ---------------- */}
        <StaggerItem>
          <Section id="shadcn/ui" title="shadcn/ui 基础组件" desc="Radix 无头原语 + Tailwind 语义 token（自动跟随明暗主题），与 antd 并存互补。">
            <Card>
              <CardHeader>
                <CardTitle>组件示例</CardTitle>
                <CardDescription>Button / Badge / Input / Label / Switch / Progress / Tabs / Dialog / Tooltip / Separator / Skeleton</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Button>主要按钮</Button>
                  <Button variant="secondary">次要</Button>
                  <Button variant="outline">描边</Button>
                  <Button variant="ghost">幽灵</Button>
                  <Button variant="destructive">危险</Button>
                  <Button variant="link">链接</Button>
                  <Button size="sm">小号</Button>
                  <Button size="lg">大号</Button>
                  <Button size="icon"><Sparkles /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>默认</Badge>
                  <Badge variant="secondary">次要</Badge>
                  <Badge variant="outline">描边</Badge>
                  <Badge variant="destructive">危险</Badge>
                  <Badge variant="gold">传说曲</Badge>
                  <Badge variant="green">神话曲</Badge>
                  <Badge variant="pink">殿堂曲</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="show-input">输入框</Label>
                    <Input id="show-input" placeholder="搜索歌曲 / BV号…" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="show-switch">开关（Switch）</Label>
                    <div className="flex h-9 items-center gap-2">
                      <Switch id="show-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
                      <span className="text-xs text-muted-foreground">{switchOn ? "已开启" : "已关闭"}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>进度条 <span className="text-muted-foreground">({progress}%)</span></Label>
                    <div className="flex h-9 items-center">
                      <Progress value={progress} className="h-2" />
                    </div>
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setProgress((p) => (p >= 100 ? 10 : p + 15))}>
                      +15%
                    </Button>
                  </div>
                </div>
                <Tabs defaultValue="weekly">
                  <TabsList>
                    <TabsTrigger value="weekly">周榜</TabsTrigger>
                    <TabsTrigger value="legend">传说曲</TabsTrigger>
                    <TabsTrigger value="annual">年榜</TabsTrigger>
                  </TabsList>
                  <TabsContent value="weekly" className="pt-3 text-sm text-muted-foreground">VOCALOID 周榜内容占位…</TabsContent>
                  <TabsContent value="legend" className="pt-3 text-sm text-muted-foreground">传说曲榜内容占位…</TabsContent>
                  <TabsContent value="annual" className="pt-3 text-sm text-muted-foreground">年榜内容占位…</TabsContent>
                </Tabs>
                <div className="flex flex-wrap items-center gap-3">
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">打开对话框</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>对话框标题</DialogTitle>
                        <DialogDescription>
                          Radix Dialog + 项目自带的进出场动画（受特效门控）。ESC / 点击遮罩可关闭。
                        </DialogDescription>
                      </DialogHeader>
                      <div className="text-sm text-muted-foreground">
                        可用于删除确认、详情弹层等场景，替代 antd Modal 的轻量场景。
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button>
                        <Button onClick={() => setDialogOpen(false)}>确定</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="secondary">悬停看 Tooltip</Button>
                    </TooltipTrigger>
                    <TooltipContent>Radix Tooltip · 语义配色</TooltipContent>
                  </Tooltip>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">骨架屏：</span>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
                <Separator />
                <div className="text-xs text-muted-foreground">Separator 分隔线 ↑</div>
              </CardContent>
            </Card>
          </Section>
        </StaggerItem>

        {/* ---------------- Magic UI ---------------- */}
        <StaggerItem>
          <Section id="magic-ui" title="Magic UI 移植" desc="流光渐变文字 / 环绕流光边框 / 边框光束 / 点阵网格背景 / 流星雨 / 数字滚动 / 闪烁文字。">
            <div className="flex flex-col gap-5">
              <BentoGrid>
                <BentoCard className="md:col-span-2" title={<AnimatedGradientText className="text-base font-semibold">Animated Gradient Text · 流光渐变标题</AnimatedGradientText>}
                  description="textAnim 开关控制；关闭后退化为静态渐变。">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-2xl font-bold">
                      <AnimatedGradientText speed={4}>术力口周榜 · 实时追踪</AnimatedGradientText>
                    </span>
                    <span className="text-sm">
                      <ShimmerText>Shimmer Text 微光扫过</ShimmerText>
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <AnimatedBadge>实时数据 · LIVE</AnimatedBadge>
                    <span className="text-muted-foreground">
                      本周冠军得分 <NumberTicker value={1286420} className="font-semibold text-primary" />
                    </span>
                  </div>
                </BentoCard>
                <BentoCard title="Meteors · 流星雨" description="particles 开关控制（默认关，性能优先）。可做登录页/空态背景。">
                  <div className="relative h-28 overflow-hidden rounded-lg border border-border bg-[color:var(--bg-soft)]">
                    <Meteors number={16} />
                    <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">把 particles 打开后再看</div>
                  </div>
                </BentoCard>
                <BentoCard title="ShineBorder · 环绕流光边框" description="conic-gradient 角度补间，cardMicro 控制。">
                  <ShineBorder borderRadius={12}>
                    <div className="p-4 text-sm">
                      <b>得分为 1,286,420</b>
                      <div className="mt-1 text-xs text-muted-foreground">边框流光沿圆周旋转，适合强调卡。</div>
                    </div>
                  </ShineBorder>
                </BentoCard>
                <BentoCard title="BorderBeam · 巡游光束" description="motion offsetPath 走矩形轨道。">
                  <div className="relative overflow-hidden rounded-xl border border-border p-4 text-sm">
                    <BorderBeam size={50} duration={5} />
                    <b>BorderBeam 卡片</b>
                    <div className="mt-1 text-xs text-muted-foreground">光束沿边框无限巡游。</div>
                  </div>
                </BentoCard>
                <BentoCard title="Dot / Grid Pattern · 背景纹理" description="SVG pattern 生成，零图片依赖。">
                  <div className="relative h-28 overflow-hidden rounded-lg border border-border">
                    <DotPattern className="[mask-image:radial-gradient(50%_50%_at_50%_50%,black,transparent)]" />
                    <GridPattern strokeDasharray="4 4" width={44} height={44} className="[mask-image:linear-gradient(to_bottom,black,transparent_80%)] opacity-70" />
                    <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">点阵 + 虚线网格</div>
                  </div>
                </BentoCard>
              </BentoGrid>
            </div>
          </Section>
        </StaggerItem>

        {/* ---------------- Aceternity ---------------- */}
        <StaggerItem>
          <Section id="aceternity-ui" title="Aceternity UI 移植" desc="悬停聚光灯卡片 / 渐变描边按钮 / 文字逐词浮现 / 斜射光束背景 / 列表悬停下沉。">
            <BentoGrid>
              <BentoCard className="md:col-span-2" title="Spotlight Card · 聚光灯卡片" description="鼠标跟随径向高光（上方 SVG 光斑 + 鼠标位置双层）。">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SpotlightCard className="p-5">
                    <Spotlight />
                    <div className="relative z-20">
                      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Trophy className="size-4 text-primary" /> 冠军观测</div>
                      <p className="text-xs leading-relaxed text-muted-foreground">移入卡片感受聚光灯——SVG 大光斑跟随项目品牌蓝。</p>
                    </div>
                  </SpotlightCard>
                  <SpotlightCard className="p-5" spotlightColor="rgba(194, 24, 140, 0.14)">
                    <div className="relative z-20">
                      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Heart className="size-4 text-[color:var(--pink)]" /> 收藏歌单</div>
                      <p className="text-xs leading-relaxed text-muted-foreground">spotlightColor 可自定义，粉色调适合歌单/情感类卡片。</p>
                    </div>
                  </SpotlightCard>
                </div>
                <div className="mt-4">
                  <TextGenerateEffect
                    text="把 B站 视频链接粘贴到公式实验室 系统会自动爬数据 按现行公式算分并拆解"
                    className="text-sm leading-7 text-muted-foreground"
                    wordsClassName="font-medium text-foreground"
                  />
                </div>
              </BentoCard>
              <BentoCard title="HoverBorderGradient · 流动描边按钮" description="悬停后四个方位渐次点亮。">
                <div className="flex h-full flex-col items-start justify-center gap-4 py-2">
                  <HoverBorderGradient
                    containerClassName="rounded-full"
                    className="px-5 py-2 text-sm font-medium"
                    duration={0.8}
                  >
                    悬停我 · 圆角胶囊
                  </HoverBorderGradient>
                  <div className="text-xs text-muted-foreground">适合 CTA 主行动点。</div>
                </div>
              </BentoCard>
              <BentoCard className="md:col-span-3 relative" title="Background Beams + CardHoverEffect" description="斜射光束背景（glassBg 控制）与列表悬停下沉高亮。">
                <div className="relative -mx-2">
                  <BackgroundBeams className="absolute -top-6 h-40" />
                  <div className="relative">
                    <CardHoverEffect
                      items={[
                        { title: "AI 智能体", description: "DeepSeek ReAct 回路，工具调用与联网搜索。", icon: <Bot /> },
                        { title: "下期冲榜预测", description: "按增量外推下一期排名走势。", icon: <TrendingUp /> },
                        { title: "网易云 + QQ 音乐", description: "自研 WeAPI 加密，搜索播放歌词。", icon: <Music4 /> },
                        { title: "报告与海报", description: "一键生成期次榜单海报。", icon: <Download /> },
                      ]}
                    />
                  </div>
                </div>
              </BentoCard>
            </BentoGrid>
          </Section>
        </StaggerItem>

        {/* ---------------- React Bits + Animate.css + Lottie ---------------- */}
        <StaggerItem>
          <Section id="react-bits" title="React Bits · Animate.css · Lottie" desc="逐字弹入 / 逐词模糊 / 渐变字；animate__ 入场工具类；lottie-react 播放 JSON 动画。">
            <BentoGrid>
              <BentoCard className="md:col-span-2" title="SplitText / BlurText / GradientText" description="textAnim 开关控制（默认关，避免影响阅读；可在特效设置打开）。">
                <div className="flex flex-col gap-3 py-1">
                  <div className="text-xl font-bold tracking-tight">
                    <SplitText text="术力口 · VOCALOID 周榜" />
                  </div>
                  <div className="text-sm">
                    <BlurText text="逐词模糊浮现的副标题效果" />
                  </div>
                  <div className="text-sm font-semibold">
                    <GradientText>静态渐变字 · 无动画依赖 · 始终可用</GradientText>
                  </div>
                  <GlowingCard className="mt-1 p-4">
                    <div className="text-xs text-muted-foreground">GlowingCard：悬停时边框泛光（cardMicro）。</div>
                  </GlowingCard>
                </div>
              </BentoCard>
              <BentoCard title="Animate.css" description="animate__fadeInUp / bounceIn / pulse 等百馀种工具动画，接 fx 密度。">
                <div className="flex flex-col gap-3">
                  <AnimateIn name="fadeInUp" delay={100}>
                    <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] p-3 text-xs">fadeInUp 入场</div>
                  </AnimateIn>
                  <AnimateIn name="zoomIn" delay={250}>
                    <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] p-3 text-xs">zoomIn 入场（延迟 250ms）</div>
                  </AnimateIn>
                  <AnimateIn name="flipInX" delay={400} gate="dataAnim">
                    <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] p-3 text-xs">flipInX（挂 dataAnim 门）</div>
                  </AnimateIn>
                </div>
              </BentoCard>
              <BentoCard className="md:col-span-3" title="Lottie（lottiefiles 生态）" description="内置三支轻量动画（手写 JSON，品牌配色）；替换/新增放 public/lottie/ 即可。">
                <div className="flex flex-wrap items-center gap-10 py-2">
                  <div className="flex flex-col items-center gap-2">
                    <LottiePlayer name="pulse-ring" size={72} />
                    <span className="text-xs text-muted-foreground">pulse-ring</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <LottiePlayer name="equalizer" size={90} />
                    <span className="text-xs text-muted-foreground">equalizer</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <LottiePlayer name="loading-dots" size={80} />
                    <span className="text-xs text-muted-foreground">loading-dots</span>
                  </div>
                </div>
              </BentoCard>
            </BentoGrid>
          </Section>
        </StaggerItem>

        {/* ---------------- 动画补充包 ---------------- */}
        <StaggerItem>
          <Section id="motion-pack" title="动画补充包" desc="极光背景 / 磁吸交互 / 跑马灯 / 彩带礼花 / 波浪文字。均已接入 fx 门控与 prefers-reduced-motion。">
            <ConfettiBurst trigger={confetti} origin={{ x: 0.5, y: 0.35 }} count={120} />
            <BentoGrid>
              <BentoCard className="md:col-span-2" title="Aurora · 极光背景" description="三团模糊光斑缓慢漂移（glassBg 门控）。已应用于总览页统计卡背后。">
                <div className="relative overflow-hidden rounded-lg border border-border py-8">
                  <AuroraBackground />
                  <div className="relative z-10 text-center text-sm text-muted-foreground">
                    极光在卡片间隙与边缘流动
                  </div>
                </div>
              </BentoCard>
              <BentoCard title="Magnetic · 磁吸" description="子元素向光标轻微吸附，离开回弹（cardMicro）。已应用于实时热度的刷新按钮。">
                <div className="flex h-full flex-col items-center justify-center gap-4 py-2">
                  <Magnetic strength={0.4}>
                    <Button>把光标凑近我</Button>
                  </Magnetic>
                  <div className="text-xs text-muted-foreground">spring 弹性回弹</div>
                </div>
              </BentoCard>
              <BentoCard className="md:col-span-2" title="Marquee · 跑马灯" description="无缝循环滚动，悬停暂停（dataAnim 门控）。可用于新上榜曲目速览。">
                <Marquee duration={26}>
                  {["千本樱", "Tell Your World", "甩葱歌", "Phony", "テトリス", "マーシャル・マザー", "ラビットホール", "人マニア"].map((t) => (
                    <span key={t} className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                      ♪ {t}
                    </span>
                  ))}
                </Marquee>
              </BentoCard>
              <BentoCard title="Confetti · 彩带礼花" description="手写 canvas 实现，零依赖（dataAnim 门控）。已应用于年度回顾页。">
                <div className="flex h-full flex-col items-center justify-center gap-4 py-2">
                  <Button variant="secondary" onClick={() => setConfetti((n) => n + 1)}>
                    🎉 放一场礼花
                  </Button>
                  <div className="text-xs text-muted-foreground">页面顶部会绽放品牌七色彩带</div>
                </div>
              </BentoCard>
              <BentoCard className="md:col-span-3" title="WavyText · 波浪文字 + Animate.css 扩展" description="字符正弦起伏（textAnim 门控，默认关）；错误框现在带 headShake 摇头入场（dataAnim）。">
                <div className="flex flex-col gap-4 py-1">
                  <div className="text-xl font-bold tracking-tight">
                    <WavyText text="VOCALOID 周榜" />
                    <span className="ml-3 text-xs font-normal text-muted-foreground">← 在特效设置打开「文本动画」后起伏</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <AnimateIn name="rubberBand" gate="dataAnim" className="w-fit">
                      <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] px-3 py-1.5 text-xs">rubberBand</div>
                    </AnimateIn>
                    <AnimateIn name="jackInTheBox" delay={150} gate="dataAnim" className="w-fit">
                      <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] px-3 py-1.5 text-xs">jackInTheBox</div>
                    </AnimateIn>
                    <AnimateIn name="headShake" delay={300} gate="dataAnim" className="w-fit">
                      <div className="rounded-lg border border-border bg-[color:var(--bg-soft)] px-3 py-1.5 text-xs">headShake（错误框同款）</div>
                    </AnimateIn>
                  </div>
                </div>
              </BentoCard>
            </BentoGrid>
          </Section>
        </StaggerItem>

        {/* ---------------- 液态玻璃 ---------------- */}
        <StaggerItem>
          <Section
            id="liquid-glass"
            title="液态玻璃 Liquid Glass"
            desc="iOS 26 风格：SDF 透镜置换贴图驱动 feDisplacementMap，边缘真实折射 + RGB 色散 + 镜面高光。架构为「背景镜像层 + filter:url()」——实测 Chromium 的 backdrop-filter 引用滤镜不支持 feImage（146 仍如此），镜像层方案全浏览器可用。受特效设置「液态玻璃表面」开关控制。"
          >
            <BentoGrid>
              <BentoCard
                className="md:col-span-2"
                title="可拖拽真折射 · 边缘实时弯折"
                description="拖动玻璃面板，观察边缘对背景文字与跑马灯的放大弯折，边缘细红蓝镶边即色散。"
              >
                <LiquidDragDemo strength={lgStrength} fxOn={fxLiquid} />
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="shrink-0">折射强度</span>
                  <input
                    type="range" min={20} max={80} value={lgStrength}
                    onChange={(e) => setLgStrength(Number(e.target.value))}
                    className="w-full accent-[color:var(--accent)]"
                    aria-label="液态玻璃折射强度"
                  />
                  <span className="w-8 shrink-0 text-right tabular-nums">{lgStrength}</span>
                </div>
              </BentoCard>
              <BentoCard className="md:col-span-1" title="三档对比" description="同一场景下：毛玻璃 → 镜面高光 → 完整折射。">
                <div className="flex flex-col gap-3">
                  <LiquidCompareBox label="① backdrop-filter 磨砂（全浏览器）" variant="plain" fxOn={fxLiquid} />
                  <LiquidCompareBox label="② + 纯 CSS 镜面高光（inset 阴光勾勒）" variant="specular" fxOn={fxLiquid} />
                  <LiquidCompareBox label="③ + SDF 透镜折射 + 色散（完整版）" variant="liquid" fxOn={fxLiquid} />
                </div>
              </BentoCard>
            </BentoGrid>
          </Section>
        </StaggerItem>
      </StaggerGroup>
    </TooltipProvider>
  )
}
