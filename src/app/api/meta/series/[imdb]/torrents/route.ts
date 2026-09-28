import { NextRequest, NextResponse } from 'next/server'
import { findEpisodeTorrents } from '@/lib/server/providers'
import { withTimeout } from '@/lib/server/with-timeout'

export const dynamic = 'force-dynamic'

/**
 * GET /api/meta/series/:imdb/torrents?title=&season=&episode=&anime=1&absolute=N
 * Torrent options for an episode (or whole season / show when season omitted).
 * EZTV first, automatic TPB fallback; `anime=1` merges Nyaa results with
 * absolute-episode query variants (anime fansubs rarely use SxxEyy naming).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || undefined
  const season = parseInt(searchParams.get('season') || '', 10) || undefined
  const episode = parseInt(searchParams.get('episode') || '', 10) || undefined
  const anime = searchParams.get('anime') === '1'
  const absoluteEpisode = parseInt(searchParams.get('absolute') || '', 10) || undefined
  try {
    // Hard budget: the fallback ladder inside is sequential — an unlucky
    // combination of slow sources used to be able to hold this route well
    // past the hosting edge timeout.
    const torrents = await withTimeout(findEpisodeTorrents(imdb, title, season, episode, { anime, absoluteEpisode }), 22_000, 'episode torrents')
    return NextResponse.json({ torrents })
  } catch (err) {
    return NextResponse.json({ torrents: [], error: (err as Error).message }, { status: 200 })
  }
}
