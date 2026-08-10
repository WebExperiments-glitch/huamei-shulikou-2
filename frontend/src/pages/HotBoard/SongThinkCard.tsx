import { Link } from "react-router-dom"
import { Eye, ThumbsUp, Coins, Star, MessageCircle, Subtitles } from "lucide-react"
import type { SongThink } from "../../lib/types"
import { fmt, fmtDate } from "../../components/ui"

export function SongThinkCard({ d }: { d: SongThink }) {
  const ratios = [
    { label: "点赞率", v: d.view ? d.like / d.view : 0 },
    { label: "投币率", v: d.view ? d.coin / d.view : 0 },
    { label: "收藏率", v: d.view ? d.favorite / d.view : 0 },
    { label: "评论率", v: d.view ? d.reply / d.view : 0 },
    { label: "弹幕率", v: d.view ? d.danmaku / d.view : 0 },
  ]
  const maxR = Math.max(...ratios.map((r) => r.v), 1e-9)
  const metrics = [
    { icon: Eye, label: "浏览量", v: d.view, color: "var(--accent)" },
    { icon: ThumbsUp, label: "点赞数", v: d.like, color: "var(--green)" },
    { icon: Coins, label: "投币数", v: d.coin, color: "var(--pink)" },
    { icon: Star, label: "收藏数", v: d.favorite, color: "var(--gold)" },
    { icon: MessageCircle, label: "评论条数", v: d.reply, color: "var(--myth)" },
    { icon: Subtitles, label: "弹幕条数", v: d.danmaku, color: "var(--sky)" },
  ]
  const mm = Math.floor(d.duration / 60)
  const ss = String(d.duration % 60).padStart(2, "0")
  return (
    <div className="think-card">
      <div className="think-head">
        {d.cover && (
          <img
            className="think-cover"
            src={d.cover.startsWith("http") ? d.cover : `https:${d.cover}`}
            alt=""
          />
        )}
        <div className="think-titlewrap">
          <div className="think-title">{d.title || d.title_cn || d.bvid}</div>
          {d.title_cn && d.title_cn !== d.title && <div className="think-cn">中文名：{d.title_cn}</div>}
          <div className="think-meta">
            <span>UP：<b>{d.owner || "—"}</b></span>
            <span>分区：{d.category || "—"}</span>
            <span>投稿：{fmtDate(d.pubtime)}</span>
            <span>时长：{mm}:{ss}</span>
          </div>
          <div className="think-links">
            <a href={`https://www.bilibili.com/video/${d.bvid}`} target="_blank" rel="noreferrer" className="ext-link">B站原视频 ↗</a>
            <Link to={`/song/${d.bvid}`} className="ext-link">单曲详情页 ↗</Link>
          </div>
        </div>
      </div>

      <div className="think-metrics">
        {metrics.map((m) => (
          <div className="metric-tile" key={m.label}>
            <m.icon size={16} style={{ color: m.color }} />
            <div className="metric-val" style={{ color: m.color }}>{fmt(m.v)}</div>
            <div className="metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="think-section-title">互动健康度（占浏览量比例）</div>
      <div className="ratio-list">
        {ratios.map((r) => (
          <div className="ratio-row" key={r.label}>
            <span className="ratio-label">{r.label}</span>
            <div className="ratio-track"><div className="ratio-fill" style={{ width: `${(r.v / maxR) * 100}%` }} /></div>
            <span className="ratio-pct">{(r.v * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>

      {d.desc && (
        <div className="think-desc">
          <div className="think-section-title">视频简介</div>
          <div className="think-desc-body">{d.desc}</div>
        </div>
      )}

      <div className="think-foot">数据实时抓取自 B站 · 更新于 {fmtDate(d.fetched_at)}</div>
    </div>
  )
}
