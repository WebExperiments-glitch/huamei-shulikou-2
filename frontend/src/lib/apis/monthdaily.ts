/** 月榜 + 日榜领域 API（/api/monthly* + /api/daily*）。 */
import { request } from "./request"
import type { DailyIssue, DailyRank, MonthIssue, MonthRank } from "../types"

export const monthDailyApi = {
  monthIssues: () => request<{ issues: MonthIssue[] }>("/api/monthly/issues"),
  MonthRanks: (issue: string, top = 100) =>
    request<{ issue: string; month: string; items: MonthRank[] }>(
      `/api/monthly/issues/${issue}/rankings?top=${top}`,
    ),
  dailyIssues: () => request<DailyIssue[]>("/api/daily/issues"),
  dailyRankings: (issue: string, top = 100) =>
    request<{ issue: string; date: string; items: DailyRank[] }>(
      `/api/daily/issues/${issue}/rankings?top=${top}`,
    ),
}
