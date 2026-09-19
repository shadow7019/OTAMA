import { NextRequest, NextResponse } from 'next/server'
import { tgxSearch } from '@/lib/server/torrentgalaxy'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/torrentgalaxy?q= — TorrentGalaxy search (mirror chain, best-effort).
 * Returns an empty list (never a hard error) when every mirror is unreachable,
 * so the Torrents hub stays usable and other sources keep working.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ items: [] as TorrentOption[] })
  try {
    const items = await tgxSearch(q, { resolve: 10 })
    return NextResponse.json({ items: items.slice(0, 30) })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 200 })
  }
}
