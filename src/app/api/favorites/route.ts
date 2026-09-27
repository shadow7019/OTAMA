import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Favorites — STRICTLY per-account. Every query is scoped by the session user.
 */

/** GET /api/favorites — this account's favorites */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  try {
    const favorites = await db.favorite.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ favorites })
  } catch (err) {
    // ALWAYS answer JSON — never a plain-text 500 ("Unexpected token").
    return NextResponse.json({ favorites: [], error: (err as Error).message }, { status: 500 })
  }
}

/** POST /api/favorites — add or update a favorite for this account */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  try {
    const body = await req.json()
    if (!body.kind || !body.refId || !body.title) {
      return NextResponse.json({ error: 'kind, refId, title required' }, { status: 400 })
    }
    const favorite = await db.favorite.upsert({
      where: { userId_kind_refId: { userId: auth.user.id, kind: body.kind, refId: String(body.refId) } },
      update: {
        title: body.title,
        year: body.year ?? null,
        poster: body.poster ?? null,
        rating: body.rating ?? null,
        metaJson: body.meta ? JSON.stringify(body.meta) : null,
      },
      create: {
        kind: body.kind,
        refId: String(body.refId),
        title: body.title,
        year: body.year ?? null,
        poster: body.poster ?? null,
        rating: body.rating ?? null,
        metaJson: body.meta ? JSON.stringify(body.meta) : null,
        userId: auth.user.id,
      },
    })
    return NextResponse.json({ favorite })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** DELETE /api/favorites?kind=&refId= — remove from this account's favorites */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.res) return auth.res
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind')
  const refId = searchParams.get('refId')
  if (!kind || !refId) return NextResponse.json({ error: 'kind, refId required' }, { status: 400 })
  try {
    await db.favorite.deleteMany({ where: { userId: auth.user.id, kind, refId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
