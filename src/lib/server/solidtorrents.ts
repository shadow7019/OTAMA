/**
 * SolidTorrents provider — keyless JSON search API over a DHT-backed index.
 *
 *   GET https://solidtorrents.to/api/v1/search?q=<query>&page=<1-based>
 *
 * Response: { success, results: [{ infohash, title, size (bytes), category,
 * subCategory, seeders, leechers, verified, createdAt }] } — the infohash is
 * ready to feed the engine directly (no magnet scraping needed).
 *
 * Reachability note: the apex domain 301s to a www/edge host, so requests
 * follow redirects (cfGetText passes curl -L).
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, detectQuality, detectCodecFromName, humanSize, cached } from './providers'

const BASES = ['https://solidtorrents.to', 'https://www.solidtorrents.to']

interface SolidRow {
  infohash?: string
  title?: string
  size?: number | string
  category?: number
  subCategory?: number
  seeders?: number
  leechers?: number
  verified?: boolean
  createdAt?: string
  page?: string
}

/** SolidTorrents category ids — 1 is video (movies+tv). */
export const SOLID_VIDEO_CATEGORY = 1

export function normalizeSolidRow(row: SolidRow): TorrentOption | null {
  if (!row.infohash || !row.title) return null
  const hash = row.infohash.toLowerCase()
  const sizeBytes = typeof row.size === 'string' ? parseInt(row.size, 10) || 0 : row.size || 0
  return {
    hash,
    title: row.title,
    quality: detectQuality(row.title),
    codec: detectCodecFromName(row.title),
    size: humanSize(sizeBytes),
    sizeBytes,
    seeds: row.seeders || 0,
    leechers: row.leechers || 0,
    provider: 'solidtorrents',
    source: hash,
    date: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
    detailUrl: row.page ? `https://solidtorrents.to${row.page}` : undefined,
    status: row.verified ? 'trusted' : undefined,
  }
}

export async function solidSearch(
  q: string,
  opts: { page?: number; videoOnly?: boolean; sort?: 'seeders' | 'date' } = {},
): Promise<TorrentOption[]> {
  if (!q.trim()) return []
  const key = `solid:${q}|${opts.page || 0}|${opts.videoOnly ? 1 : 0}|${opts.sort || ''}`
  return cached(key, 3 * 60_000, async () => {
    const params = new URLSearchParams({
      q,
      page: String((opts.page || 0) + 1),
      ...(opts.sort === 'date' ? { sort: 'date' } : {}),
    })
    let lastErr: unknown
    for (const base of BASES) {
      try {
        const text = await cfGetText(`${base}/api/v1/search?${params}`, 12_000)
        if (text.trimStart().startsWith('<')) throw new Error('solidtorrents returned HTML')
        const data = JSON.parse(text) as { success?: boolean; results?: SolidRow[] }
        let rows = data.results || []
        if (opts.videoOnly) rows = rows.filter((r) => r.category === SOLID_VIDEO_CATEGORY)
        return rows.map(normalizeSolidRow).filter((t): t is TorrentOption => !!t)
      } catch (err) {
        lastErr = err
      }
    }
    throw new Error(`SolidTorrents unreachable (${(lastErr as Error)?.message || 'unknown'})`)
  })
}
