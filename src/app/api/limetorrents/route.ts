import { NextRequest, NextResponse } from 'next/server'
import { limeSearch, LIME_CATEGORIES } from '@/lib/server/limetorrents'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** GET /api/limetorrents?q=&cat=&page= — LimeTorrents search (hash-ready rows). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const catRaw = searchParams.get('cat') || 'all'
  const cat = (LIME_CATEGORIES as readonly string[]).includes(catRaw) ? catRaw : 'all'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  if (!q) return NextResponse.json({ items: [] as TorrentOption[] })
  try {
    const items = await limeSearch(q, { category: cat as 'all', page })
    return NextResponse.json({ items: items.slice(0, 40) })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 200 })
  }
}
