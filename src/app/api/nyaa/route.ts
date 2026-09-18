import { NextRequest, NextResponse } from 'next/server'
import { nyaaSearch } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/** GET /api/nyaa?q=&sort=seeders|date — anime torrents from Nyaa RSS */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const sort = (searchParams.get('sort') || 'seeders') as 'seeders' | 'date'
  if (!q) return NextResponse.json({ items: [] })
  try {
    const items = await nyaaSearch(q, { sort })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
