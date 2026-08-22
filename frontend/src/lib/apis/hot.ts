/** 实时热度领域 API（/api/hot*）。 */
import { request } from "./request"
import type {
  HotSong,
  HotStatus,
  HotSummary,
  MomentumResponse,
  Snapshot,
  SongThink,
  ThinkCandidate,
} from "../types"

export const hotApi = {
  hotStatus: () => request<HotStatus>("/api/hot/status"),
  hotRefresh: (scope = "recent") =>
    request<{ started: boolean; scope: string }>(`/api/hot/refresh?scope=${scope}`, {
      method: "POST",
    }),
  hotSongs: (sort = "score", limit = 50, offset = 0, q?: string, tier?: string) =>
    request<{ total: number; items: HotSong[]; summary: HotSummary }>(
      `/api/hot/songs?sort=${sort}&limit=${limit}&offset=${offset}${
        q ? `&q=${encodeURIComponent(q)}` : ""
      }${tier ? `&tier=${tier}` : ""}`,
    ),
  hotMomentum: (metric = "view", limit = 50, offset = 0) =>
    request<MomentumResponse>(`/api/hot/momentum?metric=${metric}&limit=${limit}&offset=${offset}`),
  hotSnapshots: (limit = 100) =>
    request<{ items: Snapshot[] }>(`/api/hot/snapshots?limit=${limit}`),
  thinkSearch: (q: string) =>
    request<{ items: ThinkCandidate[] }>(`/api/hot/think/search?q=${encodeURIComponent(q)}`),
  thinkDetail: (bvid: string) =>
    request<SongThink>(`/api/hot/think/detail?bvid=${encodeURIComponent(bvid)}`),
}
