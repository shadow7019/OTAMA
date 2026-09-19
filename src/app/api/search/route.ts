import { NextRequest, NextResponse } from 'next/server'
import { cineCatalog, nyaaSearch, apibaySearch, tvmazeSearch } from '@/lib/server/providers'
import { tmdbSearchMulti, tmdbStatus } from '@/lib/server/tmdb'
import type { MetaItem, TpbItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q= — unified search across providers.
 * Returns { movies, series, anime, tpb } where anime = Nyaa raw results.
 * When a TMDB key is configured, TMDB multi-search is merged in (deduped by imdb).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ movies: [], series: [], anime: [], tpb: [] })

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { return fallback }
  }

  // Optional TMDB layer (fails silently when unconfigured)
  let tmdbMovies: MetaItem[] = []
  let tmdbSeries: MetaItem[] = []
  try {
    const status = await tmdbStatus()
    if (status.configured && status.valid) {
      const res = await safe(tmdbSearchMulti(q), { movies: [] as MetaItem[], series: [] as MetaItem[] })
      tmdbMovies = res.movies
      tmdbSeries = res.series
    }
  } catch { /* TMDB optional */ }

  const [movies, series, tvAlt, anime, tpb] = await Promise.all([
    safe(cineCatalog('movie', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(cineCatalog('series', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(tvmazeSearch(q), [] as MetaItem[]),
    safe(nyaaSearch(q, { sort: 'seeders' }), []),
    safe(apibaySearch(q), [] as TpbItem[]),
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

  // merge TVMaze results into series (dedupe by title)
  const seen = new Set(seriesMerged.map((s) => s.title.toLowerCase()))
  for (const alt of tvAlt.slice(0, 8)) {
    if (!seen.has(alt.title.toLowerCase())) seriesMerged.push(alt)
  }

  return NextResponse.json({ movies: moviesMerged, series: seriesMerged, anime, tpb: tpb.slice(0, 30) })
}
