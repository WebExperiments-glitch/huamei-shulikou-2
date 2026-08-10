import { ArtistBoard } from "./Artists"

export default function Vocalists() {
  return (
    <ArtistBoard
      title="歌姬榜"
      crumb="数据 · 歌姬"
      kind="vocalist"
      drillKey="vocalist"
    />
  )
}
