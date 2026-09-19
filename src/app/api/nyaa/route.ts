import { NextRequest, NextResponse } from 'next/server'
import { nyaaSearch, nyaaLatest } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nyaa?q=&sort=seeders|date   — anime torrents from Nyaa RSS
 * GET /api/nyaa?latest=1               — newest Nyaa uploads (live "new episode" feed)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const latest = searchParams.get('latest')
  const q = searchParams.get('q') || ''
  const sort = (searchParams.get('sort') || 'seeders') as 'seeders' | 'date'
  try {
    if (latest && !q) {
      const items = await nyaaLatest()
      return NextResponse.json({ items })
    }
    if (!q) return NextResponse.json({ items: [] })
    const items = await nyaaSearch(q, { sort })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
