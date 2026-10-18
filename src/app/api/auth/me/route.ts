import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me — { user: { username } | null } for the client auth gate. */
export async function GET(req: NextRequest) {
  try {
    const user = await userFromRequest(req)
    return NextResponse.json({ user: user ? { id: user.id, username: user.username } : null })
  } catch {
    return NextResponse.json({ user: null })
  }
}
