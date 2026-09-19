/**
 * YTS (YIFY) movies provider — keyless JSON API, richest structured movie
 * catalog available (posters, ratings, genres, hash-ready torrents).
 *
 * Mirror chain, tried in order until one returns valid JSON (first success is
 * remembered for the process lifetime):
 *  1. movies-api.accel.li — the official API base YTS migrated to (announced
 *     in the API status_message itself).
 *  2. yts.lt / yts.am / yts.ag — legacy official domains that still serve the
 *     full API (verified live, 77k+ movies).
 *  3. yts.mx — official site (DNS is intermittently dead / Cloudflare-blocked).
 *  4. yts-official.to + www13.yts-official.to — user-facing mirrors; their
 *     HTML site works but /api/v2 is often 502, so the API chain above wins.
 *  5. Torrends.to live proxy list (discovered at runtime, cached).
 *
 * If every API mirror fails, the browse catalog falls back to scraping the
 * HTML browse page of the yts-official mirror family.
 *
 * API docs (community): https://yts.mx/api
 *   /api/v2/list_movies.json   browse & search (query_term also accepts imdb ids)
 *   /api/v2/movie_details.json full details for one movie
 */
import type { MetaItem, TorrentOption } from '@/lib/types'
import { cfGetText, humanSize } from './providers'
import { torrendsMirrorsFor } from './torrends'

const YTS_MIRRORS = [
  'https://movies-api.accel.li',
  'https://yts.lt',
  'https://yts.am',
  'https://yts.ag',
  'https://yts.mx',
  'https://yts-official.to',
  'https://www13.yts-official.to',
]

const globalState = globalThis as unknown as { __otamaYtsMirror?: string | null; __otamaYtsTorrends?: string[] | null }

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
  video_codec?: string
  bit_depth?: string
  audio_channels?: string
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
  const dynamic = await cachedTorrendsMirrors()
  const base = [...YTS_MIRRORS, ...dynamic]
  const order = good ? [good, ...base.filter((m) => m !== good)] : base
  let lastErr: unknown
  for (const mirror of order) {
    try {
      const text = await cfGetText(`${mirror}${path}`, timeoutMs)
      const trimmed = text.trimStart()
      if (trimmed.startsWith('<')) throw new Error(`HTML instead of JSON from ${mirror}`)
      if (/^error code:/i.test(trimmed)) throw new Error(`${mirror} origin error: ${trimmed.slice(0, 40)}`)
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

/** Torrends keeps a live proxy list for YTS — append it to the chain (cached 1h). */
async function cachedTorrendsMirrors(): Promise<string[]> {
  if (globalState.__otamaYtsTorrends) return globalState.__otamaYtsTorrends
  try {
    const mirrors = await torrendsMirrorsFor('yts')
    const fresh = mirrors.filter((m) => !YTS_MIRRORS.includes(m))
    globalState.__otamaYtsTorrends = fresh
    return fresh
  } catch {
    globalState.__otamaYtsTorrends = []
    return []
  }
}

/**
 * HTML browse fallback — used only when every API mirror fails. The
 * yts-official.to mirror family serves the classic YTS browse HTML with real
 * movie cards (title/year/rating/genres/poster); hrefs are rewritten to the
 * en.yts-official.biz backend which we keep as-is for the poster images.
 */
export async function ytsBrowseHtml(opts: { page?: number; sort?: string; genre?: string } = {}): Promise<MetaItem[]> {
  const page = (opts.page || 0) + 1
  const sortBy = SORTS[opts.sort || 'popular'] || 'download_count'
  const genre = opts.genre && opts.genre !== 'all' ? opts.genre : 'all'
  const paths = [
    `https://www13.yts-official.to/browse-movies/0/${genre}/all/${sortBy}/desc/all/all/all/${page}`,
    `https://yts-official.to/browse-movies/0/${genre}/all/${sortBy}/desc/all/all/all/${page}`,
  ]
  for (const url of paths) {
    try {
      const html = await cfGetText(url, 12_000)
      if (!html.includes('browse-movie-wrap')) continue
      const items: MetaItem[] = []
      const cardRe = /<div class="browse-movie-wrap[\s\S]*?(?=<div class="browse-movie-wrap|$)/g
      let m: RegExpExecArray | null
      while ((m = cardRe.exec(html)) && items.length < 50) {
        const card = m[0]
        const title = /browse-movie-title[^>]*>([^<]+)</.exec(card)?.[1]?.trim()
        const year = parseInt(/browse-movie-year">([\d]{4})</.exec(card)?.[1] || '', 10)
        const poster = /<img[^>]+src="([^"]+)"[^>]*alt="[^"]*download"/.exec(card)?.[1]
        const rating = parseFloat(/<h4 class="rating">([\d.]+) \/ 10</.exec(card)?.[1] || '')
        const genres = [...card.matchAll(/<h4>([^<]+)<\/h4>/g)].map((g) => g[1].trim())
        const href = /class="browse-movie-link" href="([^"]+)"/.exec(card)?.[1]
        if (!title) continue
        items.push({
          refId: href ? `yts-page:${href}` : `yts-html:${title}`,
          kind: 'movie',
          title,
          year: isNaN(year) ? undefined : year,
          poster: poster || undefined,
          rating: isNaN(rating) ? undefined : rating,
          genres: genres.slice(0, 4),
          provider: 'yts',
        })
      }
      if (items.length) return items
    } catch { /* next mirror */ }
  }
  return []
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
  const codec = normalizeCodec(t.video_codec, `${t.quality || ''} ${t.type || ''}`)
  return {
    hash,
    title: `${label}${m.year ? ` (${m.year})` : ''} ${t.quality || ''}${t.is_repack === '1' ? ' REPACK' : ''}${codec === 'hevc' ? ' x265' : ''}`.trim(),
    quality: t.quality || undefined,
    codec,
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

export function normalizeCodec(videoCodec?: string, label?: string): 'h264' | 'hevc' | undefined {
  const s = `${videoCodec || ''} ${label || ''}`.toLowerCase()
  if (/x\s?265|h\.?265|hevc/.test(s)) return 'hevc'
  if (/x\s?264|h\.?264|avc/.test(s)) return 'h264'
  return undefined
}
