/**
 * RARBG-archive provider — therarbg.to (the official RARBG continuation site).
 *
 * The original rarbg.to shut down in May 2023; therarbg.to runs the revived
 * index with a proper JSON endpoint:
 *
 *   GET /get-posts/keyword:{query}/?format=json&page={n}
 *   → { links: {next}, page_size, count, total, results: [...] }
 *
 * Result row shape (v1, verified live):
 *   { pk: "96ecdb", n: "<release name>", a: 1789806086 (added unix),
 *     c: "Movies" | "TV" | "Anime" | ..., s: 330196582 (bytes),
 *     t: "/009/xxx.png" (thumb), u: "uploader", se: 33, le: 30,
 *     h: "6D7ECDF5..." (INFOHASH — no detail fetch needed), tg: ["AAC"] }
 *
 * Because the infohash ships with every row this is the cheapest high-quality
 * movie/TV source after YTS — RARBG releases were famously well-encoded x264.
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetJson, detectQuality, detectCodecFromName } from './providers'

const BASES = ['https://therarbg.to', 'https://therarbg.org']

const VIDEO_CATS = new Set(['Movies', 'TV', 'Anime', 'Movies/TV', 'Episodes', 'HD - Movies', 'HD - TV shows', 'Documentaries'])

interface RarbgRow {
  pk?: string
  n?: string
  a?: number
  c?: string
  s?: number
  u?: string
  se?: number
  le?: number
  h?: string | null
  tg?: string[]
}

export interface RarbgOptions {
  page?: number
  /** only rows whose category is a video category (default true) */
  videoOnly?: boolean
}

function optionFromRow(r: RarbgRow): TorrentOption | null {
  if (!r.h || !r.n) return null
  const hash = r.h.toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(hash)) return null
  const cat = r.c || ''
  return {
    hash,
    title: r.n,
    quality: detectQuality(r.n),
    codec: detectCodecFromName(r.n),
    size: r.s ? humanBytes(r.s) : undefined,
    sizeBytes: r.s || 0,
    seeds: r.se || 0,
    leechers: r.le || 0,
    provider: 'rarbg',
    source: hash,
    date: r.a ? new Date(r.a * 1000).toISOString() : undefined,
    sourceSite: cat ? `RARBG · ${cat}` : 'RARBG',
    detailUrl: `https://therarbg.to/post/${encodeURIComponent(r.pk || hash)}`,
  }
}

function humanBytes(n?: number): string {
  if (!n || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** Search the RARBG archive. Falls back through mirrors; throws only when all fail. */
export async function rarbgSearch(q: string, opts: RarbgOptions = {}): Promise<TorrentOption[]> {
  const page = Math.max(1, opts.page || 1)
  // the site's own form is GET /get-posts/ with a "keywords" field — the
  // /get-posts/keyword:X/ path style ignores the term server-side
  const path = `/get-posts/?keywords=${encodeURIComponent(q)}&format=json&page=${page}`
  let lastErr: unknown = null
  for (const base of BASES) {
    try {
      const data = await cfGetJson<{ results?: RarbgRow[] }>(`${base}${path}`, 12_000)
      const rows = data.results || []
      const mapped = rows
        .map(optionFromRow)
        .filter((t): t is TorrentOption => !!t)
      return opts.videoOnly === false
        ? mapped
        : mapped.filter((t) => {
            // the category string rides along in sourceSite ("RARBG · Movies")
            const cat = (t.sourceSite || '').split('·')[1]?.trim() || ''
            return VIDEO_CATS.has(cat)
          })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RARBG archive unreachable')
}

/** Same search without the video-category filter (Torrents hub raw view). */
export async function rarbgSearchAll(q: string, page = 1): Promise<TorrentOption[]> {
  return rarbgSearch(q, { page, videoOnly: false })
}
