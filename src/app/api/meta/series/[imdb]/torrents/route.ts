import { NextRequest, NextResponse } from 'next/server'
import { findEpisodeTorrents } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/meta/series/:imdb/torrents?title=&season=&episode=
 * Torrent options for an episode (or whole season / show when season omitted).
 * EZTV first, automatic TPB fallback.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || undefined
  const season = parseInt(searchParams.get('season') || '', 10) || undefined
  const episode = parseInt(searchParams.get('episode') || '', 10) || undefined
  try {
    const torrents = await findEpisodeTorrents(imdb, title, season, episode)
    return NextResponse.json({ torrents })
  } catch (err) {
    return NextResponse.json({ torrents: [], error: (err as Error).message }, { status: 200 })
  }
}
