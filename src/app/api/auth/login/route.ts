import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, sessionCookieOptions, SESSION_COOKIE, validateCredentials, verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** POST /api/auth/login — sign in { username, password }; sets the session cookie. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const v = validateCredentials(body?.username, body?.password)
    if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })

    const user = await db.user.findUnique({ where: { username: v.username } })
    // Same generic message for unknown user and wrong password (no enumeration).
    if (!user || !verifyPassword(v.password, user.passwordHash)) {
      return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 })
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json({ user: { id: user.id, username: user.username } })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(req, Math.floor((expiresAt.getTime() - Date.now()) / 1000)))
    return res
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Sign-in failed' }, { status: 500 })
  }
}
