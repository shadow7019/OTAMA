import { NextRequest, NextResponse } from 'next/server'
import { tmdbImdbFromTmdbId, tmdbResolveTitle } from '@/lib/server/tmdb'

export const dynamic = 'force-dynamic'

/**
 * GET /api/resolve?tmdbId=123&type=movie|tv
 *   Resolves a TMDB id to its IMDb id so TMDB-only catalog cards can be opened
 *   in the detail overlay (torrent lookup is keyed by IMDb everywhere).
 * GET /api/resolve?q=<title>&type=tv
 *   Resolves a free-text TITLE to its best IMDb match — used to give
 *   metadata-less items (anime opened from raw Nyaa results) a real identity
 *   so the full season/episode browser unlocks. Returns the matched title,
 *   poster and year as well so the UI can upgrade itself.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const q = (searchParams.get('q') || '').trim()
  if (q) {
    try {
      const hit = await tmdbResolveTitle(q, type)
      return NextResponse.json(hit)
    } catch (err) {
      return NextResponse.json({ imdbId: null, error: (err as Error).message }, { status: 200 })
    }
  }
  const tmdbId = parseInt(searchParams.get('tmdbId') || '', 10)
  if (!tmdbId) return NextResponse.json({ error: 'tmdbId or q required' }, { status: 400 })
  try {
    const imdbId = await tmdbImdbFromTmdbId(type, tmdbId)
    return NextResponse.json({ imdbId: imdbId || null })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, imdbId: null }, { status: 200 })
  }
}
