import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — delete the current session and clear the cookie. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    try {
      await db.session.deleteMany({ where: { token } })
    } catch { /* ignore */ }
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(req, 0))
  return res
}
