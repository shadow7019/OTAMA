import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tmdbStatus, invalidateTmdbKey } from '@/lib/server/tmdb'

export const dynamic = 'force-dynamic'

/**
 * TMDB key management for the Settings dialog.
 *   GET    /api/tmdb          → { configured, mode?, source?, valid? }
 *   POST   /api/tmdb { key }  → validate + store (DB Setting `tmdb_api_key`)
 *   DELETE /api/tmdb          → remove stored key (falls back to env / keyless)
 */
export async function GET() {
  try {
    return NextResponse.json(await tmdbStatus())
  } catch (err) {
    return NextResponse.json({ configured: false, error: (err as Error).message }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { key?: string }
    const key = (body.key || '').trim()
    if (!key) return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    if (key.length < 20) {
      return NextResponse.json(
        { error: 'That does not look like a TMDB key. Use your v3 API key (32 chars) or v4 Read Access Token (eyJ…).' },
        { status: 400 },
      )
    }

    // Validate against TMDB before storing anything.
    const headers: Record<string, string> = { Accept: 'application/json' }
    const url = key.startsWith('eyJ')
      ? 'https://api.themoviedb.org/3/configuration'
      : `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    let ok = false
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers })
      ok = res.ok
    } catch {
      ok = false
    } finally {
      clearTimeout(t)
    }
    if (!ok) {
      return NextResponse.json({ error: 'TMDB rejected this key (check it in your TMDB account → Settings → API).' }, { status: 400 })
    }

    await db.setting.upsert({
      where: { key: 'tmdb_api_key' },
      create: { key: 'tmdb_api_key', value: key },
      update: { key: 'tmdb_api_key', value: key },
    })
    invalidateTmdbKey()
    return NextResponse.json(await tmdbStatus())
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'failed to save key' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await db.setting.deleteMany({ where: { key: 'tmdb_api_key' } })
    invalidateTmdbKey()
    return NextResponse.json({ configured: false })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'failed to remove key' }, { status: 500 })
  }
}
