/** 榜单领域 API：周榜/传说榜/年榜（/api/boards*）。 */
import { normalizeRankEntry, request } from "./request"
import type { BoardInfo, IssueInfo, RankRaw, ReentryTrack } from "../types"

export const boardsApi = {
  boards: () => request<{ boards: BoardInfo[] }>("/api/boards"),
  boardIssues: (type: string) =>
    request<{ board_type: string; issues: IssueInfo[] }>(`/api/boards/${type}/issues`),
  rankings: async (type: string, issue: string, top = 100) => {
    const raw = await request<{
      board_type: string
      issue: string
      date: string
      items: RankRaw[]
    }>(`/api/boards/${type}/issues/${issue}/rankings?top=${top}`)
    return { ...raw, items: raw.items.map(normalizeRankEntry) }
  },
  songHistory: async (type: string, bvid: string) => {
    const raw = await request<{ board_type: string; bvid: string; history: RankRaw[] }>(
      `/api/boards/${type}/song/${bvid}/history`,
    )
    return { ...raw, history: raw.history.map(normalizeRankEntry) }
  },
  boardSparklines: (type: string, issue: string, count = 10) =>
    request<{
      board_type: string
      issue: string
      count: number
      sparklines: Record<string, (number | null)[]>
    }>(`/api/boards/${type}/issues/${issue}/sparklines?count=${count}`),
  reentries: (boardType = "legend", top = 200) =>
    request<{ board_type: string; items: ReentryTrack[] }>(
      `/api/boards/${boardType}/reentries?top=${top}`,
    ),
}
