/**
 * API 聚合入口（兼容历史：所有页面 `import { api } from "../lib/api"`）。
 *
 * 实际实现按领域拆分在 ./apis/ 各模块中（boards / songs / stats / hot / ai …），
 * 新增接口时：找到对应领域文件加方法即可，无需改动本文件。
 * 错误处理/request-id/调试日志等共享逻辑见 ./apis/request.ts。
 */
import { aiApi } from "./apis/ai"
import { boardsApi } from "./apis/boards"
import { hotApi } from "./apis/hot"
import { insightsApi } from "./apis/insights"
import { monthDailyApi } from "./apis/monthdaily"
import { neteaseApi } from "./apis/netease"
import { qqmusicApi } from "./apis/qqmusic"
import { predictApi } from "./apis/predict"
import { songsApi } from "./apis/songs"
import { statsApi } from "./apis/stats"
import { syncApi } from "./apis/sync"

export const api = {
  ...boardsApi,
  ...songsApi,
  ...statsApi,
  ...monthDailyApi,
  ...hotApi,
  ...predictApi,
  ...neteaseApi,
  ...qqmusicApi,
  ...aiApi,
  ...syncApi,
  ...insightsApi,
}

// 供 AI 流式调用场景直接使用（Agent.tsx 等依赖这些类型的语义）
export type { AIStreamHandlers, AIStreamOptions } from "./apis/ai"
