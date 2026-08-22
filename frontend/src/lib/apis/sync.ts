/** 数据同步领域 API（/api/sync*）。 */
import { request } from "./request"
import type { SyncStatus } from "../types"

export const syncApi = {
  syncRefresh: (songs = true) =>
    request<{ status: string; message?: string }>(
      `/api/sync/refresh?songs=${songs ? "true" : "false"}`,
      { method: "POST" },
    ),
  syncStatus: () => request<SyncStatus>("/api/sync/status"),
}
