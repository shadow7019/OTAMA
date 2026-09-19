import { NextRequest, NextResponse } from 'next/server'
import { solidSearch } from '@/lib/server/solidtorrents'

export const dynamic = 'force-dynamic'

/**
 * GET /api/solid?q=&page= — SolidTorrents (DHT index) search.
 * Returns TorrentOption[] ready to play (infohash is the magnet).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const page = parseInt(searchParams.get('page') || '0', 10) || 0
  if (!q) return NextResponse.json({ items: [] })
  try {
    const items = await solidSearch(q, { page })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 200 })
  }
}
