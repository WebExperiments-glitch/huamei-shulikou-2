/** 网易云音乐领域 API（/api/netease*）。 */
import { request } from "./request"
import type {
  NeteaseAlbumDetail,
  NeteaseArtistDetail,
  NeteaseDetail,
  NeteaseLyric,
  NeteasePlaylistDetail,
  NeteaseSearchResult,
} from "../types"

const JSON_HEADERS = { "Content-Type": "application/json" } as const

export const neteaseApi = {
  neteaseSearch: (keyword: string, limit = 20, type = "song") =>
    request<NeteaseSearchResult>("/api/netease/search", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ keyword, limit, type }),
    }),
  neteaseSong: (id: number | string) =>
    request<NeteaseDetail>("/api/netease/song", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id }),
    }),
  neteaseArtist: (id: number | string) =>
    request<NeteaseArtistDetail>("/api/netease/artist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id }),
    }),
  neteaseAlbum: (id: number | string) =>
    request<NeteaseAlbumDetail>("/api/netease/album", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id }),
    }),
  neteasePlaylist: (id: number | string) =>
    request<NeteasePlaylistDetail>("/api/netease/playlist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id }),
    }),
  neteaseLyric: (id: number | string) =>
    request<NeteaseLyric>("/api/netease/lyric", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id }),
    }),
  neteaseUrl: (id: number | string) =>
    request<{ id: number; url: string | null; br: number; size: number; code: number; md5?: string }>(
      "/api/netease/url",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ id }),
      },
    ),
  neteaseCookie: () => request<{ configured: boolean; music_u: string; hint: string }>("/api/netease/cookie"),
  neteaseSetCookie: (music_u: string) =>
    request<{ configured: boolean; music_u: string; hint: string }>("/api/netease/cookie", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ music_u }),
    }),
}
