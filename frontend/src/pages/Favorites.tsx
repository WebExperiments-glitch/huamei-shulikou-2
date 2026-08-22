import { Link } from "react-router-dom"
import { Heart } from "lucide-react"
import { useFavorites } from "../lib/favorites"
import { Empty } from "../components/ui"
import { Reveal } from "../lib/motion"
import { PageHeader } from "../components/PageHeader"

export default function Favorites() {
  const items = useFavorites((s) => s.items)
  const remove = useFavorites((s) => s.remove)

  return (
    <>
      <Reveal>
      <PageHeader crumb="我的 · 收藏" title="收藏的歌曲" extra={`${items.length} 首`} />
      </Reveal>

      {items.length === 0 ? (
        <Reveal delay={0.06}>
        <div className="card">
          <Empty label="还没有收藏的歌曲，去单曲详情页点 ♥ 收藏吧" />
        </div>
        </Reveal>
      ) : (
        <Reveal delay={0.06}>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="rank-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>歌曲</th>
                <th style={{ width: 120 }}>收藏于</th>
                <th style={{ width: 80, textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.bvid}>
                  <td className="rank-no">{i + 1}</td>
                  <td className="song-cell">
                    <Link to={`/song/${s.bvid}`}>
                      <span className="t">{s.title}</span>
                      {s.title_cn && <span className="t-cn">{s.title_cn}</span>}
                    </Link>
                  </td>
                  <td className="num">{s.added_at ? new Date(s.added_at).toLocaleDateString() : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="chip" onClick={() => remove(s.bvid)} title="取消收藏">
                      <Heart size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Reveal>
      )}
    </>
  )
}
