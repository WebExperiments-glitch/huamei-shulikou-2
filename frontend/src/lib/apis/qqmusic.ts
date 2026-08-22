/** QQ 音乐领域 API（/api/qqmusic*，免登录 / 免绿钻试听）。 */
import { request } from "./request"
import type { QQMusicSearchResult } from "../types"

const JSON_HEADERS = { "Content-Type": "application/json" } as const

export const qqmusicApi = {
  qqmusicSearch: (keyword: string, limit = 20) =>
    request<QQMusicSearchResult>("/api/qqmusic/search", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ keyword, limit }),
    }),
  qqmusicUrl: (id: string, mid?: string) =>
    request<{ id: string; url: string | null; br: number; free: boolean; vip: boolean }>(
      "/api/qqmusic/url",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ id, mid }),
      },
    ),
}
