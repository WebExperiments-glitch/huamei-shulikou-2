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
  /** 该期所用公式代：old(<54) / new(≥54)，由后端 issues 接口返回 */
  formula_version?: "old" | "new" | null
}

export interface RankEntry {
  rank: number
  bvid: string
  title: string
  title_cn?: string | null
  view: number
  favorite: number
  coin: number
  like: number
  share: number
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
  /** 旗下歌曲在官方榜累计上榜期数（跨周榜/传说榜/年榜） */
  board_count?: number | null
  /** 旗下歌曲的历史最高排名（最小 rank） */
  best_rank?: number | null
  /** 综合战力分（透明加权：总播放百万计×1 + 上榜期数×3 + 传说曲×200 + 神话曲×1000） */
  power?: number | null
}

export interface FormulaCompareFactor {
  comp_view: number | null
  comp_favorite: number | null
  comp_like: number | null
  comp_coin: number | null
  view_implied: boolean
  total: number
}

export interface FormulaCompareEntry {
  issue: string
  rank: number | null
  official_score: number | null
  view: number | null
  favorite: number | null
  coin: number | null
  like: number | null
  pubtime: number | null
  official_version: "old" | "new"
  t_new: number
  t_old: number
  old: FormulaCompareFactor
  new: FormulaCompareFactor
}

export interface FormulaCompare {
  bvid: string
  board_type: string
  entries: FormulaCompareEntry[]
}

/** 公式实验室极简模式：粘贴 BV/链接后一键算分的结果聚合。 */
export interface AutoScoreResult {
  bvid: string
  board_type: string
  /** 是否在术力口周榜上过榜（有周榜分数可算） */
  on_board?: boolean
  song: Song
  /** 最新一期（entries 末项）的拆解；未上榜则为 null */
  latest: FormulaCompareEntry | null
  entries: FormulaCompareEntry[]
  weights: Record<string, number>
  /** 未上榜歌曲实时回源 B站 的当前统计（可能为空） */
  live?: BiliLiveStat | null
}

/** 在 B站 搜索视频返回的候选（公式实验室搜歌名定位 BV 用） */
export interface BiliSearchItem {
  bvid: string
  title: string
  author: string
  play: number
  pubdate: number
}

/** auto-score 对未上榜歌曲实时回源 B站 取到的当前统计 */
export interface BiliLiveStat {
  title: string | null
  author: string | null
  pubtime: number
  view: number
  favorite: number
  like: number
  coin: number
  share: number
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

/* ---------------- 下期冲榜预测（backend services/predict.py） ---------------- */

/** 历史某期的入榜线（末位得分） */
export interface CutlineEntry {
  issue: string
  date: string
  entries: number
  cut: number
  top: number
}

export interface CutlineStat {
  history: CutlineEntry[]
  median: number | null
  mean: number | null
  min: number | null
  max: number | null
  board_size: number
  lookback: number
}

/** 单曲预测条目 */
export interface PredictItem {
  bvid: string
  title: string
  title_cn?: string | null
  owner?: string | null
  pubtime: number
  age_days: number
  view: number
  favorite: number
  coin: number
  like: number
  /** 观测窗口内的实际增量 */
  dv: number
  df: number
  dc: number
  dl: number
  rate_view: number
  decay: number
  /** 外推 7 日的预测增量 */
  p7v: number
  p7f: number
  p7c: number
  p7l: number
  t: number
  pred_score: number
  pred_rank: number
  prob: number
  margin: number | null
  margin_pct: number | null
  on_last_board: boolean
  last_rank?: number | null
}

export interface PredictSummary {
  generated_at: number
  period_start: number
  window_days: number
  baseline_snapshot: { id: number; created_at: number }
  latest_snapshot: { id: number; created_at: number }
  tracked: number
  board_size: number
  cut_median: number
  cut_min: number | null
  cut_max: number | null
  expected_in: number
  newcomers_in_top: number
  decay_k: number
  formula: string
  low_confidence: boolean
}

export interface PredictResult {
  ok: boolean
  reason: string | null
  cutline: CutlineStat
  summary: PredictSummary | null
  total?: number
  items: PredictItem[]
}
