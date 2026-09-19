import { NextRequest, NextResponse } from 'next/server'
import { cineCatalog, nyaaSearch, apibaySearch, tvmazeSearch, stripBrokenPosters } from '@/lib/server/providers'
import { ytsSearch } from '@/lib/server/yts'
import { leetxSearch } from '@/lib/server/leetx'
import { solidSearch } from '@/lib/server/solidtorrents'
import { rarbgSearch } from '@/lib/server/rarbg'
import { limeSearch } from '@/lib/server/limetorrents'
import { torrentDownloadsSearch } from '@/lib/server/torrentdownloads'
import { tgxSearch } from '@/lib/server/torrentgalaxy'
import { tmdbSearchMulti, tmdbStatus } from '@/lib/server/tmdb'
import type { MetaItem, TorrentOption, TpbItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q= — unified search across providers.
 * Returns { movies, series, anime, tpb, leetx } where anime = Nyaa raw results,
 * leetx = 1337x torrent results; YTS movies are merged into movies.
 * When a TMDB key is configured, TMDB multi-search is merged in (deduped by imdb).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ movies: [], series: [], anime: [], animeSeries: [], tpb: [], leetx: [], solid: [], more: [] })
  }

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

  const [movies, series, tvAlt, anime, tpb, ytsMovies, leetx, solid, rarbg, lime, td, tgx] = await Promise.all([
    safe(cineCatalog('movie', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(cineCatalog('series', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(tvmazeSearch(q), [] as MetaItem[]),
    safe(nyaaSearch(q, { sort: 'seeders' }), []),
    safe(apibaySearch(q), [] as TpbItem[]),
    safe(ytsSearch(q), [] as MetaItem[]),
    safe(leetxSearch(q, { resolve: 10 }), [] as TorrentOption[]),
    safe(solidSearch(q), [] as TorrentOption[]),
    safe(rarbgSearch(q), [] as TorrentOption[]),
    safe(limeSearch(q), [] as TorrentOption[]),
    safe(torrentDownloadsSearch(q, { resolve: 10 }), [] as TorrentOption[]),
    safe(tgxSearch(q, { resolve: 10 }), [] as TorrentOption[]),
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
  // branded fallback instead of a failed image load
  const [moviesClean, seriesClean, animeSeriesClean] = await Promise.all([
    stripBrokenPosters(moviesMerged).catch(() => moviesMerged),
    stripBrokenPosters(seriesMerged).catch(() => seriesMerged),
    stripBrokenPosters(animeSeries).catch(() => animeSeries),
  ])

  // new-site fan-out merged into one "More torrent sites" tab (deduped by hash)
  const moreSeen = new Set<string>()
  const more: TorrentOption[] = []
  for (const t of [...rarbg, ...lime, ...td, ...tgx]) {
    const key = (t.hash || t.source || '').toLowerCase()
    if (!key || moreSeen.has(key)) continue
    moreSeen.add(key)
    more.push(t)
  }
  more.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))

  return NextResponse.json({
    movies: moviesClean.slice(0, 40),
    series: seriesClean,
    anime,
    animeSeries: animeSeriesClean,
    tpb: tpb.slice(0, 30),
    leetx: leetx.slice(0, 20),
    solid: solid.slice(0, 20),
    more: more.slice(0, 30),
  })
}
