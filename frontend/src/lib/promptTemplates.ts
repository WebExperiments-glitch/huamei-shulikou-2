import { create } from "zustand"

export interface PromptTemplate {
  id: string
  title: string
  text: string
  builtin?: boolean
}

/** 内置专业模板：与后端 Agent 工具集对齐（get_insights / get_song_compare / get_creator_stats 等） */
const BUILTIN: PromptTemplate[] = [
  {
    id: "b-weekly",
    builtin: true,
    title: "周榜周报",
    text: "请基于最新一期周榜生成一份专业周报：Top10 名单、本周新曲首秀、排名突进、P主与歌姬上榜情况。",
  },
  {
    id: "b-milestone",
    builtin: true,
    title: "里程碑冲刺预警",
    text: "调用 get_insights 列出当前正在冲刺神话曲 / 传说曲 / 殿堂曲的歌曲，按达成进度排序，并说明每首还差多少播放。",
  },
  {
    id: "b-compare",
    builtin: true,
    title: "两曲对比",
    text: "对比两首歌曲：用 get_song_compare 对比播放 / 点赞 / 投币 / 收藏 / 评论 / 弹幕 / 分享，并给出可视化图表。",
  },
  {
    id: "b-creator",
    builtin: true,
    title: "歌姬 / P主作品盘点",
    text: "介绍（P主或歌姬名）的作品：用 get_creator_stats 汇总歌曲数、总播放、传说曲 / 神话曲数与代表作，并可联网补充背景资料。",
  },
  {
    id: "b-depth",
    builtin: true,
    title: "周榜深度分析",
    text: "分析最新一期周榜：榜首歌曲、P主与歌姬分布、与上一期相比的排名变化、以及值得关注的趋势判断。",
  },
]

const KEY = "hb-agent-prompt-templates"

function loadCustom(): PromptTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as PromptTemplate[]
  } catch {
    /* ignore */
  }
  return []
}
function saveCustom(list: PromptTemplate[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

interface TemplateStore {
  custom: PromptTemplate[]
  all: () => PromptTemplate[]
  add: (title: string, text: string) => void
  remove: (id: string) => void
}

let uid = 0
function genId() {
  uid += 1
  return "c" + Date.now().toString(36) + uid
}

export const usePromptTemplates = create<TemplateStore>((set, get) => ({
  custom: loadCustom(),
  all: () => [...get().custom, ...BUILTIN],
  add: (title, text) => {
    const t = title.trim() || "未命名模板"
    if (!text.trim()) return
    const custom = [{ id: genId(), title: t, text: text.trim() }, ...get().custom]
    set({ custom })
    saveCustom(custom)
  },
  remove: (id) => {
    const custom = get().custom.filter((t) => t.id !== id)
    set({ custom })
    saveCustom(custom)
  },
}))
