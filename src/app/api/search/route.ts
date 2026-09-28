import { NextRequest, NextResponse } from 'next/server'
import { cineCatalog, nyaaSearch, tvmazeSearch, stripBrokenPosters } from '@/lib/server/providers'
import { ytsSearch } from '@/lib/server/yts'
import { tmdbSearchMulti } from '@/lib/server/tmdb'
import { withTimeout } from '@/lib/server/with-timeout'
import type { MetaItem, TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q= — METADATA phase of unified search (fast, TMDB-first).
 *
 * SPLIT from the torrent-site fan-out (which moved to /api/search/torrents):
 * previously all 12 providers raced in one handler, and a single slow torrent
 * site (1337x / TorrentDownloads / TGX each resolve ~10 detail pages) held the
 * whole response past the hosting edge timeout — the phone then showed
 * "Cannot reach the OTAMA server" with ZERO results, TMDB included.
 *
 * Now this route answers metadata only: TMDB multi-search merged over
 * Cinemeta / TVMaze / YTS, plus raw Nyaa anime torrents (fast RSS). Every
 * provider is hard-capped so the response lands within seconds even when
 * sites hang. The torrent tabs load separately and degrade independently.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ movies: [], series: [], anime: [], animeSeries: [] })
  }

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { return fallback }
  }
  const cap = <T>(p: Promise<T>, ms: number): Promise<T> => withTimeout(p, ms, 'search provider')

  // TMDB layer (built-in key; internal per-call timeout + cache already apply)
  let tmdbMovies: MetaItem[] = []
  let tmdbSeries: MetaItem[] = []
  try {
    const res = await safe(cap(tmdbSearchMulti(q), 12_000), { movies: [] as MetaItem[], series: [] as MetaItem[] })
    tmdbMovies = res.movies
    tmdbSeries = res.series
  } catch { /* TMDB optional */ }

  const [movies, series, tvAlt, anime, ytsMovies] = await Promise.all([
    safe(cap(cineCatalog('movie', { search: q, sort: 'top' }), 9_000), [] as MetaItem[]),
    safe(cap(cineCatalog('series', { search: q, sort: 'top' }), 9_000), [] as MetaItem[]),
    safe(cap(tvmazeSearch(q), 9_000), [] as MetaItem[]),
    safe(cap(nyaaSearch(q, { sort: 'seeders' }), 9_000), [] as TorrentOption[]),
    safe(cap(ytsSearch(q), 9_000), [] as MetaItem[]),
  ])

  // merge TMDB results first (best metadata), dedupe by imdb id then title
  const mergeTmdb = (tmdbList: MetaItem[], base: MetaItem[]) => {
    const seen = new Set<string>()
    for (const m of base) {
      seen.add(m.imdbId?.toLowerCase() || m.refId.toLowerCase())
      seen.add(m.title.toLowerCase())
    }
    const merged: MetaItem[] = []
    for (const m of tmdbList) {
      const idKey = m.imdbId?.toLowerCase() || `tmdb:${m.tmdbId}`
      if (!seen.has(idKey) && !seen.has(m.title.toLowerCase())) merged.push(m)
      seen.add(idKey)
      seen.add(m.title.toLowerCase())
    }
    return [...merged, ...base].slice(0, 40)
  }

  const moviesMerged = mergeTmdb(tmdbMovies, movies)
  const seriesMerged = mergeTmdb(tmdbSeries, series)

  // ANIME SERIES cards for the Anime tab — TMDB Animation TV matches give
  // every searched anime a full season/episode browser (raw Nyaa results are
  // flat torrents and often miss whole seasons). Falls back to any TMDB TV
  // hit when the animation filter leaves nothing (TMDB anime tags vary).
  let animeSeries = tmdbSeries.filter((s) => s.genres?.includes('Animation')).slice(0, 16)
  if (animeSeries.length === 0) animeSeries = tmdbSeries.slice(0, 8)

  // merge TVMaze results into series (dedupe by title)
  const seen = new Set(seriesMerged.map((s) => s.title.toLowerCase()))
  for (const alt of tvAlt.slice(0, 8)) {
    if (!seen.has(alt.title.toLowerCase())) seriesMerged.push(alt)
  }

  // append YTS movie matches (torrent-forward catalog), deduped by imdb/title
  const seenMovies = new Set(moviesMerged.map((m) => m.imdbId?.toLowerCase() || m.refId.toLowerCase()))
  for (const y of ytsMovies) {
    const key = y.imdbId?.toLowerCase() || y.refId.toLowerCase()
    if (!seenMovies.has(key) && !seenMovies.has(y.title.toLowerCase())) {
      seenMovies.add(key)
      moviesMerged.push(y)
    }
  }

  // strip broken poster URLs (metahub HTML placeholders) so cards show the
  // branded fallback instead of a failed image load — capped so poster
  // probing can never stall the metadata response
  const [moviesClean, seriesClean, animeSeriesClean] = await Promise.all([
    safe(cap(stripBrokenPosters(moviesMerged), 8_000), moviesMerged),
    safe(cap(stripBrokenPosters(seriesMerged), 8_000), seriesMerged),
    safe(cap(stripBrokenPosters(animeSeries), 8_000), animeSeries),
  ])

  return NextResponse.json({
    movies: moviesClean.slice(0, 40),
    series: seriesClean,
    anime,
    animeSeries: animeSeriesClean,
  })
}
