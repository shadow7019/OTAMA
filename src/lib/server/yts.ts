/**
 * YTS (YIFY) movies provider — keyless JSON API, richest structured movie
 * catalog available (posters, ratings, genres, hash-ready torrents).
 *
 * The main domain (yts.mx) is geo/Cloudflare-blocked in some regions, so
 * requests go through a mirror chain (the same proxies Torrends.to lists for
 * YTS). The first mirror that answers is remembered for the process lifetime.
 *
 * API docs (community): https://yts.mx/api
 *   /api/v2/list_movies.json   browse & search (query_term also accepts imdb ids)
 *   /api/v2/movie_details.json full details for one movie
 */
import type { MetaItem, TorrentOption } from '@/lib/types'
import { cfGetText, humanSize } from './providers'

const YTS_MIRRORS = [
  'https://yts.mx',
  'https://yts.unblocked.lol',
  'https://yts.unblocked.tw',
  'https://yts.unblocked.win',
  'https://yts.unblocker.cc',
  'https://ytss.unblocked.lol',
  'https://ytss.unblocked.is',
]

const globalState = globalThis as unknown as { __otamaYtsMirror?: string | null }

interface YtsTorrent {
  url?: string
  hash?: string
  quality?: string
  type?: string
  is_repack?: '0' | '1'
  date_added?: string
  size?: string
  size_bytes?: number
  seeds?: number
  peers?: number // leechers in YTS terms
}

interface YtsMovie {
  id: number
  url?: string
  imdb_code?: string
  title?: string
  title_english?: string
  title_long?: string
  year?: number
  rating?: number
  runtime?: number
  genres?: string[]
  summary?: string
  description_full?: string
  yt_trailer_code?: string
  language?: string
  background_image?: string
  background_image_original?: string
  small_cover_image?: string
  medium_cover_image?: string
  large_cover_image?: string
  torrents?: YtsTorrent[]
}

interface YtsListData {
  movie_count?: number
  limit?: number
  page_number?: number
  movies?: YtsMovie[]
}

async function ytsGet<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const good = globalState.__otamaYtsMirror
  const order = good ? [good, ...YTS_MIRRORS.filter((m) => m !== good)] : [...YTS_MIRRORS]
  let lastErr: unknown
  for (const mirror of order) {
    try {
      const text = await cfGetText(`${mirror}${path}`, timeoutMs)
      if (text.trimStart().startsWith('<')) throw new Error(`HTML instead of JSON from ${mirror}`)
      const json = JSON.parse(text) as { status?: string; status_message?: string; data?: T }
      if (json.status !== 'ok' || !json.data) throw new Error(json.status_message || 'bad YTS payload')
      globalState.__otamaYtsMirror = mirror
      return json.data
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`YTS unreachable from all mirrors (${(lastErr as Error)?.message || 'unknown error'})`)
}

/** UI sort name -> YTS sort_by value. 'top' maps to rating. */
const SORTS: Record<string, string> = {
  popular: 'download_count',
  seeds: 'seeds',
  top: 'rating',
  rating: 'rating',
  year: 'year',
  latest: 'date_added',
}

export async function ytsBrowse(
  opts: { page?: number; genre?: string; sort?: string; quality?: string } = {},
): Promise<MetaItem[]> {
  const params = new URLSearchParams({
    limit: '50',
    page: String((opts.page || 0) + 1),
    sort_by: SORTS[opts.sort || 'popular'] || 'download_count',
    order_by: 'desc',
  })
  if (opts.genre && opts.genre !== 'all') params.set('genre', opts.genre)
  if (opts.quality && opts.quality !== 'all') params.set('quality', opts.quality)
  const data = await ytsGet<YtsListData>(`/api/v2/list_movies.json?${params}`)
  return (data.movies || []).map(ytsToMeta)
}

export async function ytsSearch(q: string, limit = 24): Promise<MetaItem[]> {
  const params = new URLSearchParams({ limit: String(limit), query_term: q })
  const data = await ytsGet<YtsListData>(`/api/v2/list_movies.json?${params}`)
  return (data.movies || []).map(ytsToMeta)
}

/**
 * Torrents for one movie. query_term accepts imdb ids, so lookup is keyed by
 * imdb like apibay; falls back to title(+year) matching.
 */
export async function ytsMovieTorrents(imdb?: string, title?: string, year?: number): Promise<TorrentOption[]> {
  const term = imdb || (title ? `${title}${year ? ` ${year}` : ''}` : '')
  if (!term) return []
  const params = new URLSearchParams({ limit: '5', query_term: term })
  const data = await ytsGet<YtsListData>(`/api/v2/list_movies.json?${params}`)
  const movies = data.movies || []
  const movie =
    (imdb ? movies.find((m) => m.imdb_code?.toLowerCase() === imdb.toLowerCase()) : undefined) ||
    movies.find(
      (m) =>
        title &&
        (m.title_english || m.title || '').toLowerCase() === title.toLowerCase() &&
        (!year || m.year === year),
    ) ||
    movies[0]
  if (!movie?.torrents?.length) return []
  return movie.torrents
    .filter((t) => t.hash)
    .map((t) => ytsTorrentOption(movie, t))
    .sort((a, b) => (b.seeds || 0) - (a.seeds || 0))
}

function ytsToMeta(m: YtsMovie): MetaItem {
  return {
    refId: m.imdb_code || `yts:${m.id}`,
    kind: 'movie',
    title: m.title_english || m.title || m.title_long || 'Unknown',
    year: m.year,
    poster: m.medium_cover_image || m.large_cover_image || m.small_cover_image || undefined,
    backdrop: m.background_image_original || m.background_image || undefined,
    rating: m.rating || undefined,
    genres: m.genres || [],
    summary: m.summary || undefined,
    runtime: m.runtime || undefined,
    imdbId: m.imdb_code || undefined,
    provider: 'yts',
  }
}

function ytsTorrentOption(m: YtsMovie, t: YtsTorrent): TorrentOption {
  const hash = (t.hash || '').toLowerCase()
  const label = m.title_english || m.title || 'Movie'
  return {
    hash,
    title: `${label}${m.year ? ` (${m.year})` : ''} ${t.quality || ''}${t.is_repack === '1' ? ' REPACK' : ''}`.trim(),
    quality: t.quality || undefined,
    size: t.size || humanSize(t.size_bytes),
    sizeBytes: t.size_bytes || 0,
    seeds: t.seeds || 0,
    leechers: t.peers || 0,
    provider: 'yts',
    source: hash,
    date: t.date_added ? new Date(t.date_added).toISOString() : undefined,
    detailUrl: m.url || undefined,
  }
}
