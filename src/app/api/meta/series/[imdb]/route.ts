import { NextRequest, NextResponse } from 'next/server'
import { seriesDetail } from '@/lib/server/providers'

export const dynamic = 'force-dynamic'

/** GET /api/meta/series/:imdb — series detail incl. seasons/episodes (TVMaze, Cinemeta fallback) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ imdb: string }> }) {
  const { imdb } = await params
  try {
    const detail = await seriesDetail(imdb)
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'series not found' }, { status: 404 })
  }
}
