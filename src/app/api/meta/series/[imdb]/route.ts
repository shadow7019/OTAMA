import { NextRequest, NextResponse } from 'next/server'
import { seriesDetail } from '@/lib/server/providers'
import { tmdbEnhanceByImdb, tmdbStatus } from '@/lib/server/tmdb'

export const dynamic = 'force-dynamic'

/** GET /api/meta/series/:imdb — series detail incl. seasons/episodes (TVMaze, Cinemeta fallback).
 *  When TMDB is configured, the backdrop/summary are upgraded from TMDB. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  try {
    const detail = await seriesDetail(imdb)
    try {
      const status = await tmdbStatus()
      if (status.configured && status.valid) {
        const enh = await tmdbEnhanceByImdb(imdb)
        if (enh) {
          detail.item.backdrop = enh.backdrop || detail.item.backdrop
          detail.item.summary = detail.item.summary || enh.summary
        }
      }
    } catch { /* enhancement optional */ }
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'series not found' }, { status: 404 })
  }
}
