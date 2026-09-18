import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/favorites — list all favorites */
export async function GET() {
  const favorites = await db.favorite.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ favorites })
}

/** POST /api/favorites — add or update a favorite */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.kind || !body.refId || !body.title) {
      return NextResponse.json({ error: 'kind, refId, title required' }, { status: 400 })
    }
    const favorite = await db.favorite.upsert({
      where: { kind_refId: { kind: body.kind, refId: String(body.refId) } },
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
      },
    })
    return NextResponse.json({ favorite })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** DELETE /api/favorites?kind=&refId= */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind')
  const refId = searchParams.get('refId')
  if (!kind || !refId) return NextResponse.json({ error: 'kind, refId required' }, { status: 400 })
  await db.favorite.deleteMany({ where: { kind, refId } })
  return NextResponse.json({ ok: true })
}
