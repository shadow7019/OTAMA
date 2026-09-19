import { NextRequest, NextResponse } from 'next/server'
import { rarbgSearchAll } from '@/lib/server/rarbg'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/rarbg?q=&page= — RARBG archive (therarbg.to) raw search. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  if (!q) return NextResponse.json({ items: [] as TorrentOption[] })
  try {
    const items = await rarbgSearchAll(q, page)
    return NextResponse.json({ items: items.slice(0, 50) })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 200 })
  }
}
