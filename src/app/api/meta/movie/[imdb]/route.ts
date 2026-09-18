import { NextRequest, NextResponse } from 'next/server'
import { cineMeta, findMovieTorrents } from '@/lib/server/providers'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/meta/movie/:imdb — full movie detail + torrent options (TPB keyed by imdb) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  try {
    const item = await cineMeta('movie', imdb)
    let torrents: TorrentOption[] = []
    try {
      torrents = await findMovieTorrents(imdb, item.title, item.year)
    } catch { /* torrents optional */ }
    return NextResponse.json({ item, torrents })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'movie not found' }, { status: 404 })
  }
}
