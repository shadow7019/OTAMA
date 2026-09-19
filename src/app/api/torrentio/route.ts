import { NextRequest, NextResponse } from 'next/server'
import { torrentioSearch, torrentioStreams } from '@/lib/server/torrentio'

export const dynamic = 'force-dynamic'

/**
 * GET /api/torrentio?q=<free text>            — resolve via Cinemeta, then aggregate
 * GET /api/torrentio?imdb=tt0145487&type=movie [&season=&episode=] — direct lookup
 *
 * Torrentio aggregates YTS / EZTV / RARBG / 1337x / ThePirateBay /
 * Kickasstorrents / TorrentGalaxy / MagnetDL / TorrentDB / NyaaSi into one
 * IMDb-keyed API. Returns { item?, torrents: TorrentOption[] }.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const imdb = (searchParams.get('imdb') || '').trim()
  const type = searchParams.get('type') === 'series' ? 'series' : 'movie'
  const season = parseInt(searchParams.get('season') || '', 10) || undefined
  const episode = parseInt(searchParams.get('episode') || '', 10) || undefined

  try {
    if (imdb && /^tt\d+$/.test(imdb)) {
      const torrents = await torrentioStreams(type, imdb, season, episode)
      return NextResponse.json({ torrents })
    }
    if (!q) return NextResponse.json({ torrents: [] })
    const { item, torrents } = await torrentioSearch(q)
    return NextResponse.json({ item, torrents })
  } catch (err) {
    return NextResponse.json({ torrents: [], error: (err as Error).message }, { status: 200 })
  }
}
