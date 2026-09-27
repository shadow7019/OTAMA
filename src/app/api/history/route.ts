import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Watch history — STRICTLY per-account. Every query is scoped by the session
 * user: no account can read or mutate another account's history.
 */

/** GET /api/history — this account's watch history ordered by recency */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  try {
    const history = await db.watchHistory.findMany({
      where: { userId: auth.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    })
    return NextResponse.json({ history })
  } catch (err) {
    // ALWAYS answer JSON — an uncaught error here becomes a plain-text 500,
    // which the client surfaces as the cryptic "Unexpected token" message.
    return NextResponse.json({ history: [], error: (err as Error).message }, { status: 500 })
  }
}

/** POST /api/history — upsert playback position for this account */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  try {
    const body = await req.json()
    if (!body.refId || !body.infoHash || typeof body.position !== 'number') {
      return NextResponse.json({ error: 'refId, infoHash, position required' }, { status: 400 })
    }
    const entry = await db.watchHistory.upsert({
      where: { userId_refId: { userId: auth.user.id, refId: String(body.refId) } },
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
        userId: auth.user.id,
      },
    })
    return NextResponse.json({ entry })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** DELETE /api/history?refId=<id|all> — remove one entry, or wipe this account's history */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  const { searchParams } = new URL(req.url)
  const refId = searchParams.get('refId')
  if (!refId) return NextResponse.json({ error: 'refId required' }, { status: 400 })
  try {
    if (refId === 'all') await db.watchHistory.deleteMany({ where: { userId: auth.user.id } })
    else await db.watchHistory.deleteMany({ where: { userId: auth.user.id, refId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
