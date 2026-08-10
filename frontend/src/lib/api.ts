const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8010"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

// ---- 本地大模型 SSE 流式读取 ----
export interface AIStreamHandlers {
  onContent?: (text: string) => void
  onReasoning?: (text: string) => void
  onDone?: () => void
  onError?: (msg: string) => void
  onCache?: (hit: boolean) => void
  signal?: AbortSignal
}

export interface AIStreamOptions extends AIStreamHandlers {
  system?: string | null
  prompt: string
  maxTokens?: number
  temperature?: number
}

async function streamSSE(
  path: string,
  body: Record<string, unknown>,
  opts: AIStreamHandlers,
): Promise<void> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    if (!res.ok || !res.body) {
      opts.onError?.(`服务返回 ${res.status}`)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ""
    let doneFired = false
    const fireDone = () => {
      if (!doneFired) {
        doneFired = true
        opts.onDone?.()
      }
    }
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const events = buf.split("\n\n")
      buf = events.pop() ?? ""
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data:"))
        if (!line) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const obj = JSON.parse(payload)
          if (obj.type === "content") opts.onContent?.(obj.text)
          else if (obj.type === "reasoning") opts.onReasoning?.(obj.text)
          else if (obj.type === "cache") opts.onCache?.(obj.hit === true)
          else if (obj.type === "done") fireDone()
          else if (obj.type === "error") opts.onError?.(obj.text)
        } catch {
          /* 忽略不完整分片 */
        }
      }
    }
    fireDone()
  } catch (e: any) {
    if (e?.name === "AbortError") return
    opts.onError?.(e?.message ?? String(e))
  }
}

export const api = {
  boards: () => request<{ boards: BoardInfo[] }>("/api/boards"),
  boardIssues: (type: string) =>
    request<{ board_type: string; issues: IssueInfo[] }>(`/api/boards/${type}/issues`),
  rankings: (type: string, issue: string, top = 100) =>
    request<{ board_type: string; issue: string; date: string; items: RankEntry[] }>(
      `/api/boards/${type}/issues/${issue}/rankings?top=${top}`,
    ),
  songHistory: (type: string, bvid: string) =>
    request<{ board_type: string; bvid: string; history: RankEntry[] }>(
      `/api/boards/${type}/song/${bvid}/history`,
    ),
  boardSparklines: (type: string, issue: string, count = 10) =>
    request<{ board_type: string; issue: string; count: number; sparklines: Record<string, (number | null)[]> }>(
      `/api/boards/${type}/issues/${issue}/sparklines?count=${count}`,
    ),
  reentries: (boardType = "legend", top = 200) =>
    request<{ board_type: string; items: ReentryTrack[] }>(
      `/api/boards/${boardType}/reentries?top=${top}`,
    ),
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
    request<TranslateResult>(`/api/translate?bvid=${encodeURIComponent(bvid)}&title=${encodeURIComponent(title)}&target=${target}`),
  song: (bvid: string) => request<Song>(`/api/songs/${bvid}`),
  allHistory: (bvid: string) =>
    request<{ song: Song; histories: Record<string, RankEntry[]> }>(
      `/api/songs/${bvid}/all-history`,
    ),
  scoreBreakdown: (bvid: string, board = "weekly") =>
    request<ScoreBreakdown>(`/api/songs/${bvid}/score-breakdown?board=${board}`),
  artists: (limit = 5000) =>
    request<{ kind: string; total: number; items: ArtistStat[] }>(`/api/stats/artists?limit=${limit}`),
  vocalists: (limit = 5000) =>
    request<{ kind: string; total: number; items: ArtistStat[] }>(`/api/stats/vocalists?limit=${limit}`),
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
  hotStatus: () => request<HotStatus>("/api/hot/status"),
  hotRefresh: (scope = "recent") =>
    request<{ started: boolean; scope: string }>(`/api/hot/refresh?scope=${scope}`, { method: "POST" }),
  hotSongs: (sort = "score", limit = 50, offset = 0, q?: string, tier?: string) =>
    request<{ total: number; items: HotSong[]; summary: HotSummary }>(
      `/api/hot/songs?sort=${sort}&limit=${limit}&offset=${offset}${
        q ? `&q=${encodeURIComponent(q)}` : ""
      }${tier ? `&tier=${tier}` : ""}`,
    ),
  hotMomentum: (metric = "view", limit = 50, offset = 0) =>
    request<MomentumResponse>(
      `/api/hot/momentum?metric=${metric}&limit=${limit}&offset=${offset}`,
    ),
  hotSnapshots: (limit = 100) =>
    request<{ items: Snapshot[] }>(`/api/hot/snapshots?limit=${limit}`),
  thinkSearch: (q: string) =>
    request<{ items: ThinkCandidate[] }>(`/api/hot/think/search?q=${encodeURIComponent(q)}`),
  thinkDetail: (bvid: string) =>
    request<SongThink>(`/api/hot/think/detail?bvid=${encodeURIComponent(bvid)}`),

  // ---- 网易云搜索（backend/app/api/netease.py） ----
  neteaseSearch: (keyword: string, limit = 20, type = "song") =>
    request<NeteaseSearchResult>("/api/netease/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, limit, type }),
    }),
  neteaseSong: (id: number | string) =>
    request<NeteaseDetail>("/api/netease/song", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  neteaseArtist: (id: number | string) =>
    request<NeteaseArtistDetail>("/api/netease/artist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  neteaseAlbum: (id: number | string) =>
    request<NeteaseAlbumDetail>("/api/netease/album", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  neteasePlaylist: (id: number | string) =>
    request<NeteasePlaylistDetail>("/api/netease/playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  neteaseLyric: (id: number | string) =>
    request<NeteaseLyric>("/api/netease/lyric", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  neteaseUrl: (id: number | string) =>
    request<{ id: number; url: string | null; br: number; size: number; code: number; md5?: string }>(
      "/api/netease/url",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      },
    ),

  // ---- AI 分析（本地大模型，OpenAI 兼容 SSE 流） ----
  // 预留的可复用接口：其它页面只需传 system + prompt 即可调用通用 aiStream。
  aiHealth: () =>
    request<{
      ready: boolean
      base_url?: string
      model?: string
      active?: string
      models?: { key: string; name: string; port: number; up: boolean }[]
      cloud?: boolean
      detail?: string
    }>("/api/ai/health"),
  aiSwitch: (model: string) =>
    request<{ ok: boolean; model?: string; port?: number; active?: string; error?: string }>(
      "/api/ai/switch",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) },
    ),
  aiStreamSong: (
    bvid: string,
    history: AiTurn[],
    opts: AIStreamHandlers,
  ) =>
    streamSSE(
      "/api/ai/stream-song",
      { bvid, history, max_tokens: 3584, temperature: 0.6 },
      opts,
    ),
  aiStream: (opts: AIStreamOptions) =>
    streamSSE(
      "/api/ai/stream",
      {
        system: opts.system ?? null,
        prompt: opts.prompt,
        max_tokens: opts.maxTokens ?? 3584,
        temperature: opts.temperature ?? 0.6,
      },
      opts,
    ),
  syncRefresh: (songs = true) =>
    request<{ status: string; message?: string }>(
      `/api/sync/refresh?songs=${songs ? "true" : "false"}`,
      { method: "POST" },
    ),
  syncStatus: () => request<any>("/api/sync/status"),
}

import type {
  AiTurn,
  ArtistStat,
  BoardInfo,
  DailyIssue,
  DailyRank,
  HotSong,
  HotStatus,
  HotSummary,
  IssueInfo,
  MonthIssue,
  MonthRank,
  MomentumResponse,
  NeteaseDetail,
  NeteaseSearchResult,
  NeteaseArtistDetail,
  NeteaseAlbumDetail,
  NeteasePlaylistDetail,
  NeteaseLyric,
  RankEntry,
  ReentryTrack,
  ScoreBreakdown,
  Snapshot,
  Song,
  SongFacets,
  SuggestItem,
  ThinkCandidate,
  SongThink,
  TranslateResult,
} from "./types"
