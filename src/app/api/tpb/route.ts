import { NextRequest, NextResponse } from 'next/server'
import { apibaySearch } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/** GET /api/tpb?q=&cat= — raw ThePirateBay (apibay) search. Empty q returns latest uploads. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const cat = searchParams.get('cat') || ''
  try {
    const items = await apibaySearch(q, cat)
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
