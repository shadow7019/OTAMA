import { NextRequest, NextResponse } from 'next/server'
import { leetxSearch, leetxTop, LEETX_CATEGORIES, type LeetxCategory } from '@/lib/server/leetx'

export const dynamic = 'force-dynamic'

/**
 * GET /api/1337x?q=&cat=&page=   — search 1337x (mirrors auto-negotiated)
 * GET /api/1337x?top=cat         — top-100 browse per category
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const cat = (searchParams.get('cat') || 'movies') as LeetxCategory
  const page = parseInt(searchParams.get('page') || '0', 10) || 0
  const top = (searchParams.get('top') || '').trim() as LeetxCategory | ''

  try {
    if (top && LEETX_CATEGORIES.includes(top)) {
      const items = await leetxTop(top)
      return NextResponse.json({ items })
    }
    if (!q) return NextResponse.json({ items: [], error: 'missing q' }, { status: 400 })
    const category = LEETX_CATEGORIES.includes(cat) ? cat : undefined
    const items = await leetxSearch(q, { page, category })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
