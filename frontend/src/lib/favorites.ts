import { create } from "zustand"

export interface FavoriteSong {
  bvid: string
  title: string
  title_cn?: string | null
  added_at?: number
  note?: string
}
const KEY = "hb-favorites"

function load(): FavoriteSong[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as FavoriteSong[]
  } catch {
    /* ignore */
  }
  return []
}
function save(items: FavoriteSong[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

interface FavStore {
  items: FavoriteSong[]
  toggle: (s: FavoriteSong) => void
  remove: (bvid: string) => void
  setNote: (bvid: string, note: string) => void
}

export const useFavorites = create<FavStore>((set) => ({
  items: load(),
  toggle: (s) =>
    set((st) => {
      const exists = st.items.some((x) => x.bvid === s.bvid)
      const items = exists
        ? st.items.filter((x) => x.bvid !== s.bvid)
        : [{ ...s, added_at: Date.now() }, ...st.items]
      save(items)
      return { items }
    }),
  remove: (bvid) =>
    set((st) => {
      const items = st.items.filter((x) => x.bvid !== bvid)
      save(items)
      return { items }
    }),
  setNote: (bvid, note) =>
    set((st) => {
      const items = st.items.map((x) =>
        x.bvid === bvid ? { ...x, note } : x
      )
      save(items)
      return { items }
    }),
}))
