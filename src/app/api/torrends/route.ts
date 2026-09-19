import { NextRequest, NextResponse } from 'next/server'
import { torrendsDirectory, siteSearchUrl, torrendsSites, type TorrendsSite } from '@/lib/server/torrends'
import { leetxSearch } from '@/lib/server/leetx'
import { nyaaSearch } from '@/lib/server/providers'
import type { TorrentOption } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/torrends                     — curated site directory (search UI)
 * GET /api/torrends?q=&site=1337x|nyaa-si — in-app parsed search on a site
 * GET /api/torrends?q=&site=<other>     — external search URL for that site
 *
 * The aggregate all-sites view of Torrends is client-side Google CSE and is
 * intentionally not scraped; OTAMA's /api/search covers aggregation instead.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const site = (searchParams.get('site') || '').trim()

  // Directory mode (default)
  if (!q && !site) {
    try {
      const sites = await torrendsDirectory()
      return NextResponse.json({ sites })
    } catch (err) {
      console.error('[torrends] directory error:', (err as Error).message)
      return NextResponse.json({ sites: [], error: (err as Error).message }, { status: 502 })
    }
  }

  if (!q || !site) {
    return NextResponse.json({ error: 'missing q or site' }, { status: 400 })
  }

  try {
    // In-app parsed search for sites with a known format
    if (site === '1337x') {
      const items = await leetxSearch(q, { category: 'movies', resolve: 8 })
      return NextResponse.json({ items, parsed: true, site })
    }
    if (site === 'nyaa-si') {
      const items = await nyaaSearch(q)
      return NextResponse.json({ items, parsed: true, site })
    }

    // Everything else: hand back a direct search link (UI opens it externally)
    const sites = await torrendsSites()
    const found: TorrendsSite | undefined = sites.find((s) => s.name === site)
    const externalUrl = found ? siteSearchUrl(found, q) : null
    if (!externalUrl) {
      return NextResponse.json({ items: [], externalUrl: null, error: 'site has no search template' })
    }
    return NextResponse.json({ items: [] as TorrentOption[], externalUrl, site })
  } catch (err) {
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
