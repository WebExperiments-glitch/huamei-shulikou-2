/** 统计领域 API：P主/歌姬榜单（/api/stats*）。 */
import { request } from "./request"
import type { ArtistStat } from "../types"

export const statsApi = {
  artists: (limit = 5000) =>
    request<{ kind: string; total: number; items: ArtistStat[] }>(`/api/stats/artists?limit=${limit}`),
  vocalists: (limit = 5000) =>
    request<{ kind: string; total: number; items: ArtistStat[] }>(
      `/api/stats/vocalists?limit=${limit}`,
    ),
}
