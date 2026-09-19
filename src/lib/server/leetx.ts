/**
 * 1337x provider — HTML scraping (no public JSON API exists).
 *
 * Mirrors: the main domain plus community proxies, unioned with the live
 * proxy list Torrends.to maintains for 1337x — so a reachable host is found
 * even when the main site is blocked or challenged. The first working mirror
 * is remembered for the process lifetime.
 *
 * Layout notes (stable for years):
 *   search:      /search/{q}/{page}/            category: /category-search/{q}/{cat}/{page}/
 *   top-100:     /top-100-movies/ …
 *   detail page: href="magnet:?xt=urn:btih:<hash>" — the search page has no hash,
 *                so the top N detail pages are resolved in parallel and cached 24h.
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, decodeEntities, detectQuality, cached } from './providers'
import { torrendsMirrorsFor } from './torrends'

const STATIC_MIRRORS = [
  'https://1337x.to',
  'https://1337x.st',
  'https://x1337x.eu',
  'https://x1337x.ws',
  'https://x1337x.se',
  'https://1337x.unblocked.win',
  'https://1337x.unblockninja.com',
]

const globalState = globalThis as unknown as { __otamaLeetxMirror?: string | null }

export const LEETX_CATEGORIES = ['movies', 'tv', 'anime', 'games', 'apps', 'music', 'documentaries', 'other'] as const
export type LeetxCategory = (typeof LEETX_CATEGORIES)[number]

const TOP_SLUGS: Record<LeetxCategory, string> = {
  movies: 'top-100-movies',
  tv: 'top-100-tv',
  anime: 'top-100-anime',
  games: 'top-100-games',
  apps: 'top-100-apps',
  music: 'top-100-music',
  documentaries: 'top-100-documentaries',
  other: 'top-100-other',
}

async function mirrorCandidates(): Promise<string[]> {
  const torrendsList = await torrendsMirrorsFor('1337x')
  const good = globalState.__otamaLeetxMirror
  const all = [...STATIC_MIRRORS, ...torrendsList]
  const ordered = good ? [good, ...all.filter((m) => m !== good)] : all
  return [...new Set(ordered.map((m) => m.trim().replace(/^http:\/\//, 'https://').replace(/\/+$/, '')))]
}

/** Fetch a 1337x path through the mirror chain; remembers the working mirror. */
async function leetxGet(path: string, timeoutMs = 12_000, validate?: (html: string) => boolean): Promise<string> {
  let lastErr: unknown
  for (const mirror of await mirrorCandidates()) {
    try {
      const html = await cfGetText(`${mirror}${path}`, timeoutMs)
      if (!html || html.length < 500) throw new Error('empty page')
      if (/Just a moment|cf-challenge|challenge-platform/i.test(html.slice(0, 3000))) {
        throw new Error('cloudflare challenge')
      }
      if (!/1337x|torrent/i.test(html.slice(0, 2000))) throw new Error('unexpected content')
      // parked domains / dead proxies serve 200 pages with no torrent links
      if (validate && !validate(html)) throw new Error('page failed validation')
      globalState.__otamaLeetxMirror = mirror
      return html
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`1337x unreachable from all mirrors (${(lastErr as Error)?.message || 'unknown error'})`)
}

/* ------------------------------ parsing ------------------------------ */

interface LeetxRow {
  detailPath: string
  detailUrl: string
  name: string
  seeds: number
  leechers: number
  size: string
  sizeBytes: number
  uploader?: string
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function cell(row: string, cls: string): string {
  // class value may be followed by more attributes (e.g. data-time on size cells)
  const re = new RegExp(`<td class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</td>`, 'i')
  const m = re.exec(row)
  return m ? m[1] : ''
}

function sizeToBytes(value: string, unit: string): number {
  const n = parseFloat(value)
  if (isNaN(n)) return 0
  const mult: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return Math.round(n * (mult[unit.toUpperCase()] || 1))
}

/** Parse the .table-list rows of a 1337x search/category/top page. */
export function parseLeetxRows(html: string, mirror: string): LeetxRow[] {
  const rows: LeetxRow[] = []
  const table = /<table[^>]*class="table-list[^"]*"[\s\S]*?<\/table>/i.exec(html)
  const body = table ? table[0] : html
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = trRe.exec(body))) {
    const row = m[1]
    // two links share the detail href (icon + title); keep the one with text
    let detailPath = ''
    let name = ''
    for (const a of row.matchAll(/<a[^>]+href="(\/torrent\/\d+\/[^"]+\/?)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = stripTags(a[2])
      if (text.length > name.length) {
        name = text
        detailPath = a[1]
      }
    }
    if (!detailPath || !name) continue
    const seeds = parseInt(stripTags(cell(row, 'coll-2')).replace(/,/g, ''), 10) || 0
    const leechers = parseInt(stripTags(cell(row, 'coll-3')).replace(/,/g, ''), 10) || 0
    const sizeText = stripTags(cell(row, 'coll-4')) // "1.4 GB"
    const sizeMatch = /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(sizeText)
    const uploader = stripTags(cell(row, 'coll-5')) || undefined
    rows.push({
      detailPath,
      detailUrl: `${mirror}${detailPath}`,
      name,
      seeds,
      leechers,
      size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : sizeText,
      sizeBytes: sizeMatch ? sizeToBytes(sizeMatch[1], sizeMatch[2]) : 0,
      uploader,
    })
  }
  return rows
}

function hashFromMagnet(magnet: string): string | null {
  const m = /urn:btih:([a-z0-9]+)/i.exec(magnet)
  return m ? m[1].toLowerCase() : null
}

/** Resolve the magnet/infoHash from a detail page (cached 24h). */
async function leetxMagnet(detailPath: string): Promise<string | null> {
  return cached(`leetx:m:${detailPath}`, 24 * 60 * 60_000, async () => {
    const html = await leetxGet(detailPath, 12_000, (h) => /magnet:\?xt=urn:btih:/i.test(h))
    const mag = /href="(magnet:\?xt=urn:btih:[^"]+)"/i.exec(html)
    return mag ? decodeEntities(mag[1]) : null
  })
}

function optionFromRow(r: LeetxRow, magnet: string | null): TorrentOption {
  const hash = magnet ? hashFromMagnet(magnet) || '' : ''
  return {
    hash,
    title: r.name,
    quality: detectQuality(r.name),
    size: r.size,
    sizeBytes: r.sizeBytes,
    seeds: r.seeds,
    leechers: r.leechers,
    provider: '1337x',
    source: magnet || '',
    detailUrl: r.detailUrl,
  }
}

export interface LeetxOptions {
  page?: number
  category?: LeetxCategory
  /** how many detail pages to resolve for magnets (default 8) */
  resolve?: number
}

/** Search 1337x. Rows whose detail page fails to resolve are dropped. */
export async function leetxSearch(q: string, opts: LeetxOptions = {}): Promise<TorrentOption[]> {
  const page = (opts.page || 0) + 1
  const cat = opts.category && LEETX_CATEGORIES.includes(opts.category) ? opts.category : null
  const encoded = encodeURIComponent(q).replace(/%20/g, '+')
  const path = cat
    ? `/category-search/${encoded}/${cat}/${page}/`
    : `/search/${encoded}/${page}/`
  const html = await leetxGet(path, 12_000, (h) => h.includes('/torrent/'))
  const rows = parseLeetxRows(html, workingMirror())
  return resolveRows(rows, opts.resolve ?? 8)
}

/** Top-100 pages per category — an easy "more catalog" browse surface. */
export async function leetxTop(category: LeetxCategory = 'movies'): Promise<TorrentOption[]> {
  const html = await leetxGet(`/${TOP_SLUGS[category] || TOP_SLUGS.movies}/`, 12_000, (h) => h.includes('/torrent/'))
  const rows = parseLeetxRows(html, workingMirror())
  return resolveRows(rows, 10)
}

function workingMirror(): string {
  return (globalState.__otamaLeetxMirror || STATIC_MIRRORS[0]).replace(/\/+$/, '')
}

async function resolveRows(rows: LeetxRow[], resolveN: number): Promise<TorrentOption[]> {
  const head = rows.slice(0, resolveN)
  const magnets = await Promise.allSettled(head.map((r) => leetxMagnet(r.detailPath)))
  const out: TorrentOption[] = []
  head.forEach((r, i) => {
    const st = magnets[i]
    if (st.status === 'fulfilled' && st.value) out.push(optionFromRow(r, st.value))
  })
  return out.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))
}
