import { NextRequest, NextResponse } from 'next/server'
import { cineMeta, findMovieTorrents } from '@/lib/server/providers'
import { tmdbEnhanceByImdb, tmdbStatus } from '@/lib/server/tmdb'
import { withTimeout } from '@/lib/server/with-timeout'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/meta/movie/:imdb — full movie detail + torrent options (TPB keyed by imdb).
 *  When TMDB is configured, backdrop/summary/genres are upgraded from TMDB.
 *  Every fan-out call is time-budgeted (see with-timeout.ts): a cold cache on
 *  a slow network used to hold this route for 30s+ — long enough for the
 *  hosting edge to kill the connection, which the phone reports as
 *  "Cannot reach the OTAMA server". Now the worst case is ~15s and typical
 *  detail opens stay sub-second once warm. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  try {
    const item = await withTimeout(cineMeta('movie', imdb), 15_000, 'metadata')

    // Optional TMDB enhancement (never blocks the response on failure)
    let originalTitle: string | undefined
    try {
      const status = await tmdbStatus()
      if (status.configured && status.valid) {
        const enh = await withTimeout(tmdbEnhanceByImdb(imdb), 8_000, 'TMDB enhance')
        if (enh) {
          item.backdrop = enh.backdrop || item.backdrop
          item.summary = item.summary || enh.summary
          item.runtime = item.runtime || enh.runtime
          if (!item.genres?.length && enh.genres?.length) item.genres = enh.genres
          // Cinemeta misses the year for unreleased titles — TMDB knows it,
          // and the torrent query ladder needs it (e.g. "The Vvaan").
          if (!item.year && enh.year) item.year = enh.year
          originalTitle = enh.originalTitle
        }
      }
    } catch { /* enhancement optional */ }

    let torrents: TorrentOption[] = []
    try {
      torrents = await withTimeout(findMovieTorrents(imdb, item.title, item.year, { originalTitle }), 20_000, 'torrent lookup')
    } catch { /* torrents optional */ }
    return NextResponse.json({ item, torrents })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'movie not found' }, { status: 404 })
  }
}
