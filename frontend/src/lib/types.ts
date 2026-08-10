export interface Producer {
  name: string
  url?: string | null
  aliases?: string[]
  id?: number
  moegirl_url?: string | null
  wiki_url?: string | null
}

export interface Vocalist {
  name: string
  url?: string | null
  aliases?: string[]
  id?: number
  moegirl_url?: string | null
  wiki_url?: string | null
}

export interface BoardInfo {
  type: string
  label: string
  issue_count: number
  latest: IssueInfo | null
  range: { start: string | null; end: string | null }
}

export interface IssueInfo {
  issue: string
  date: string
  entries: number
  is_annual?: number
}

export interface RankEntry {
  rank: number
  bvid: string
  title: string
  title_cn?: string | null
  view?: number
  views?: number
  favorite?: number
  favorites?: number
  coin?: number
  coins?: number
  like?: number
  likes?: number
  share?: number
  score: number
  pubtime?: number
  first_recorded_at?: number
  last_rank?: number | null
  weeks_on_board?: number
  peak_rank?: number
  rate?: string | null
  producers?: Producer[]
  vocalists?: Vocalist[]
  issue?: string
  issue_date?: string
  name?: string
  sum_score?: number
  best_rank?: number
}

export interface Song {
  id: number
  bvid: string
  title: string
  title_cn?: string | null
  pubtime?: number
  first_recorded_at?: number
  producers: Producer[]
  vocalists: Vocalist[]
  weeks_on_board?: number
  best_rank?: number | null
  boards?: string[]
  /** 最佳已知指标（来自 data* 快照 / legend / annual 聚合，未收录则为 null） */
  view?: number | null
  favorite?: number | null
  coin?: number | null
  like?: number | null
  share?: number | null
  peak_score?: number | null
  /** 里程碑：hall=殿堂(10万) legend=传说(百万) myth=神话(千万) */
  tier?: "hall" | "legend" | "myth" | null
}

export interface SongFacets {
  total: number
  with_metrics: number
  tiers: { hall: number; legend: number; myth: number; none: number }
}

export interface ArtistStat {
  name: string
  url: string | null
  songs: number
  /** 可统计指标歌曲的播放量合计（仅来自有指标快照表的歌曲） */
  total_view?: number | null
  /** 旗下传说曲（百万）数量 */
  legend?: number | null
  /** 旗下神话曲（千万）数量 */
  myth?: number | null
  /** 代表曲（可统计指标中播放最高的曲子） */
  best_view?: number | null
  best_bvid?: string | null
  best_title?: string | null
}

export interface SuggestItem {
  bvid: string
  title: string
  title_cn?: string | null
}

export interface TranslateResult {
  bvid: string
  target: string
  text: string
  cached: boolean
}

export interface MonthIssue {
  issue: string
  entries: number
}

export interface MonthRank {
  rank: number
  bvid: string
  title: string
  weeks_on_board: number
  best_rank: number
  sum_score: number
}

export interface DailyIssue {
  issue: string
  entries: number
}

export interface DailyRank {
  rank: number
  bvid: string
  name: string
  view: number
  favorite: number
  coin: number
  share: number
  like: number
  score: number
}

export interface HotSong {
  bvid: string
  title: string
  title_cn: string
  owner: string
  pubtime: number
  view: number
  favorite: number
  coin: number
  like: number
  share: number
  fetch_time: number
  score: number
  /** 较上次快照增量（无基线时为 null） */
  dv: number | null
  df: number | null
  dc: number | null
  dl: number | null
  ds: number | null
  /** 涨速综合分 = dv + df×15 + dc×30 + dl×3 */
  dscore: number | null
  window_days: number | null
}

export interface MomentumItem {
  bvid: string
  title: string
  title_cn: string
  owner: string
  pubtime: number
  view: number
  favorite: number
  coin: number
  like: number
  share: number
  /** 较上次快照增量 */
  dv: number
  df: number
  dc: number
  dl: number
  ds: number
  /** 涨速综合分 */
  dscore: number
  /** 日均播放增量 */
  day_view: number
  window_days: number
}

export interface MomentumSummary {
  net_view: number
  net_favorite: number
  net_coin: number
  net_like: number
  net_share: number
  tracked: number
  window_days: number
}

export interface MomentumResponse {
  has_baseline: boolean
  window_days: number
  total: number
  items: MomentumItem[]
  summary: MomentumSummary
}

export interface HotStatus {
  running: boolean
  scope: string | null
  total: number
  done: number
  ok: number
  deleted: number
  failed: number
  started_at: number | null
  finished_at: number | null
  message: string | null
  cache_count: number
  ok_count: number
  last_fetch: number | null
}

/** 实时热度库全库聚合概览（不受搜索/标签筛选影响），用于顶部 KPI 卡 */
export interface HotSummary {
  total: number
  view_sum: number
  favorite_sum: number
  coin_sum: number
  like_sum: number
  share_sum: number
  myth: number
  legend: number
  hall: number
}

export interface Snapshot {
  id: number
  created_at: number
  scope: string
  count: number
}

export interface ReentrySegment {
  start: string
  end: string
  weeks: number
  best_rank: number
}

export interface ReentryTrack {
  bvid: string
  title: string
  segment_count: number
  latest_issue: string
  total_weeks: number
  segments: ReentrySegment[]
}

export interface ScoreEntry {
  issue: string
  issue_date: string
  rank: number | null
  official_score: number | null
  view: number | null
  favorite: number | null
  coin: number | null
  like: number | null
  pubtime: number | null
  /** 时间修正系数 t（新曲加成 / 老曲恒 1） */
  t: number
  /** 是否因缺失投稿时间而假定了 t */
  t_assumed: boolean
  /** 该期所用公式代：old(<54) / new(≥54) */
  formula_version: "old" | "new"
  /** 播放构成是否为由官方分反推（官方表未收录播放量字段时为 true） */
  view_implied: boolean
  /** 因子构成参考（累计指标 × 权重 × t），非官方得分复算 */
  comp_view: number | null
  comp_favorite: number | null
  comp_like: number | null
  comp_coin: number | null
}

export interface ScoreBreakdown {
  bvid: string
  board_type: string
  formula_version: "old" | "new"
  weights: Record<string, number>
  entries: ScoreEntry[]
}

export interface ThinkCandidate {
  bvid: string
  title: string
  title_cn: string
  owner: string
  matched: "bvid" | "title" | "cache"
}

export interface SongThink {
  bvid: string
  aid: number | null
  title: string
  title_cn: string
  owner: string
  owner_mid: number | null
  pubtime: number
  duration: number
  desc: string
  cover: string
  category: string
  view: number
  danmaku: number
  reply: number
  favorite: number
  coin: number
  share: number
  like: number
  fetched_at: number
}
export interface AiTurn {
  role: "user" | "assistant"
  content: string
  /** 仅 assistant 轮：当时的模型思考过程（思维链），用于永久内联显示在回复气泡顶部 */
  reasoning?: string
  /** 仅 assistant 轮：该回复是否来自缓存命中（前端展示「⚡命中缓存」徽标） */
  cached?: boolean
}

// ---- 网易云搜索（backend/app/api/netease.py） ----
export type NeteaseKind = "song" | "artist" | "album" | "playlist"

/** 搜索结果统一卡片结构（backend search 返回 items[]） */
export interface NeteaseItem {
  kind: NeteaseKind
  id: number
  name: string
  sub: string
  pic?: string | null
  duration_ms?: number | null
  pop?: number | null
  alias?: string[]
  album?: string
  album_id?: number
  mv_id?: number
  // artist
  music_size?: number
  album_size?: number
  // album
  artist?: string
  size?: number
  publish_time?: number
  // playlist
  creator?: string
  track_count?: number
  play_count?: number
}

export interface NeteaseSearchResult {
  keyword: string
  type: string
  count: number
  items: NeteaseItem[]
}

/** 单曲详情（backend get_song_detail 返回，仅 song 可用） */
export interface NeteaseDetail {
  id: number
  name: string
  alias?: string[]
  artists?: string[]
  album?: string
  album_pic?: string | null
  duration_ms?: number | null
  pop?: number | null
  publish_time?: number | null
  mv_id?: number | null
  comment_count?: number | null
  play_count?: number | null
}

/** 标准曲目（专辑/歌单/歌手热门曲通用，backend _normalize_song 返回） */
export interface NeteaseTrack {
  id: number
  name: string
  alias?: string[]
  artists?: string[]
  album?: string | null
  album_id?: number | null
  pic?: string | null
  duration_ms?: number | null
  pop?: number | null
  mv_id?: number | null
}

/** 歌手详情（backend get_artist_detail 返回） */
export interface NeteaseArtistDetail {
  id: number
  name: string
  alias?: string[]
  pic?: string | null
  brief_desc?: string
  music_size?: number | null
  album_size?: number | null
  mv_size?: number | null
  hot_songs?: NeteaseTrack[]
}

/** 专辑详情（backend get_album_detail 返回） */
export interface NeteaseAlbumDetail {
  id: number
  name: string
  artist?: string | null
  pic?: string | null
  publish_time?: number | null
  company?: string | null
  description?: string
  size?: number | null
  songs?: NeteaseTrack[]
}

/** 歌单详情（backend get_playlist_detail 返回） */
export interface NeteasePlaylistDetail {
  id: number
  name: string
  creator?: string
  description?: string
  tags?: string[]
  pic?: string | null
  play_count?: number | null
  track_count?: number | null
  subscribed_count?: number | null
  comment_count?: number | null
  tracks?: NeteaseTrack[]
}

/** 歌词逐行（backend get_lyric 返回，已按时间戳对齐原文+翻译） */
export interface NeteaseLyricLine {
  t: number
  text: string
  tl?: string | null
}

/** 歌词（backend get_lyric 返回） */
export interface NeteaseLyric {
  id: number
  raw_lrc?: string
  raw_tlyric?: string
  lines?: NeteaseLyricLine[]
  has_translation?: boolean
}
