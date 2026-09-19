import { NextRequest, NextResponse } from 'next/server'
import { tmdbImdbFromTmdbId } from '@/lib/server/tmdb'

export const dynamic = 'force-dynamic'

/**
 * GET /api/resolve?tmdbId=123&type=movie|tv
 * Resolves a TMDB id to its IMDb id so TMDB-only catalog cards can be opened
 * in the detail overlay (torrent lookup is keyed by IMDb everywhere).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tmdbId = parseInt(searchParams.get('tmdbId') || '', 10)
  const type = searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  if (!tmdbId) return NextResponse.json({ error: 'tmdbId required' }, { status: 400 })
  try {
    const imdbId = await tmdbImdbFromTmdbId(type, tmdbId)
    return NextResponse.json({ imdbId: imdbId || null })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, imdbId: null }, { status: 200 })
  }
}
