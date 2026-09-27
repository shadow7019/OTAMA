/**
 * OTAMA account auth — zero-dependency credentials + sessions.
 *
 * Design:
 *  - Passwords: Node crypto scrypt (salted, timing-safe compare). No native deps.
 *  - Sessions: random 256-bit opaque token in an httpOnly cookie; the token is
 *    looked up in the Session table (30-day expiry). Nothing about the user is
 *    stored client-side, so "sign out everywhere" = delete session rows.
 *  - Isolation: every history/favorite query is scoped by userId server-side —
 *    one account can never read or mutate another account's watch data.
 *
 * Cookie flags: httpOnly + SameSite=Lax always; Secure automatically when the
 * request arrived over https (x-forwarded-proto, set by the gateway/proxies) so
 * plain-HTTP LAN deployments keep working.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'otama_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface PublicUser {
  id: string
  username: string
}

/* ------------------------------ passwords ------------------------------ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `s2:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [tag, salt, hash] = stored.split(':')
    if (tag !== 's2' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/* ------------------------------ cookies ------------------------------ */

function isSecureRequest(req: NextRequest): boolean {
  if ((req.headers.get('x-forwarded-proto') || '').includes('https')) return true
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function sessionCookieOptions(req: NextRequest, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
    secure: isSecureRequest(req),
  }
}

/* ------------------------------ sessions ------------------------------ */

/** Create a DB session row and return the opaque token for the cookie. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { token, userId, expiresAt } })
  // opportunistic cleanup of long-expired sessions (cheap on SQLite)
  try {
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } })
  } catch { /* non-fatal */ }
  return { token, expiresAt }
}

/** Resolve the signed-in user from the session cookie (null when anonymous). */
export async function userFromRequest(req: NextRequest): Promise<PublicUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session) return null
    if (session.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
      return null
    }
    return { id: session.user.id, username: session.user.username }
  } catch {
    return null
  }
}

/**
 * Require a signed-in user in a route handler.
 * Returns either { user } or { res } — a ready-to-return JSON 401.
 * NEVER throw: every OTAMA API answers JSON so the client never sees
 * "Unexpected token" HTML/plain-text errors.
 */
export async function requireUser(
  req: NextRequest,
): Promise<{ user: PublicUser; res?: undefined } | { user?: undefined; res: NextResponse }> {
  const user = await userFromRequest(req)
  if (!user) {
    return {
      res: NextResponse.json(
        { error: 'Sign in to use this feature', code: 'AUTH_REQUIRED' },
        { status: 401 },
      ),
    }
  }
  return { user }
}

/** Username/password validation shared by register + login. */
export function validateCredentials(username: unknown, password: unknown): { username: string; password: string } | { error: string } {
  if (typeof username !== 'string' || typeof password !== 'string') return { error: 'Username and password are required' }
  const name = username.trim()
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(name)) {
    return { error: 'Username must be 3–24 characters (letters, numbers, _ . - only)' }
  }
  if (password.length < 6) return { error: 'Password must be at least 6 characters' }
  if (password.length > 200) return { error: 'Password is too long' }
  return { username: name, password }
}
