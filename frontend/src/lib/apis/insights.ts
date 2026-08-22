/** 数据预警与洞察中心 API（/api/insights*）。 */
import { request } from "./request"
import type { InsightsOverview } from "../types"

export const insightsApi = {
  insightsOverview: () => request<InsightsOverview>("/api/insights/overview"),
}
