import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, hashPassword, sessionCookieOptions, SESSION_COOKIE, validateCredentials } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/register — create an account { username, password }.
 * The FIRST account ever created adopts the pre-account-era history/favorites
 * rows (userId null) so the server owner keeps their existing list; every
 * later account starts with a clean, fully private slate.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateCredentials(body?.username, body?.password)
    if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })

    const existing = await db.user.findUnique({ where: { username: v.username } })
    if (existing) {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
    }

    const isFirstUser = (await db.user.count()) === 0
    const user = await db.user.create({
      data: { username: v.username, passwordHash: hashPassword(v.password) },
    })
    if (isFirstUser) {
      // adopt legacy rows created before accounts existed
      await db.watchHistory.updateMany({ where: { userId: null }, data: { userId: user.id } })
      await db.favorite.updateMany({ where: { userId: null }, data: { userId: user.id } })
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req, Math.floor((expiresAt.getTime() - Date.now()) / 1000)))
    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Registration failed' }, { status: 500 })
  }
}
