/** Shared OTAMA types (client + server) */

export type MetaKind = 'movie' | 'tv' | 'anime'

export interface MetaItem {
  refId: string // imdb id (cinemeta) or `tvmaze:123` / `tmdb:550`
  kind: MetaKind
  title: string
  year?: number
  poster?: string
  backdrop?: string
  rating?: number
  genres?: string[]
  summary?: string
  runtime?: number
  imdbId?: string
  tvmazeId?: number
  tmdbId?: number
  provider: 'cinemeta' | 'tvmaze' | 'tmdb' | 'yts'
}

export interface TorrentOption {
  hash: string
  title: string
  quality?: string
  /** detected video codec — 'hevc' releases usually cannot play in browsers */
  codec?: 'h264' | 'hevc' | string
  size?: string
  sizeBytes?: number
  seeds?: number
  leechers?: number
  provider: 'tpb' | 'eztv' | 'nyaa' | 'yts' | '1337x' | 'torrends' | 'torrentio' | 'solidtorrents'
  /** magnet uri or raw info hash for the engine */
  source: string
  season?: number
  episode?: number
  date?: string
  status?: 'vip' | 'trusted' | string
  /** authoritative video-file index (Torrentio fileIdx) — preferred over auto-pick */
  fileIndex?: number
  /** origin site of an aggregated torrent (e.g. 'ThePirateBay', 'TorrentGalaxy') */
  sourceSite?: string
  /** web page of this torrent (used for "open on site" fallbacks) */
  detailUrl?: string
}

export interface EpisodeInfo {
  season: number
  episode: number
  title?: string
  overview?: string
  airDate?: string
  thumbnail?: string
}

export interface SeriesDetail {
  item: MetaItem
  seasons: { season: number; episodes: EpisodeInfo[] }[]
}

export interface MovieDetail {
  item: MetaItem
  torrents: TorrentOption[]
}

export interface TpbItem {
  id: string
  name: string
  hash: string
  size: string
  sizeBytes: number
  seeds: number
  leechers: number
  category: string
  categoryCode: string
  added: string
  username: string
  status?: string
  imdb?: string
  quality?: string
}

export interface EngineFile {
  index: number
  name: string
  length: number
  isVideo: boolean
}

export interface EngineTorrent {
  infoHash: string
  title: string
  poster: string | null
  refId: string | null
  kind: string | null
  name: string | null
  length: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  numPeers: number
  ready: boolean
  done: boolean
  timeRemaining: number | null
  files: EngineFile[]
  selectedFile: number | null
  activeStreams: number
  magnet: string
  addedAt: number
  lastAccessed: number
}

export interface PlayerPayload {
  infoHash: string
  fileIndex: number
  title: string
  poster?: string | null
  refId?: string
  kind?: string
  /** quality label of the chosen torrent */
  quality?: string
  fileName?: string
  /** season/episode for series — lets the player refetch episode alternatives */
  season?: number
  episode?: number
  /** other torrent options for the same title — enables in-player switching */
  alternatives?: TorrentOption[]
}

export interface HistoryEntry {
  refId: string
  title: string
  poster?: string | null
  kind: string
  infoHash: string
  fileIndex: number
  position: number
  duration?: number | null
  updatedAt: string
}
