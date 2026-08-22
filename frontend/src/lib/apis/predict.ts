/** 下期冲榜预测领域 API（/api/predict*）。 */
import { request } from "./request"
import type { CutlineStat, PredictResult } from "../types"

export const predictApi = {
  predictNextWeek: (baseline = "auto", decay = 1.0, limit = 60, board = "weekly") =>
    request<PredictResult>(
      `/api/predict/next-week?baseline=${encodeURIComponent(baseline)}&decay=${decay}&limit=${limit}&board=${board}`,
    ),
  predictCutlines: (board = "weekly", lookback = 12) =>
    request<CutlineStat>(`/api/predict/cutlines?board=${board}&lookback=${lookback}`),
}
