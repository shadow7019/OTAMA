import { NextRequest, NextResponse } from 'next/server'
import { cineCatalog, nyaaSearch, apibaySearch, tvmazeSearch } from '@/lib/server/providers'
import type { MetaItem, TpbItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q= — unified search across providers.
 * Returns { movies, series, anime, tpb } where anime = Nyaa raw results.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ movies: [], series: [], anime: [], tpb: [] })

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { return fallback }
  }

  const [movies, series, tvAlt, anime, tpb] = await Promise.all([
    safe(cineCatalog('movie', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(cineCatalog('series', { search: q, sort: 'top' }), [] as MetaItem[]),
    safe(tvmazeSearch(q), [] as MetaItem[]),
    safe(nyaaSearch(q, { sort: 'seeders' }), []),
    safe(apibaySearch(q), [] as TpbItem[]),
  ])

  // merge TVMaze results into series (dedupe by title)
  const seen = new Set(series.map((s) => s.title.toLowerCase()))
  for (const alt of tvAlt.slice(0, 8)) {
    if (!seen.has(alt.title.toLowerCase())) series.push(alt)
  }

  return NextResponse.json({ movies, series, anime, tpb: tpb.slice(0, 30) })
}
