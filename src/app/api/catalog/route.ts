import { NextRequest, NextResponse } from 'next/server'
import { cineCatalog, tvmazeBrowse } from '@/lib/server/providers'
import type { MetaItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/catalog?type=movie|series|anime&genre=&skip=&sort=top|imdbRating|year&source=cinemeta|tvmaze&page=
 * Unified browse endpoint for the grid views.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = (searchParams.get('type') || 'movie') as 'movie' | 'series' | 'anime'
  const genre = searchParams.get('genre') || undefined
  const skip = parseInt(searchParams.get('skip') || '0', 10) || 0
  const sort = searchParams.get('sort') || 'top'
  const source = searchParams.get('source') || 'cinemeta'
  const page = parseInt(searchParams.get('page') || '0', 10) || 0

  try {
    if (source === 'tvmaze' && type === 'tv') {
      const items = await tvmazeBrowse(page)
      // sort by rating for a nicer grid
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0))
      return NextResponse.json({ items })
    }
    const cineType = type === 'movie' ? 'movie' : 'series' // cinemeta uses 'series', our UI uses 'tv'
    const genreResolved = type === 'anime' && !genre ? 'Anime' : genre
    const items: MetaItem[] = await cineCatalog(cineType, { genre: genreResolved, skip, sort })
    if (type === 'anime') items.forEach((i) => (i.kind = 'anime'))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'provider failed', items: [] }, { status: 502 })
  }
}
