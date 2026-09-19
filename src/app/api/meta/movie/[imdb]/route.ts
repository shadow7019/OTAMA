import { NextRequest, NextResponse } from 'next/server'
import { cineMeta, findMovieTorrents } from '@/lib/server/providers'
import { tmdbEnhanceByImdb, tmdbStatus } from '@/lib/server/tmdb'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/meta/movie/:imdb — full movie detail + torrent options (TPB keyed by imdb).
 *  When TMDB is configured, backdrop/summary/genres are upgraded from TMDB. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  try {
    const item = await cineMeta('movie', imdb)

    // Optional TMDB enhancement (never blocks the response on failure)
    try {
      const status = await tmdbStatus()
      if (status.configured && status.valid) {
        const enh = await tmdbEnhanceByImdb(imdb)
        if (enh) {
          item.backdrop = enh.backdrop || item.backdrop
          item.summary = item.summary || enh.summary
          item.runtime = item.runtime || enh.runtime
          if (!item.genres?.length && enh.genres?.length) item.genres = enh.genres
        }
      }
    } catch { /* enhancement optional */ }

    let torrents: TorrentOption[] = []
    try {
      torrents = await findMovieTorrents(imdb, item.title, item.year)
    } catch { /* torrents optional */ }
    return NextResponse.json({ item, torrents })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'movie not found' }, { status: 404 })
  }
}
