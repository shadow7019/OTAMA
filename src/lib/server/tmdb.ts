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

export type TmdbSort =
  | 'trending'
  | 'popular'
  | 'top'
  | 'imdbRating'
  | 'year'
  | 'now_playing'
  | 'airing_today'
  | 'on_the_air'
  | 'upcoming'

/**
 * TMDB catalog browse with IMDB enrichment.
 *  - trending     → /trending/{media}/week          (no genre filter support upstream)
 *  - popular      → /{media}/popular
 *  - top|imdbRating → /{media}/top_rated
 *  - year         → discover sorted by release date
 *  - now_playing  → /movie/now_playing   (auto-updating: in theaters)
 *  - upcoming     → /movie/upcoming      (auto-updating: coming soon)
 *  - airing_today → /discover/tv with a next-episode air window (shows that
 *                   REALLY have an episode airing right now, fresh shows only)
 *  - on_the_air   → same, with a 7-day window (shows airing this week)
 *  - any genre    → /discover with sort_by (top uses vote_average + vote_count floor)
 *
 *  WHY NOT TMDB /tv/airing_today | /tv/on_the_air: TMDB lists every daily-era
 *  stalwart there (talk shows from 2009, Kamen Rider from 1971, Simpsons
 *  from 1989) — technically airing, but useless as a "new episodes" row.
 */
const LIVE_FEEDS: TmdbSort[] = ['now_playing', 'airing_today', 'on_the_air', 'upcoming']

/** Live feeds are media-specific — a wrong pairing maps to the closest equivalent, never trending. */
function LIVE_FEED_PAIRING(sortRaw: string, media: 'movie' | 'tv'): TmdbSort {
  if (sortRaw === 'imdbRating') return 'top'
  if (!['trending', 'popular', 'top', 'imdbRating', 'year', ...LIVE_FEEDS].includes(sortRaw)) return 'trending'
  const sort = sortRaw as TmdbSort
  if (!LIVE_FEEDS.includes(sort)) return sort
  const valid =
    (sort === 'now_playing' || sort === 'upcoming') === (media === 'movie') &&
    (sort === 'airing_today' || sort === 'on_the_air') === (media === 'tv')
  if (valid) return sort
  const fixed: Record<string, TmdbSort> =
    media === 'movie'
      ? { airing_today: 'now_playing', on_the_air: 'now_playing' }
      : { now_playing: 'airing_today', upcoming: 'on_the_air' }
  return fixed[sort] ?? 'trending'
}

export async function tmdbCatalog(
  type: 'movie' | 'series',
  opts: { sort?: string; genre?: string; page?: number } = {},
): Promise<MetaItem[]> {
  const media = type === 'movie' ? 'movie' : 'tv'
  const sortRaw = opts.sort || 'trending'
  const sort: TmdbSort = LIVE_FEED_PAIRING(sortRaw, media)
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
  } else if (sort === 'now_playing') {
    params = { page }
    path = '/movie/now_playing'
  } else if (sort === 'upcoming') {
    params = { page }
    path = '/movie/upcoming'
  } else if (sort === 'airing_today' || sort === 'on_the_air') {
    // Discover's air_date.gte/lte filter on the NEXT episode to air, so the
    // window only returns shows that actually have an episode airing right
    // now (ended shows have no next episode and drop out by themselves).
    // The ~2-year first_air_date floor keeps decades-old daily stalwarts
    // (Simpsons, Kamen Rider, daytime talk shows) out of the row, while
    // popularity sorting surfaces the biggest current hits first. Window
    // starts yesterday and the first_air_date ceiling allows tomorrow so
    // timezone edges (IST vs UTC) and same-day premieres never fall through.
    const now = Date.now()
    const day = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString().slice(0, 10)
    params = {
      sort_by: 'popularity.desc',
      include_adult: false,
      'air_date.gte': day(-1),
      'air_date.lte': day(sort === 'airing_today' ? 1 : 7),
      'first_air_date.gte': day(-730),
      'first_air_date.lte': day(1),
      'vote_count.gte': 1,
      timezone: 'Asia/Kolkata',
      page,
    }
    path = '/discover/tv'
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

/* ------------------------------ anime catalog ------------------------------ */

/**
 * TMDB ANIME catalog — Japanese-animation TV shows. TMDB's anime coverage is
 * dramatically deeper than Cinemeta's "Anime" genre slice (every season of
 * every long-running show, currently-airing episodes included), so the Anime
 * view gets a TMDB source of its own.
 *  - popular/trending → discover by popularity
 *  - top              → discover by vote_average (vote floor to avoid stubs)
 *  - year             → new anime from the last 6 months
 *
 * LATEST-SEASON MAPPING: every card is upgraded to the show's most recently
 * aired season — the season's own poster and air year replace the series-wide
 * Season-1 art, and multi-season shows get a "· S<n>" suffix. The detail view
 * already opens at the latest season, so browse and detail now agree.
 */
export async function tmdbAnimeCatalog(
  opts: { sort?: string; page?: number } = {},
): Promise<MetaItem[]> {
  const page = Math.max(1, opts.page || 1)
  const sort = ['popular', 'trending', 'top', 'year'].includes(opts.sort || '') ? opts.sort : 'popular'
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  const sixMonthsAgo = d.toISOString().slice(0, 10)

  const params: Record<string, string | number | boolean | undefined> =
    sort === 'year'
      ? { with_genres: 16, with_original_language: 'ja', sort_by: 'first_air_date.desc', 'first_air_date.gte': sixMonthsAgo, include_adult: false, page }
      : sort === 'top'
        ? { with_genres: 16, with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50, include_adult: false, page }
        : { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc', include_adult: false, page }

  const data = await tmdbGet<{ results?: TmdbListRow[] }>('/discover/tv', params, 10 * 60_000)
  const rows = (data.results || []).filter((r) => r.name && (r.poster_path || r.backdrop_path))
  const items = await enrichImdb('tv', rows)
  items.forEach((i) => (i.kind = 'anime'))

  // Upgrade every card to the show's latest aired season (cached per show).
  //
  // CURRENT-CONTENT YEARS: TMDB franchises like Bleach live in ONE show entry
  // (S1 = 2004 series, S2 = Thousand-Year Blood War) whose seasons span
  // several years — and daily long-runners (Doraemon, Conan) sit in a single
  // season since their premiere. Displaying the season's START year made
  // this year's episodes invisible ("Bleach · S2 | 2022"). So whenever the
  // show is still current — newest episode within ~2 years, or one already
  // scheduled — the card shows the year of that latest episode instead.
  // Shows that genuinely ended keep their real (historical) year.
  const CURRENT_WINDOW_MS = 2 * 365 * 86_400_000
  const isCurrent = (date?: string) => !!date && Number.isFinite(Date.parse(date)) && Date.now() - Date.parse(date) < CURRENT_WINDOW_MS

  return Promise.all(
    items.map(async (it) => {
      const tvId = it.tmdbId ?? (it.refId.startsWith('tmdb:') ? parseInt(it.refId.slice(5), 10) : NaN)
      if (!Number.isFinite(tvId)) return it
      const latest = await latestSeasonOf(tvId)
      if (!latest) return it
      const currentYear =
        isCurrent(latest.lastAirDate) || isCurrent(latest.nextAirDate)
          ? yearOf(latest.lastAirDate || latest.nextAirDate)
          : undefined
      if (latest.season < 2) {
        // single-season show — no season suffix, but keep the year current
        return currentYear && currentYear !== it.year ? { ...it, year: currentYear } : it
      }
      return {
        ...it,
        title: `${it.title} · S${latest.season}`,
        year: currentYear ?? (latest.airDate ? yearOf(latest.airDate) : it.year),
        poster: latest.poster || it.poster,
      }
    }),
  )
}

interface TmdbSeason {
  season_number: number
  name: string
  episode_count: number
  air_date?: string | null
  poster_path?: string | null
}

interface TmdbTvDetail extends TmdbListRow {
  seasons?: TmdbSeason[]
  last_episode_to_air?: { season_number?: number; air_date?: string | null } | null
  next_episode_to_air?: { air_date?: string | null } | null
}

/**
 * Latest AIRED season of a TMDB TV show (cached 6h).
 * Picks the season containing the most recently aired episode; falls back to
 * the highest numbered season that has an air date.
 */
export async function latestSeasonOf(tvId: number): Promise<{ season: number; name: string; airDate?: string; lastAirDate?: string; nextAirDate?: string; poster?: string } | null> {
  try {
    const detail = await tmdbGet<TmdbTvDetail>(`/tv/${tvId}`, {}, 6 * 60 * 60_000)
    const seasons = (detail.seasons || []).filter((s) => s.episode_count > 0)
    if (!seasons.length) return null
    let pick: TmdbSeason | undefined =
      detail.last_episode_to_air?.season_number != null
        ? seasons.find((s) => s.season_number === detail.last_episode_to_air?.season_number)
        : undefined
    if (!pick) {
      const numbered = seasons.filter((s) => s.season_number >= 1 && s.air_date).sort((a, b) => a.season_number - b.season_number)
      pick = numbered[numbered.length - 1] || seasons[seasons.length - 1]
    }
    if (!pick) return null
    return {
      season: pick.season_number,
      name: pick.name,
      airDate: pick.air_date || undefined,
      lastAirDate: detail.last_episode_to_air?.air_date || undefined,
      nextAirDate: detail.next_episode_to_air?.air_date || undefined,
      poster: pick.poster_path ? `${IMG}/w500${pick.poster_path}` : undefined,
    }
  } catch {
    return null
  }
}

interface TmdbSeasonDetail {
  episodes?: {
    episode_number?: number
    name?: string
    overview?: string | null
    air_date?: string | null
    still_path?: string | null
  }[]
}

/**
 * Seasons + full episode lists straight from TMDB (cached 6h per season).
 * Used for anime detail views: TMDB is the only source that tracks ongoing
 * franchises CURRENTLY — TVMaze entries for long-running anime (Bleach)
 * freeze at the original series finale, hiding sequel seasons like
 * Thousand-Year Blood War. EpisodeInfo-shaped so it drops into seriesDetail.
 */
export async function tmdbSeriesSeasons(tmdbId: number): Promise<{ season: number; episodes: { season: number; episode: number; title?: string; overview?: string; airDate?: string; thumbnail?: string }[] }[]> {
  try {
    const detail = await tmdbGet<TmdbTvDetail>(`/tv/${tmdbId}`, {}, 6 * 60 * 60_000)
    const list = (detail.seasons || [])
      .filter((s) => s.episode_count > 0 && s.season_number >= 1)
      .sort((a, b) => a.season_number - b.season_number)
    const out = await Promise.all(
      list.map(async (s) => {
        try {
          const sd = await tmdbGet<TmdbSeasonDetail>(`/tv/${tmdbId}/season/${s.season_number}`, {}, 6 * 60 * 60_000)
          const episodes = (sd.episodes || [])
            .filter((ep) => ep.episode_number != null)
            .map((ep) => ({
              season: s.season_number,
              episode: ep.episode_number as number,
              title: ep.name || undefined,
              overview: ep.overview || undefined,
              airDate: ep.air_date || undefined,
              thumbnail: ep.still_path ? `${IMG}/w300${ep.still_path}` : undefined,
            }))
          return { season: s.season_number, episodes }
        } catch {
          return { season: s.season_number, episodes: [] }
        }
      }),
    )
    return out.filter((s) => s.episodes.length > 0)
  } catch {
    return []
  }
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

/**
 * Resolve a free-text title to its best TMDB/IMDb match for one media type.
 * Used to give metadata-less items (e.g. anime opened from a raw Nyaa search)
 * a real identity so the full season/episode browser unlocks.
 */
export async function tmdbResolveTitle(
  q: string,
  media: 'movie' | 'tv',
): Promise<{ imdbId: string | null; tmdbId?: number; title?: string; poster?: string; year?: number }> {
  const { movies, series } = await tmdbSearchMulti(q)
  const list = media === 'tv' ? series : movies
  const hit = list.find((r) => r.imdbId) || list[0]
  if (!hit) return { imdbId: null }
  if (hit.imdbId) {
    return { imdbId: hit.imdbId, tmdbId: hit.tmdbId, title: hit.title, poster: hit.poster, year: hit.year }
  }
  if (hit.tmdbId) {
    const imdbId = await tmdbImdbFromTmdbId(media, hit.tmdbId)
    return { imdbId, tmdbId: hit.tmdbId, title: hit.title, poster: hit.poster, year: hit.year }
  }
  return { imdbId: null }
}


/** Resolve a TMDB id → IMDb id (24h cache) so TMDB-only cards open in the detail overlay. */
export async function tmdbImdbFromTmdbId(media: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  try {
    const ext = await tmdbGet<{ imdb_id?: string | null }>(`/${media}/${tmdbId}/external_ids`, {}, 24 * 60 * 60_000)
    return ext.imdb_id || null
  } catch {
    return null
  }
}

export interface TmdbEnhancement {
  backdrop?: string
  summary?: string
  runtime?: number
  genres?: string[]
  tagline?: string
  tmdbRating?: number
  /** TMDB id of the matched title — lets callers pull TMDB-native structures (e.g. seasons) */
  tmdbId?: number
  /** Release year from release_date/first_air_date — Cinemeta misses it for
   *  unreleased titles, which used to degrade torrent query construction. */
  year?: number
  /** Original-language title — torrent sites sometimes index it as-is. */
  originalTitle?: string
}

interface TmdbDetail extends TmdbListRow {
  runtime?: number
  episode_run_time?: number[]
  tagline?: string
  genres?: { id: number; name: string }[]
  original_title?: string
  original_name?: string
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
      tmdbId: row.id,
      year: yearOf(detail.release_date || detail.first_air_date),
      originalTitle: detail.original_title || detail.original_name || undefined,
    }
  } catch {
    return mapRow(row, media === 'movie' ? 'movie' : 'tv') && {
      backdrop: row.backdrop_path ? `${IMG}/w1280${row.backdrop_path}` : undefined,
      summary: row.overview || undefined,
    }
  }
}
