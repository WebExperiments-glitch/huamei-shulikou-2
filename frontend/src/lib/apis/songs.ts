/** 歌曲库领域 API：搜索/详情/公式拆解（/api/songs* + /api/translate）。 */
import { BASE, normalizeRankEntry, request } from "./request"
import type {
  AutoScoreResult,
  BiliSearchItem,
  FormulaCompare,
  RankEntry,
  RankRaw,
  ScoreBreakdown,
  Song,
  SongFacets,
  SuggestItem,
  TranslateResult,
} from "../types"

export const songsApi = {
  searchSongs: (params: {
    q?: string
    producer?: string
    vocalist?: string
    limit?: number
    offset?: number
    sort?: string
    order?: "asc" | "desc"
    board?: string
    minWeeks?: number
    tier?: string
    minView?: number
    maxView?: number
    pubFrom?: number
    pubTo?: number
  }) => {
    const p = new URLSearchParams()
    if (params.q) p.set("q", params.q)
    p.set("limit", String(params.limit ?? 50))
    p.set("offset", String(params.offset ?? 0))
    p.set("sort", params.sort ?? "id")
    p.set("order", params.order ?? "desc")
    if (params.producer) p.set("producer", params.producer)
    if (params.vocalist) p.set("vocalist", params.vocalist)
    if (params.board) p.set("board", params.board)
    if (params.minWeeks && params.minWeeks > 0) p.set("min_weeks", String(params.minWeeks))
    if (params.tier) p.set("tier", params.tier)
    if (params.minView != null) p.set("min_view", String(params.minView))
    if (params.maxView != null) p.set("max_view", String(params.maxView))
    if (params.pubFrom != null) p.set("pub_from", String(params.pubFrom))
    if (params.pubTo != null) p.set("pub_to", String(params.pubTo))
    return request<{ total: number; items: Song[] }>(`/api/songs/search?${p}`)
  },
  songFacets: () => request<SongFacets>("/api/songs/facets"),
  songSuggest: (q: string, limit = 8) =>
    request<{ items: SuggestItem[] }>(`/api/songs/suggest?q=${encodeURIComponent(q)}&limit=${limit}`),
  nameSuggest: (role: "producers" | "vocalists", q: string, limit = 8) =>
    request<{ items: { name: string; count: number }[] }>(
      `/api/songs/suggest-names?role=${role}&q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  translate: (bvid: string, title: string, target: "en" | "zh") =>
    request<TranslateResult>(
      `/api/translate?bvid=${encodeURIComponent(bvid)}&title=${encodeURIComponent(title)}&target=${target}`,
    ),
  song: (bvid: string) => request<Song>(`/api/songs/${bvid}`),
  // 手动入库：把 B站链接 / BV 号补全进收录池（已上榜的歌曲直接借榜单信息，零网络依赖）
  ingestSong: async (input: string): Promise<Song> => {
    const res = await fetch(`${BASE}/api/songs/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input }),
    })
    if (!res.ok) {
      let msg = `入库失败（${res.status}）`
      try {
        const j = await res.json()
        if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)
      } catch {
        /* 保留默认信息 */
      }
      throw new Error(msg)
    }
    return res.json() as Promise<Song>
  },
  allHistory: async (bvid: string) => {
    const raw = await request<{ song: Song; histories: Record<string, RankRaw[]> }>(
      `/api/songs/${bvid}/all-history`,
    )
    const normalized: Record<string, RankEntry[]> = {}
    for (const [key, items] of Object.entries(raw.histories)) {
      normalized[key] = items.map(normalizeRankEntry)
    }
    return { song: raw.song, histories: normalized }
  },
  scoreBreakdown: (bvid: string, board = "weekly") =>
    request<ScoreBreakdown>(`/api/songs/${bvid}/score-breakdown?board=${board}`),
  formulaCompare: (bvid: string, board = "weekly") =>
    request<FormulaCompare>(`/api/songs/${bvid}/formula-compare?board=${board}`),
  // 公式实验室极简模式：粘贴 BV/链接后一键算分（自动取数 + 新旧公式拆解 + 最新一期汇总）
  autoScore: (bvid: string, board = "weekly") =>
    request<AutoScoreResult>(`/api/songs/${bvid}/auto-score?board=${board}`),
  // 公式实验室：粘贴曲名在 B站 搜索定位 BV（WBI 签名）
  searchBilibili: (q: string, limit = 10) =>
    request<{ items: BiliSearchItem[] }>(
      `/api/songs/search-bilibili?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
}
