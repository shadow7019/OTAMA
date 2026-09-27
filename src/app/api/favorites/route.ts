import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Favorites — one shared bucket (the login system was removed).
 */

/** GET /api/favorites — saved items */
export async function GET() {
  try {
    const favorites = await db.favorite.findMany({
      where: { userId: 'local' },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ favorites })
  } catch (err) {
    // ALWAYS answer JSON — never a plain-text 500 ("Unexpected token").
    return NextResponse.json({ favorites: [], error: (err as Error).message }, { status: 500 })
  }
}

/** POST /api/favorites — add or update a favorite */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.kind || !body.refId || !body.title) {
      return NextResponse.json({ error: 'kind, refId, title required' }, { status: 400 })
    }
    const favorite = await db.favorite.upsert({
      where: { userId_kind_refId: { userId: 'local', kind: body.kind, refId: String(body.refId) } },
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
        userId: 'local',
      },
    })
    return NextResponse.json({ favorite })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** DELETE /api/favorites?kind=&refId= — remove a saved item */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind')
  const refId = searchParams.get('refId')
  if (!kind || !refId) return NextResponse.json({ error: 'kind, refId required' }, { status: 400 })
  try {
    await db.favorite.deleteMany({ where: { userId: 'local', kind, refId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
