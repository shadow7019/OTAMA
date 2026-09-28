import { NextRequest, NextResponse } from 'next/server'
import { seriesDetail } from '@/lib/server/providers'
import { tmdbEnhanceByImdb, tmdbSeriesSeasons, tmdbStatus } from '@/lib/server/tmdb'
import { withTimeout } from '@/lib/server/with-timeout'

export const dynamic = 'force-dynamic'

/** GET /api/meta/series/:imdb — series detail incl. seasons/episodes (TVMaze, Cinemeta fallback).
 *  When TMDB is configured, the backdrop/summary are upgraded from TMDB.
 *  `?anime=1` — build seasons from TMDB instead of TVMaze: TVMaze entries for
 *  long-running anime freeze at the original series finale (Bleach S16 = 2011),
 *  hiding the CURRENT sequel seasons (Thousand-Year Blood War, 2022→) that
 *  TMDB tracks inside the same show entry. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  const anime = new URL(req.url).searchParams.get('anime') === '1'
  try {
    const detail = await seriesDetail(imdb)
    try {
      const status = await tmdbStatus()
      if (status.configured && status.valid) {
        // Time-budgeted: TMDB enhance = find + detail, seasons = N+1 calls —
        // on a cold cache these could hold the response far past the hosting
        // edge timeout; on timeout the TVMaze seasons already in `detail` win.
        const enh = await withTimeout(tmdbEnhanceByImdb(imdb), 8_000, 'TMDB enhance')
        if (enh) {
          detail.item.backdrop = enh.backdrop || detail.item.backdrop
          detail.item.summary = detail.item.summary || enh.summary
          if (anime && enh.tmdbId) {
            const tmdbSeasons = await withTimeout(tmdbSeriesSeasons(enh.tmdbId), 12_000, 'TMDB seasons')
            if (tmdbSeasons.length) detail.seasons = tmdbSeasons
          }
        }
      }
    } catch { /* enhancement optional */ }
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'series not found' }, { status: 404 })
  }
}
