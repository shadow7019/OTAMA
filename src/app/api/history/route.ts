import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/history — watch history ordered by recency */
export async function GET() {
  const history = await db.watchHistory.findMany({ orderBy: { updatedAt: 'desc' }, take: 40 })
  return NextResponse.json({ history })
}

/** POST /api/history — upsert playback position */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.refId || !body.infoHash || typeof body.position !== 'number') {
      return NextResponse.json({ error: 'refId, infoHash, position required' }, { status: 400 })
    }
    const entry = await db.watchHistory.upsert({
      where: { refId: String(body.refId) },
      update: {
        title: body.title,
        poster: body.poster ?? null,
        kind: body.kind || 'movie',
        infoHash: String(body.infoHash),
        fileIndex: body.fileIndex ?? 0,
        position: body.position,
        duration: body.duration ?? null,
      },
      create: {
        refId: String(body.refId),
        title: body.title || 'Untitled',
        poster: body.poster ?? null,
        kind: body.kind || 'movie',
        infoHash: String(body.infoHash),
        fileIndex: body.fileIndex ?? 0,
        position: body.position,
        duration: body.duration ?? null,
      },
    })
    return NextResponse.json({ entry })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** DELETE /api/history?refId= (or all with refId=all) */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const refId = searchParams.get('refId')
  if (!refId) return NextResponse.json({ error: 'refId required' }, { status: 400 })
  if (refId === 'all') await db.watchHistory.deleteMany({})
  else await db.watchHistory.deleteMany({ where: { refId } })
  return NextResponse.json({ ok: true })
}
