import { NextRequest, NextResponse } from 'next/server'
import { torrentDownloadsSearch } from '@/lib/server/torrentdownloads'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/torrentdownloads?q= — TorrentDownloads search (magnets from detail pages). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ items: [] as TorrentOption[] })
  try {
    const items = await torrentDownloadsSearch(q, { resolve: 10 })
    return NextResponse.json({ items: items.slice(0, 30) })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 200 })
  }
}
