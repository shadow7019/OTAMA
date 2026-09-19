import { NextRequest, NextResponse } from 'next/server'
import { apibaySearch, apibayBrowse } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tpb — ThePirateBay (apibay).
 *  ?q=&cat=  → search (empty q is allowed but apibay has no "latest" listing)
 *  ?browse=1&cat=201|205|207|208|209 → category browse, newest uploads sorted by seeds
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const cat = searchParams.get('cat') || ''
  const browse = searchParams.get('browse') === '1'
  try {
    const items = browse ? await apibayBrowse(cat) : await apibaySearch(q, cat)
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
