import { NextRequest, NextResponse } from 'next/server'
import { apibaySearch } from '@/lib/server/providers'
import { leetxSearch } from '@/lib/server/leetx'
import { solidSearch } from '@/lib/server/solidtorrents'
import { rarbgSearch } from '@/lib/server/rarbg'
import { limeSearch } from '@/lib/server/limetorrents'
import { torrentDownloadsSearch } from '@/lib/server/torrentdownloads'
import { tgxSearch } from '@/lib/server/torrentgalaxy'
import { withTimeout } from '@/lib/server/with-timeout'
import type { TorrentOption, TpbItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search/torrents?q= — TORRENT-SITE phase of unified search.
 *
 * Split out of /api/search (see that file for the full story): torrent sites
 * are the slowest, least reliable part of a search — 1337x / TorrentDownloads
 * / TGX each resolve ~8-10 detail pages per query, and any one of them hanging
 * used to hold the ENTIRE search response until the hosting edge killed it.
 *
 * The client fires this in parallel with the metadata query; if anything here
 * fails or times out, ONLY the torrent tabs degrade (with a retry affordance)
 * — Movies / TV / Anime TMDB results stay untouched.
 */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (!q) {
    return NextResponse.json({ tpb: [], leetx: [], solid: [], more: [] })
  }

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { return fallback }
  }
  const cap = <T>(p: Promise<T>, ms: number): Promise<T> => withTimeout(p, ms, 'torrent site')

  const [tpb, leetx, solid, rarbg, lime, td, tgx] = await Promise.all([
    safe(cap(apibaySearch(q), 14_000), [] as TpbItem[]),
    safe(cap(leetxSearch(q, { resolve: 8 }), 14_000), [] as TorrentOption[]),
    safe(cap(solidSearch(q), 14_000), [] as TorrentOption[]),
    safe(cap(rarbgSearch(q), 14_000), [] as TorrentOption[]),
    safe(cap(limeSearch(q), 14_000), [] as TorrentOption[]),
    safe(cap(torrentDownloadsSearch(q, { resolve: 8 }), 14_000), [] as TorrentOption[]),
    safe(cap(tgxSearch(q, { resolve: 8 }), 14_000), [] as TorrentOption[]),
  ])

  // new-site fan-out merged into one "More torrent sites" tab (deduped by hash)
  const moreSeen = new Set<string>()
  const more: TorrentOption[] = []
  for (const t of [...rarbg, ...lime, ...td, ...tgx]) {
    const key = (t.hash || t.source || '').toLowerCase()
    if (!key || moreSeen.has(key)) continue
    moreSeen.add(key)
    more.push(t)
  }
  more.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))

  return NextResponse.json({
    tpb: tpb.slice(0, 30),
    leetx: leetx.slice(0, 20),
    solid: solid.slice(0, 20),
    more: more.slice(0, 30),
  })
}
