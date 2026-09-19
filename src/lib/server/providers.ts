/**
 * OTAMA provider layer.
 *
 * Aggregates public, keyless APIs:
 *  - Cinemeta  (Stremio's open metadata service)  -> movies / series posters, backdrops, descriptions
 *  - TVMaze    (open TV database)                 -> series browse, seasons & episodes
 *  - Apibay    (ThePirateBay official API)        -> torrent search incl. imdb-keyed lookup
 *  - EZTV      (TV torrent api, best-effort)      -> episode torrents w/ automatic TPB fallback
 *  - Nyaa      (anime tracker, RSS)               -> anime torrents
 *  - YTS       (YIFY movies, JSON API)            -> movie catalog + hash-ready torrents
 *  - 1337x     (HTML scraper)                     -> general torrent search
 *  - Torrends  (site directory + live proxies)    -> mirror resolution + 700+ site links
 *
 * Every provider degrades gracefully: if one is unavailable the callers fall
 * back to the remaining sources so the app keeps working.
 */
import type { MetaItem, MetaKind, TorrentOption, EpisodeInfo, TpbItem } from '@/lib/types'

export const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const CINE = 'https://v3-cinemeta.strem.io'
const TVMAZE = 'https://api.tvmaze.com'
const APIBAY = 'https://apibay.org'
const EZTV = 'https://eztvx.to'
const NYAA = 'https://nyaa.si'

/* ------------------------------ tiny cache ------------------------------ */

interface CacheEntry {
  ts: number
  value: unknown
}
const globalCache = globalThis as unknown as { __otamaCache?: Map<string, CacheEntry> }
const cache: Map<string, CacheEntry> = globalCache.__otamaCache ?? new Map()
globalCache.__otamaCache = cache

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return hit.value as T
  const value = await fn()
  cache.set(key, { ts: Date.now(), value })
  return value
}

/* ------------------------------ fetch helpers ------------------------------ */

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, Accept: '*/*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const text = await fetchText(url, timeoutMs)
  if (text.trimStart().startsWith('<')) throw new Error(`Got HTML instead of JSON from ${url}`)
  return JSON.parse(text) as T
}

export class ProviderError extends Error {}

/**
 * Some trackers (apibay = ThePirateBay API, EZTV) sit behind Cloudflare and
 * fingerprint TLS: Node's fetch/https stacks get 403-challenged while curl
 * passes. Use curl as the primary transport for those hosts with a fetch
 * fallback for environments without curl.
 */
export async function cfGetText(url: string, timeoutMs = 12_000): Promise<string> {
  const maxTime = Math.ceil(timeoutMs / 1000)
  try {
    const { execFile } = await import('node:child_process')
    const out = await new Promise<string>((resolve, reject) => {
      execFile(
        'curl',
        ['-s', '--compressed', '--max-time', String(maxTime), '-A', UA, '-H', 'Accept: */*', url],
        { timeout: (maxTime + 2) * 1000, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout)),
      )
    })
    if (out) return out
  } catch { /* curl missing or failed -> fall back to fetch */ }
  return fetchText(url, timeoutMs)
}

async function cfGetJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const text = await cfGetText(url, timeoutMs)
  if (text.trimStart().startsWith('<')) throw new ProviderError(`Blocked by Cloudflare: ${new URL(url).host}`)
  return JSON.parse(text) as T
}

/* ------------------------------ cinemeta ------------------------------ */

interface CineMetaRaw {
  imdb_id?: string
  type?: string
  name?: string
  year?: string
  poster?: string
  background?: string
  imdbRating?: string
  genres?: string[]
  description?: string
  runtime?: string
  released?: string
  cast?: string[]
  awards?: string
  country?: string
  videos?: { id: string; season?: number; episode?: number; name?: string; title?: string; released?: string; overview?: string; thumbnail?: string }[]
}

export function normalizeCine(raw: CineMetaRaw, kind: MetaKind): MetaItem {
  const year = raw.year ? parseInt(String(raw.year).slice(0, 4), 10) : undefined
  return {
    refId: raw.imdb_id || raw.name || Math.random().toString(36).slice(2),
    kind,
    title: raw.name || 'Unknown',
    year: year && !isNaN(year) ? year : undefined,
    poster: raw.poster && raw.poster !== 'null' ? raw.poster : undefined,
    backdrop: raw.background && raw.background !== 'null' ? raw.background : undefined,
    rating: raw.imdbRating ? parseFloat(raw.imdbRating) : undefined,
    genres: raw.genres || [],
    summary: raw.description || undefined,
    runtime: raw.runtime ? parseInt(raw.runtime, 10) || undefined : undefined,
    imdbId: raw.imdb_id,
    provider: 'cinemeta',
  }
}

/**
 * Cinemeta catalog browse/search.
 * sort: 'top' | 'imdbRating' | 'year'
 */
export async function cineCatalog(
  type: 'movie' | 'series',
  opts: { genre?: string; skip?: number; search?: string; sort?: string } = {},
): Promise<MetaItem[]> {
  const kind: MetaKind = type === 'movie' ? 'movie' : 'tv'
  const sort = opts.sort && ['top', 'imdbRating', 'year'].includes(opts.sort) ? opts.sort : 'top'
  const extras: string[] = []
  if (opts.search) extras.push(`search=${encodeURIComponent(opts.search)}`)
  if (opts.genre) extras.push(`genre=${encodeURIComponent(opts.genre)}`)
  if (opts.skip) extras.push(`skip=${opts.skip}`)
  const suffix = extras.length ? `/${extras.join('&')}` : ''
  const url = `${CINE}/catalog/${type}/${sort}${suffix}.json`
  const data = await fetchJson<{ metas?: CineMetaRaw[] }>(url, 15_000)
  return (data.metas || []).map((m) => normalizeCine(m, kind))
}

export async function cineMeta(type: 'movie' | 'series', imdbId: string): Promise<MetaItem & { videos?: CineMetaRaw['videos']; awards?: string; cast?: string[]; country?: string }> {
  const data = await fetchJson<{ meta?: CineMetaRaw }>(`${CINE}/meta/${type}/${imdbId}.json`, 15_000)
  if (!data.meta) throw new ProviderError('Cinemeta meta not found')
  const kind: MetaKind = type === 'movie' ? 'movie' : 'tv'
  return { ...normalizeCine(data.meta, kind), videos: data.meta.videos, awards: data.meta.awards, cast: data.meta.cast, country: data.meta.country }
}

/* ------------------------------ apibay (ThePirateBay) ------------------------------ */

interface ApibayRow {
  id?: string
  name?: string
  info_hash?: string
  leechers?: string
  seeders?: string
  size?: string
  num_files?: string
  username?: string
  added?: string
  status?: string
  category?: string
  imdb?: string
}

const TPB_CATEGORIES: Record<string, string> = {
  '201': 'Movies',
  '202': 'Movies DVDR',
  '203': 'Music videos',
  '205': 'TV shows',
  '207': 'HD Movies',
  '208': 'HD TV shows',
  '209': '3D Movies',
  '299': 'Video (other)',
}

export function humanSize(bytes?: number | string): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (!n || isNaN(n)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

const QUALITY_RE = /\b(2160p|1440p|1080p|1080i|720p|576p|480p|4k|uhd|web[ .-]?dl|web[ .-]?rip|brrip|bluray|bdrip|hdrip|dvdrip|hdtv|cam|ts)\b/i

export function detectQuality(name: string): string | undefined {
  const m = QUALITY_RE.exec(name)
  if (!m) return undefined
  const q = m[1].toUpperCase()
  if (q === '4K' || q === 'UHD') return '2160p'
  return q.replace(/\s/g, '')
}

/**
 * Codec detection from a release name. HEVC/x265 releases typically CANNOT be
 * decoded by browsers (Chrome only plays H.265 with hardware support), which
 * is the #1 cause of the "stuck on buffering" report — so OTAMA surfaces and
 * deprioritises them.
 */
export function detectCodecFromName(name: string): 'h264' | 'hevc' | undefined {
  const s = (name || '').toLowerCase()
  if (/\b(x\s?265|h\.?265|hevc)\b/.test(s)) return 'hevc'
  if (/\b(x\s?264|h\.?264|avc)\b/.test(s)) return 'h264'
  return undefined
}

/** Browser playability of a release name — 'blocked' files spin forever. */
export function playabilityRank(name: string, codec?: string): 0 | 1 | 2 {
  const c = (codec as 'h264' | 'hevc' | undefined) || detectCodecFromName(name)
  if (c === 'hevc') return 2
  const ext = (name.match(/\.(mp4|m4v|mkv|mov|avi|ts|webm)\b/i) || [])[1]?.toLowerCase()
  if (ext === 'avi' || ext === 'ts') return 1 // container not supported by <video>
  return 0
}

/**
 * Sort torrent options so that browser-playable releases come first, then by
 * seed count. Keeps the popular x265-HEVC packs from hijacking the top slot.
 */
export function sortTorrentsPlayableFirst(list: TorrentOption[]): TorrentOption[] {
  return [...list].sort((a, b) => {
    const pa = playabilityRank(a.title, a.codec)
    const pb = playabilityRank(b.title, b.codec)
    if (pa !== pb) return pa - pb
    return (b.seeds || 0) - (a.seeds || 0)
  })
}

export function normalizeApibayRow(row: ApibayRow): TpbItem | null {
  if (!row.info_hash || !row.name) return null
  const cat = row.category || '0'
  return {
    id: row.id || row.info_hash,
    name: row.name,
    hash: row.info_hash.toLowerCase(),
    size: humanSize(row.size),
    sizeBytes: parseInt(row.size || '0', 10) || 0,
    seeds: parseInt(row.seeders || '0', 10) || 0,
    leechers: parseInt(row.leechers || '0', 10) || 0,
    category: TPB_CATEGORIES[cat] || 'Other',
    categoryCode: cat,
    added: row.added ? new Date(parseInt(row.added, 10) * 1000).toISOString() : '',
    username: row.username || 'anonymous',
    status: row.status,
    imdb: row.imdb || undefined,
    quality: detectQuality(row.name),
  }
}

export async function apibaySearch(q: string, cat = ''): Promise<TpbItem[]> {
  const url = `${APIBAY}/q.php?q=${encodeURIComponent(q)}&cat=${cat}`
  const rows = await cfGetJson<ApibayRow[]>(url, 12_000)
  if (!Array.isArray(rows)) return []
  return rows.map(normalizeApibayRow).filter((r): r is TpbItem => !!r)
}

export function apibayToTorrentOption(item: TpbItem): TorrentOption {
  return {
    hash: item.hash,
    title: item.name,
    quality: item.quality,
    codec: detectCodecFromName(item.name),
    size: item.size,
    sizeBytes: item.sizeBytes,
    seeds: item.seeds,
    leechers: item.leechers,
    provider: 'tpb',
    source: item.hash,
    date: item.added,
    status: item.status,
  }
}

/** Find movie torrents: TPB (imdb-keyed) + YTS (imdb-keyed) + 1337x, merged by seed count. */
export async function findMovieTorrents(imdbId?: string, title?: string, year?: number): Promise<TorrentOption[]> {
  return cached(`movtorrent:${imdbId || '-'}|${title || '-'}|${year || '-'}`, 10 * 60_000, async () => {
    const { ytsMovieTorrents } = await import('./yts')
    const { leetxSearch } = await import('./leetx')

    const tpbTask = (async () => {
      let rows: TpbItem[] = []
      if (imdbId) {
        try {
          rows = await apibaySearch(imdbId)
        } catch { /* fall through */ }
      }
      if (rows.length === 0 && title) {
        const q = year ? `${title} ${year}` : title
        try {
          rows = await apibaySearch(q)
        } catch { /* fall through */ }
      }
      const videoCats = new Set(['201', '202', '207', '208', '209', '299'])
      return rows
        .filter((r) => videoCats.has(r.categoryCode) || r.imdb)
        .map(apibayToTorrentOption)
    })()

    const [tpb, yts, leetx] = await Promise.all([
      tpbTask,
      ytsMovieTorrents(imdbId, title, year).catch(() => [] as TorrentOption[]),
      title
        ? leetxSearch(`${title}${year ? ` ${year}` : ''}`, { category: 'movies', resolve: 8 }).catch(() => [] as TorrentOption[])
        : Promise.resolve([] as TorrentOption[]),
    ])

    const seen = new Set<string>()
    const merged: TorrentOption[] = []
    for (const t of [...tpb, ...yts, ...leetx]) {
      if (!t.source || seen.has(t.source)) continue
      seen.add(t.source)
      merged.push(t)
    }
    // Browser-playable (H.264/x264, MP4/MKV) releases first, seeds second.
    return sortTorrentsPlayableFirst(merged).slice(0, 30)
  })
}

/* ------------------------------ eztv (best-effort) ------------------------------ */

interface EztvRow {
  id?: number
  hash?: string
  filename?: string
  title?: string
  season_number?: number
  episode_number?: number
  size_bytes?: number | string
  seeds?: number
  leechers?: number
  date_released_unix?: number
  imdb_id?: string
}

async function eztvByImdb(imdbNumeric: string): Promise<TorrentOption[]> {
  const url = `${EZTV}/api/get-torrents?imdb_id=${encodeURIComponent(imdbNumeric)}&limit=200`
  const data = await cfGetJson<{ torrent_list?: EztvRow[] }>(url, 8_000)
  return (data.torrent_list || [])
    .filter((r) => r.hash && (r.filename || r.title))
    .map((r) => ({
      hash: r.hash!.toLowerCase(),
      title: r.title || r.filename || r.hash!,
      quality: detectQuality(r.title || r.filename || ''),
      codec: detectCodecFromName(r.title || r.filename || ''),
      size: humanSize(r.size_bytes),
      sizeBytes: parseInt(String(r.size_bytes || '0'), 10) || 0,
      seeds: r.seeds || 0,
      leechers: r.leechers || 0,
      provider: 'eztv' as const,
      source: r.hash!.toLowerCase(),
      season: r.season_number,
      episode: r.episode_number,
      date: r.date_released_unix ? new Date(r.date_released_unix * 1000).toISOString() : undefined,
    }))
}

/* ------------------------------ nyaa ------------------------------ */

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function cdata(s: string): string {
  const m = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(s)
  return m ? m[1] : s
}

interface NyaaItem {
  title: string
  hash: string
  seeds: number
  leechers: number
  size: string
  date: string
  page: string
  info: string
}

export function parseNyaaRss(xml: string): NyaaItem[] {
  const items: NyaaItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  const tag = (block: string, name: string): string => {
    const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')
    const t = re.exec(block)
    return t ? decodeEntities(cdata(t[1]).trim()) : ''
  }
  while ((m = itemRe.exec(xml))) {
    const block = m[1]
    const hash = tag(block, 'nyaa:infoHash').toLowerCase()
    const title = tag(block, 'title')
    if (!hash || !title) continue
    items.push({
      title,
      hash,
      seeds: parseInt(tag(block, 'nyaa:seeders'), 10) || 0,
      leechers: parseInt(tag(block, 'nyaa:leechers'), 10) || 0,
      size: tag(block, 'nyaa:size'),
      date: tag(block, 'pubDate'),
      page: tag(block, 'guid'),
      info: tag(block, 'description'),
    })
  }
  return items
}

export async function nyaaSearch(
  q: string,
  opts: { sort?: 'seeders' | 'date' } = {},
): Promise<TorrentOption[]> {
  const sort = opts.sort === 'date' ? 's=id&o=desc' : 's=seeders&o=desc'
  const url = `${NYAA}/?page=rss&q=${encodeURIComponent(q)}&c=1_2&f=0&${sort}`
  const xml = await fetchText(url, 12_000)
  return parseNyaaRss(xml).map((r) => ({
    hash: r.hash,
    title: r.title,
    quality: detectQuality(r.title),
    size: r.size,
    seeds: r.seeds,
    leechers: r.leechers,
    provider: 'nyaa' as const,
    source: r.hash,
    date: r.date ? new Date(r.date).toISOString() : undefined,
  }))
}

/* ------------------------------ tvmaze ------------------------------ */

interface TvMazeShow {
  id: number
  name: string
  genres?: string[]
  status?: string
  runtime?: number
  averageRuntime?: number
  premiered?: string
  rating?: { average?: number }
  summary?: string
  image?: { medium?: string; original?: string }
  externals?: { imdb?: string }
  network?: { name?: string }
  webChannel?: { name?: string }
}

function normalizeTvMaze(show: TvMazeShow): MetaItem {
  return {
    refId: `tvmaze:${show.id}`,
    kind: 'tv',
    title: show.name,
    year: show.premiered ? parseInt(show.premiered.slice(0, 4), 10) : undefined,
    poster: show.image?.original || show.image?.medium || undefined,
    rating: show.rating?.average || undefined,
    genres: show.genres || [],
    summary: show.summary ? show.summary.replace(/<[^>]+>/g, '') : undefined,
    runtime: show.averageRuntime || show.runtime,
    imdbId: show.externals?.imdb,
    tvmazeId: show.id,
    provider: 'tvmaze',
  }
}

export async function tvmazeBrowse(page: number): Promise<MetaItem[]> {
  const shows = await fetchJson<TvMazeShow[]>(`${TVMAZE}/shows?page=${page}`, 15_000)
  return shows.map(normalizeTvMaze)
}

export async function tvmazeSearch(q: string): Promise<MetaItem[]> {
  const data = await fetchJson<{ show: TvMazeShow }[]>(`${TVMAZE}/search/shows?q=${encodeURIComponent(q)}`, 12_000)
  return data.map((d) => normalizeTvMaze(d.show))
}

export async function tvmazeLookupByImdb(imdb: string): Promise<TvMazeShow> {
  return fetchJson<TvMazeShow>(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(imdb)}`, 12_000)
}

interface TvMazeEpisode {
  id: number
  season: number
  number: number | null
  name: string
  airdate?: string
  summary?: string
  image?: { medium?: string; original?: string }
}

export async function seriesDetail(imdbId: string): Promise<{ item: MetaItem & { cast?: string[]; awards?: string }; seasons: { season: number; episodes: EpisodeInfo[] }[] }> {
  const cine = await cineMeta('series', imdbId)
  let item: MetaItem & { cast?: string[]; awards?: string } = cine
  const seasonsMap = new Map<number, EpisodeInfo[]>()

  // Try TVMaze for reliable episode lists
  try {
    const show = await tvmazeLookupByImdb(imdbId)
    if (show) {
      const shows = await fetchJson<TvMazeShow & { _embedded?: { episodes?: TvMazeEpisode[] } }>(
        `${TVMAZE}/shows/${show.id}?embed=episodes`,
        15_000,
      )
      item = { ...normalizeTvMaze(shows), backdrop: cine.backdrop, summary: cine.summary || normalizeTvMaze(shows).summary, cast: cine.cast, awards: cine.awards }
      for (const ep of shows._embedded?.episodes || []) {
        if (ep.number == null) continue
        const list = seasonsMap.get(ep.season) || []
        list.push({
          season: ep.season,
          episode: ep.number,
          title: ep.name,
          overview: ep.summary ? ep.summary.replace(/<[^>]+>/g, '') : undefined,
          airDate: ep.airdate || undefined,
          thumbnail: ep.image?.medium || undefined,
        })
        seasonsMap.set(ep.season, list)
      }
    }
  } catch {
    // fallback: Cinemeta videos
  }

  if (seasonsMap.size === 0 && cine.videos?.length) {
    for (const v of cine.videos) {
      if (v.season == null || v.episode == null || v.season < 1) continue
      const list = seasonsMap.get(v.season) || []
      list.push({
        season: v.season,
        episode: v.episode,
        title: v.name || v.title,
        overview: v.overview,
        airDate: v.released,
        thumbnail: v.thumbnail,
      })
      seasonsMap.set(v.season, list)
    }
  }

  const seasons = [...seasonsMap.entries()]
    .map(([season, episodes]) => ({ season, episodes: episodes.sort((a, b) => a.episode - b.episode) }))
    .sort((a, b) => a.season - b.season)

  return { item, seasons }
}

/** Episode torrents: EZTV first, TPB fallback. */
export async function findEpisodeTorrents(
  imdbId?: string,
  title?: string,
  season?: number,
  episode?: number,
): Promise<TorrentOption[]> {
  // whole-show EZTV lookup (cached)
  if (imdbId && /^\d+$/.test(imdbId.replace(/^tt/, ''))) {
    try {
      const list = await cached(`eztv:${imdbId}`, 10 * 60_000, () => eztvByImdb(imdbId.replace(/^tt/, '')))
      const sorted = sortTorrentsPlayableFirst(list)
      if (season && episode) {
        const exact = sorted.filter((t) => t.season === season && t.episode === episode)
        if (exact.length) return exact.slice(0, 12)
      } else if (season) {
        const pack = sorted.filter((t) => t.season === season && (t.episode == null || t.episode === 0))
        if (pack.length) return pack.slice(0, 12)
      } else {
        return sorted.slice(0, 24)
      }
    } catch { /* EZTV unavailable -> TPB */ }
  }
  if (!title) return []
  const pad = (n?: number, w = 2) => (n != null ? String(n).padStart(w, '0') : '')
  const queries: string[] = []
  if (season && episode) {
    queries.push(`${title} S${pad(season)}E${pad(episode)}`)
    queries.push(`${title} ${season}x${pad(episode)}`)
  } else if (season) {
    queries.push(`${title} S${pad(season)}`)
  } else {
    queries.push(title)
  }
  for (const q of queries) {
    try {
      const rows = await apibaySearch(q)
      const tvCats = new Set(['205', '208'])
      const opts = rows
        .filter((r) => tvCats.has(r.categoryCode) || /\bS\d{1,2}E\d{1,2}\b/i.test(r.name))
        .map(apibayToTorrentOption)
      const sorted = sortTorrentsPlayableFirst(opts).slice(0, 12)
      if (sorted.length) return sorted
    } catch { /* try next */ }
  }
  // 1337x fallback (works when TPB/EZTV are blocked)
  if (season && episode) {
    try {
      const { leetxSearch } = await import('./leetx')
      const opts = await leetxSearch(`${title} S${pad(season)}E${pad(episode)}`, { category: 'tv', resolve: 8 })
      if (opts.length) return opts.slice(0, 12)
    } catch { /* give up */ }
  }
  return []
}
