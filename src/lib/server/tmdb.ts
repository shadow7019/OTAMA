/**
 * TMDB (The Movie Database) provider — richer metadata layer.
 *
 * Key resolution order (first match wins):
 *   1. Database Setting `tmdb_api_key`  (set via the in-app Settings dialog)
 *   2. Environment `TMDB_API_KEY`       (v3 api key, 32 hex chars)
 *   3. Environment `TMDB_ACCESS_TOKEN`  (v4 read access token, "eyJ…")
 *   4. Built-in default key below (ships with the app — web AND desktop)
 *
 * If every step fails, tmdb* functions throw TmdbDisabledError and callers
 * fall back to the keyless providers (Cinemeta/TVMaze) — the app keeps working.
 *
 * Uses only official endpoints: /trending, /movie, /tv, /discover, /search/multi,
 * /find, /genre, /configuration. IMDB ids are resolved via /external_ids so the
 * rest of OTAMA (detail + torrent lookup by imdb) stays unchanged.
 */
import { db } from '@/lib/db'
import { cached } from '@/lib/server/providers'
import type { MetaItem, MetaKind } from '@/lib/types'

/** Built-in TMDB v3 key — bundled permanently so TMDB works out of the box. */
const BUILTIN_TMDB_API_KEY = 'b3e1f1893c570b5d072bbb18e4c27c32'

const TMDB = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

export class TmdbDisabledError extends Error {}
export class TmdbError extends Error {}

type KeyInfo = { key: string; mode: 'v3' | 'v4'; source: 'db' | 'env' | 'builtin' }

/* ------------------------------ key resolution ------------------------------ */

const keyState = globalThis as unknown as { __otamaTmdbKey?: { value: KeyInfo | null; ts: number } }

async function resolveKey(): Promise<KeyInfo | null> {
  // Short-TTL cache so per-request DB reads don't hammer SQLite; invalidated on save.
  const st = keyState.__otamaTmdbKey
  if (st && Date.now() - st.ts < 15_000) return st.value

  let info: KeyInfo | null = null
  try {
    const row = await db.setting.findUnique({ where: { key: 'tmdb_api_key' } })
    const stored = row?.value?.trim()
    if (stored) info = { key: stored, mode: stored.startsWith('eyJ') ? 'v4' : 'v3', source: 'db' }
  } catch { /* db unavailable -> env */ }
  if (!info) {
    const v3 = (process.env.TMDB_API_KEY || '').trim()
    const v4 = (process.env.TMDB_ACCESS_TOKEN || '').trim()
    if (v4) info = { key: v4, mode: 'v4', source: 'env' }
    else if (v3) info = { key: v3, mode: 'v3', source: 'env' }
  }
  if (!info) info = { key: BUILTIN_TMDB_API_KEY, mode: 'v3', source: 'builtin' }
  keyState.__otamaTmdbKey = { value: info, ts: Date.now() }
  return info
}

/** Invalidate the cached key (after save/remove in the settings dialog). */
export function invalidateTmdbKey() {
  keyState.__otamaTmdbKey = undefined
}

export async function tmdbStatus(): Promise<{ configured: boolean; mode?: 'v3' | 'v4'; source?: 'db' | 'env' | 'builtin'; valid?: boolean }> {
  const info = await resolveKey()
  if (!info) return { configured: false }
  let valid = false
  try {
    await tmdbGet('/configuration', {})
    valid = true
  } catch {
    valid = false
  }
  return { configured: true, mode: info.mode, source: info.source, valid }
}

/* ------------------------------ core fetch ------------------------------ */

async function tmdbGet<T>(path: string, params: Record<string, string | number | boolean | undefined>, ttlMs = 10 * 60_000): Promise<T> {
  const info = await resolveKey()
  if (!info) throw new TmdbDisabledError('TMDB API key not configured')

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v))
  }
  if (info.mode === 'v3') search.set('api_key', info.key)

  const url = `${TMDB}${path}${search.toString() ? `?${search}` : ''}`
  const keyTag = info.key.slice(0, 6)

  return cached(`tmdb:${keyTag}:${path}:${search.toString()}`, ttlMs, async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12_000)
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
        headers: info.mode === 'v4' ? { Authorization: `Bearer ${info.key}`, Accept: 'application/json' } : { Accept: 'application/json' },
      })
      if (res.status === 401 || res.status === 403) throw new TmdbError('TMDB rejected the API key (401/403)')
      if (res.status === 404) throw new TmdbError('TMDB resource not found')
      if (!res.ok) throw new TmdbError(`TMDB HTTP ${res.status}`)
      return (await res.json()) as T
    } finally {
      clearTimeout(t)
    }
  })
}

/* ------------------------------ genres (official TMDB ids) ------------------------------ */

const MOVIE_GENRES: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18,
  Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  'Science Fiction': 878, 'Sci-Fi': 878, 'TV Movie': 10770, Thriller: 53, War: 10752, Western: 37,
}

const TV_GENRES: Record<string, number> = {
  'Action & Adventure': 10759, Action: 10759, Adventure: 10759, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Kids: 10762, Mystery: 9648, News: 10763, Reality: 10764,
  'Sci-Fi & Fantasy': 10765, 'Sci-Fi': 10765, Fantasy: 10765, Soap: 10766, Talk: 10767,
  'War & Politics': 10768, War: 10768, Western: 37, Romance: 10749, Thriller: 53,
}

const GENRE_NAMES: Record<number, string> = {}
for (const [name, id] of Object.entries(MOVIE_GENRES)) GENRE_NAMES[id] ??= name
for (const [name, id] of Object.entries(TV_GENRES)) GENRE_NAMES[id] ??= GENRE_NAMES[id] || name

function genreId(type: 'movie' | 'tv', genre?: string): number | undefined {
  if (!genre) return undefined
  return (type === 'movie' ? MOVIE_GENRES : TV_GENRES)[genre]
}

/* ------------------------------ mapping ------------------------------ */

interface TmdbListRow {
  id: number
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  media_type?: string
}

function yearOf(date?: string): number | undefined {
  const y = date ? parseInt(date.slice(0, 4), 10) : NaN
  return !isNaN(y) ? y : undefined
}

function mapRow(row: TmdbListRow, kind: MetaKind, imdbId?: string): MetaItem {
  return {
    refId: imdbId || `tmdb:${row.id}`,
    kind,
    title: row.title || row.name || 'Unknown',
    year: yearOf(row.release_date || row.first_air_date),
    poster: row.poster_path ? `${IMG}/w500${row.poster_path}` : undefined,
    backdrop: row.backdrop_path ? `${IMG}/w1280${row.backdrop_path}` : undefined,
    rating: row.vote_average ? Math.round(row.vote_average * 10) / 10 : undefined,
    genres: (row.genre_ids || []).map((id) => GENRE_NAMES[id]).filter(Boolean).slice(0, 3),
    summary: row.overview || undefined,
    imdbId,
    tmdbId: row.id,
    provider: 'tmdb',
  }
}

/** Resolve IMDB ids for a list page (20 parallel external_ids lookups, cached 24h). */
async function enrichImdb(media: 'movie' | 'tv', rows: TmdbListRow[]): Promise<MetaItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      try {
        const ext = await tmdbGet<{ imdb_id?: string | null }>(`/${media}/${row.id}/external_ids`, {}, 24 * 60 * 60_000)
        return mapRow(row, media === 'movie' ? 'movie' : 'tv', ext.imdb_id || undefined)
      } catch {
        return mapRow(row, media === 'movie' ? 'movie' : 'tv')
      }
    }),
  )
}

/* ------------------------------ catalog ------------------------------ */

export type TmdbSort = 'trending' | 'popular' | 'top' | 'imdbRating' | 'year'

/**
 * TMDB catalog browse with IMDB enrichment.
 *  - trending  → /trending/{media}/week          (no genre filter support upstream)
 *  - popular   → /{media}/popular
 *  - top|imdbRating → /{media}/top_rated
 *  - year      → discover sorted by release date
 *  - any genre → /discover with sort_by (top uses vote_average + vote_count floor)
 */
export async function tmdbCatalog(
  type: 'movie' | 'series',
  opts: { sort?: string; genre?: string; page?: number } = {},
): Promise<MetaItem[]> {
  const media = type === 'movie' ? 'movie' : 'tv'
  const sortRaw = opts.sort || 'trending'
  const sort: TmdbSort = ['trending', 'popular', 'top', 'imdbRating', 'year'].includes(sortRaw)
    ? (sortRaw === 'imdbRating' ? 'top' : (sortRaw as TmdbSort))
    : 'trending'
  const page = Math.max(1, opts.page || 1)
  const gid = genreId(media, opts.genre)

  const dateField = media === 'movie' ? 'primary_release_date' : 'first_air_date'
  const dateGte = media === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte'
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  const sixMonthsAgo = d.toISOString().slice(0, 10)

  let path: string
  let params: Record<string, string | number | boolean | undefined>

  if (gid) {
    const sortBy =
      sort === 'top' ? 'vote_average.desc'
        : sort === 'year' ? `${dateField}.desc`
          : 'popularity.desc'
    params = {
      sort_by: sortBy,
      with_genres: gid,
      include_adult: false,
      'vote_count.gte': sort === 'top' ? 200 : sort === 'year' ? 20 : 0,
      [dateGte]: sort === 'year' ? sixMonthsAgo : undefined,
      page,
    }
    path = `/discover/${media}`
  } else if (sort === 'trending') {
    params = { page }
    path = `/trending/${media}/week`
  } else if (sort === 'popular') {
    params = { page }
    path = `/${media}/popular`
  } else if (sort === 'top') {
    params = { page }
    path = `/${media}/top_rated`
  } else {
    // year / newest
    params = {
      sort_by: `${dateField}.desc`,
      include_adult: false,
      'vote_count.gte': 20,
      [dateGte]: sixMonthsAgo,
      page,
    }
    path = `/discover/${media}`
  }

  const data = await tmdbGet<{ results?: TmdbListRow[] }>(path, params, 10 * 60_000)
  const rows = (data.results || []).filter((r) => (r.title || r.name) && (r.poster_path || r.backdrop_path))
  return enrichImdb(media, rows)
}

/* ------------------------------ search ------------------------------ */

export async function tmdbSearchMulti(q: string): Promise<{ movies: MetaItem[]; series: MetaItem[] }> {
  const data = await tmdbGet<{ results?: (TmdbListRow & { media_type?: string })[] }>(
    '/search/multi',
    { query: q, include_adult: false },
    10 * 60_000,
  )
  const rows = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
  const moviesRaw = rows.filter((r) => r.media_type === 'movie')
  const seriesRaw = rows.filter((r) => r.media_type === 'tv')
  const [movies, series] = await Promise.all([
    enrichImdb('movie', moviesRaw),
    enrichImdb('tv', seriesRaw),
  ])
  return { movies, series }
}

/* ------------------------------ detail enhancement ------------------------------ */

export interface TmdbEnhancement {
  backdrop?: string
  summary?: string
  runtime?: number
  genres?: string[]
  tagline?: string
  tmdbRating?: number
}

interface TmdbDetail extends TmdbListRow {
  runtime?: number
  episode_run_time?: number[]
  tagline?: string
  genres?: { id: number; name: string }[]
}

/** Better backdrop/summary for a detail page, keyed by IMDB id (cached 6h). */
export async function tmdbEnhanceByImdb(imdbId: string): Promise<TmdbEnhancement | null> {
  const find = await tmdbGet<{ movie_results?: TmdbListRow[]; tv_results?: TmdbListRow[] }>(
    `/find/${encodeURIComponent(imdbId)}`,
    { external_source: 'imdb_id' },
    6 * 60 * 60_000,
  )
  const row = find.movie_results?.[0] || find.tv_results?.[0]
  if (!row) return null
  const media = find.movie_results?.[0] ? 'movie' : 'tv'
  try {
    const detail = await tmdbGet<TmdbDetail>(`/${media}/${row.id}`, {}, 6 * 60 * 60_000)
    return {
      backdrop: detail.backdrop_path ? `${IMG}/w1280${detail.backdrop_path}` : undefined,
      summary: detail.overview || undefined,
      runtime: detail.runtime || detail.episode_run_time?.[0] || undefined,
      genres: detail.genres?.map((g) => g.name).slice(0, 4),
      tagline: detail.tagline || undefined,
      tmdbRating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : undefined,
    }
  } catch {
    return mapRow(row, media === 'movie' ? 'movie' : 'tv') && {
      backdrop: row.backdrop_path ? `${IMG}/w1280${row.backdrop_path}` : undefined,
      summary: row.overview || undefined,
    }
  }
}
