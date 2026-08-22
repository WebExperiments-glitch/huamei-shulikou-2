/**
 * 数据导出中心的数据集结构定义。
 *
 * 独立成纯模块的原因：主线程（Export.tsx 页面）与后台线程
 * （export.worker.ts）都要用到同一份列定义与取数逻辑，
 * 这里作为单一数据源，避免两边各自复制导致口径漂移。
 * 不依赖 DOM，可在 Worker 中安全 import。
 */

import { fmtDate, fmtTime, joinNames, type ExportColumn } from "./csv"

export type DatasetKey =
  | "board"
  | "library"
  | "artists"
  | "vocalists"
  | "hot"
  | "momentum"
  | "monthly"
  | "daily"
  | "history"

const TIER_LABEL: Record<string, string> = { hall: "殿堂曲", legend: "传说曲", myth: "神话曲" }

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null)

export const BOARD_LABEL: Record<string, string> = { weekly: "周榜", legend: "传说榜", annual: "年榜" }

const COLS_BOARD: ExportColumn<any>[] = [
  { key: "rank", label: "排名", get: (r) => r.rank },
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title },
  { key: "title_cn", label: "中文标题", get: (r) => r.title_cn ?? "" },
  { key: "producers", label: "P主", get: (r) => joinNames(r.producers) },
  { key: "vocalists", label: "歌姬", get: (r) => joinNames(r.vocalists) },
  { key: "score", label: "得分", get: (r) => num(r.score) },
  { key: "view", label: "播放", get: (r) => num(r.view) },
  { key: "favorite", label: "收藏", get: (r) => num(r.favorite) },
  { key: "coin", label: "硬币", get: (r) => num(r.coin) },
  { key: "like", label: "点赞", get: (r) => num(r.like) },
  { key: "share", label: "分享", get: (r) => num(r.share) },
  { key: "last_rank", label: "上期排名", get: (r) => r.last_rank ?? "" },
  { key: "peak_rank", label: "最高排名", get: (r) => r.peak_rank ?? "" },
  { key: "weeks_on_board", label: "在榜期数", get: (r) => r.weeks_on_board ?? "" },
  { key: "rate", label: "变化率", get: (r) => r.rate ?? "" },
  { key: "pubtime", label: "投稿时间", get: (r) => fmtTime(r.pubtime) },
  { key: "url", label: "视频链接", get: (r) => (r.bvid ? `https://www.bilibili.com/video/${r.bvid}` : "") },
]

const COLS_LIBRARY: ExportColumn<any>[] = [
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title },
  { key: "title_cn", label: "中文标题", get: (r) => r.title_cn ?? "" },
  { key: "producers", label: "P主", get: (r) => joinNames(r.producers) },
  { key: "vocalists", label: "歌姬", get: (r) => joinNames(r.vocalists) },
  { key: "tier", label: "里程碑", get: (r) => TIER_LABEL[r.tier] ?? "" },
  { key: "view", label: "播放", get: (r) => num(r.view) },
  { key: "favorite", label: "收藏", get: (r) => num(r.favorite) },
  { key: "coin", label: "硬币", get: (r) => num(r.coin) },
  { key: "like", label: "点赞", get: (r) => num(r.like) },
  { key: "share", label: "分享", get: (r) => num(r.share) },
  { key: "peak_score", label: "最高得分", get: (r) => num(r.peak_score) },
  { key: "best_rank", label: "最高排名", get: (r) => r.best_rank ?? "" },
  { key: "weeks_on_board", label: "累计上榜期数", get: (r) => r.weeks_on_board ?? "" },
  { key: "boards", label: "上榜榜种", get: (r) => (Array.isArray(r.boards) ? r.boards.join("/") : "") },
  { key: "pubtime", label: "投稿时间", get: (r) => fmtTime(r.pubtime) },
  { key: "first_recorded_at", label: "首次收录", get: (r) => fmtDate(r.first_recorded_at) },
  { key: "url", label: "视频链接", get: (r) => (r.bvid ? `https://www.bilibili.com/video/${r.bvid}` : "") },
]

const COLS_ARTIST: ExportColumn<any>[] = [
  { key: "name", label: "名字", get: (r) => r.name },
  { key: "songs", label: "收录歌曲", get: (r) => num(r.songs) },
  { key: "total_view", label: "总播放", get: (r) => num(r.total_view) },
  { key: "legend", label: "传说曲", get: (r) => num(r.legend) ?? 0 },
  { key: "myth", label: "神话曲", get: (r) => num(r.myth) ?? 0 },
  { key: "board_count", label: "上榜期数", get: (r) => num(r.board_count) ?? 0 },
  { key: "best_rank", label: "最高排名", get: (r) => r.best_rank ?? "" },
  { key: "power", label: "战力分", get: (r) => num(r.power) ?? 0 },
  { key: "best_title", label: "代表曲", get: (r) => r.best_title ?? "" },
  { key: "best_view", label: "代表曲播放", get: (r) => num(r.best_view) },
  { key: "best_bvid", label: "代表曲BV号", get: (r) => r.best_bvid ?? "" },
  { key: "url", label: "百科链接", get: (r) => r.url ?? "" },
]

const COLS_HOT: ExportColumn<any>[] = [
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title },
  { key: "title_cn", label: "中文标题", get: (r) => r.title_cn ?? "" },
  { key: "owner", label: "UP主", get: (r) => r.owner ?? "" },
  { key: "score", label: "综合分", get: (r) => num(r.score) },
  { key: "view", label: "播放", get: (r) => num(r.view) },
  { key: "favorite", label: "收藏", get: (r) => num(r.favorite) },
  { key: "coin", label: "硬币", get: (r) => num(r.coin) },
  { key: "like", label: "点赞", get: (r) => num(r.like) },
  { key: "share", label: "分享", get: (r) => num(r.share) },
  { key: "dv", label: "播放增量", get: (r) => r.dv ?? "" },
  { key: "df", label: "收藏增量", get: (r) => r.df ?? "" },
  { key: "dc", label: "硬币增量", get: (r) => r.dc ?? "" },
  { key: "dl", label: "点赞增量", get: (r) => r.dl ?? "" },
  { key: "dscore", label: "涨速分", get: (r) => r.dscore ?? "" },
  { key: "window_days", label: "窗口天数", get: (r) => r.window_days ?? "" },
  { key: "pubtime", label: "投稿时间", get: (r) => fmtTime(r.pubtime) },
  { key: "fetch_time", label: "抓取时间", get: (r) => fmtTime(r.fetch_time) },
]

const COLS_MOMENTUM: ExportColumn<any>[] = [
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title },
  { key: "title_cn", label: "中文标题", get: (r) => r.title_cn ?? "" },
  { key: "owner", label: "UP主", get: (r) => r.owner ?? "" },
  { key: "dv", label: "播放增量", get: (r) => num(r.dv) },
  { key: "df", label: "收藏增量", get: (r) => num(r.df) },
  { key: "dc", label: "硬币增量", get: (r) => num(r.dc) },
  { key: "dl", label: "点赞增量", get: (r) => num(r.dl) },
  { key: "ds", label: "分享增量", get: (r) => num(r.ds) },
  { key: "dscore", label: "涨速综合分", get: (r) => num(r.dscore) },
  { key: "day_view", label: "日均播放增量", get: (r) => num(r.day_view) },
  { key: "window_days", label: "窗口天数", get: (r) => num(r.window_days) },
  { key: "view", label: "当前播放", get: (r) => num(r.view) },
  { key: "pubtime", label: "投稿时间", get: (r) => fmtTime(r.pubtime) },
]

const COLS_MONTHLY: ExportColumn<any>[] = [
  { key: "rank", label: "排名", get: (r) => r.rank },
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "title", label: "标题", get: (r) => r.title },
  { key: "sum_score", label: "累计得分", get: (r) => num(r.sum_score) },
  { key: "weeks_on_board", label: "在榜周数", get: (r) => num(r.weeks_on_board) },
  { key: "best_rank", label: "最高周排名", get: (r) => num(r.best_rank) },
  { key: "url", label: "视频链接", get: (r) => (r.bvid ? `https://www.bilibili.com/video/${r.bvid}` : "") },
]

const COLS_DAILY: ExportColumn<any>[] = [
  { key: "rank", label: "排名", get: (r) => r.rank },
  { key: "bvid", label: "BV号", get: (r) => r.bvid },
  { key: "name", label: "标题", get: (r) => r.name },
  { key: "score", label: "得分", get: (r) => num(r.score) },
  { key: "view", label: "播放", get: (r) => num(r.view) },
  { key: "favorite", label: "收藏", get: (r) => num(r.favorite) },
  { key: "coin", label: "硬币", get: (r) => num(r.coin) },
  { key: "like", label: "点赞", get: (r) => num(r.like) },
  { key: "share", label: "分享", get: (r) => num(r.share) },
]

const COLS_HISTORY: ExportColumn<any>[] = [
  { key: "board", label: "榜种", get: (r) => r.__board },
  { key: "issue", label: "期号", get: (r) => r.issue ?? "" },
  { key: "issue_date", label: "统计日期", get: (r) => r.issue_date ?? "" },
  { key: "rank", label: "排名", get: (r) => r.rank },
  { key: "score", label: "得分", get: (r) => num(r.score) },
  { key: "view", label: "播放", get: (r) => num(r.view) },
  { key: "favorite", label: "收藏", get: (r) => num(r.favorite) },
  { key: "coin", label: "硬币", get: (r) => num(r.coin) },
  { key: "like", label: "点赞", get: (r) => num(r.like) },
  { key: "share", label: "分享", get: (r) => num(r.share) },
  { key: "rate", label: "变化率", get: (r) => r.rate ?? "" },
]

export const COLS: Record<DatasetKey, ExportColumn<any>[]> = {
  board: COLS_BOARD,
  library: COLS_LIBRARY,
  artists: COLS_ARTIST,
  vocalists: COLS_ARTIST,
  hot: COLS_HOT,
  momentum: COLS_MOMENTUM,
  monthly: COLS_MONTHLY,
  daily: COLS_DAILY,
  history: COLS_HISTORY,
}
