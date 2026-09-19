/**
 * LimeTorrents provider — HTML scraping (no official JSON API).
 *
 * Mirrors: limetorrents.lol / .fun / .info / .pro (same engine, rotating
 * domains). First reachable mirror is remembered for the process lifetime.
 *
 * Layout (verified live, table2 on /search/{cat}/{q}/{order}/):
 *   <td class="tdleft"><div class="tt-name">
 *     <a href="http://itorrents.net/torrent/{INFOHASH}.torrent?title=…" class="csprite_dl14"></a>
 *     <a href="/{Title}-torrent-{id}.html">Release name</a></div>…
 *   </td><td class="tdnormal">Added - in Movies</td>
 *   <td class="tdnormal">6.54 GB</td><td class="tdseed">63</td><td class="tdleech">11</td>…
 *
 * The itorrents.net link embeds the FULL INFOHASH in every row — the hash is
 * available without touching detail pages (unlike 1337x). Search paths:
 *   /search/all/{q}/          /search/movies/{q}/      /search/tv/{q}/
 *   /search/anime/{q}/        /search/games/{q}/       /search/music/{q}/
 *   /search/apps/{q}/         /search/other/{q}/
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, decodeEntities, detectQuality, detectCodecFromName } from './providers'

const STATIC_MIRRORS = [
  // .fun serves search pages directly; .lol 301-redirects there (and fetch()
  // sometimes fails on the redirect chain), so .fun is the primary mirror.
  'https://www.limetorrents.fun',
  'https://www.limetorrents.lol',
  'https://limetorrents.info',
  'https://www.limetorrents.pro',
  'https://limetorrents.unblockninja.com',
]

const globalState = globalThis as unknown as { __otamaLimeMirror?: string | null }

export const LIME_CATEGORIES = ['all', 'movies', 'tv', 'anime', 'games', 'music', 'apps', 'other'] as const
export type LimeCategory = (typeof LIME_CATEGORIES)[number]

async function mirrorCandidates(): Promise<string[]> {
  const good = globalState.__otamaLimeMirror
  const ordered = good ? [good, ...STATIC_MIRRORS.filter((m) => m !== good)] : STATIC_MIRRORS
  return [...new Set(ordered.map((m) => m.replace(/\/+$/, '')))]
}

async function limeGet(path: string, timeoutMs = 12_000, validate?: (html: string) => boolean): Promise<{ html: string; mirror: string }> {
  let lastErr: unknown
  for (const mirror of await mirrorCandidates()) {
    try {
      const html = await cfGetText(`${mirror}${path}`, timeoutMs)
      if (!html || html.length < 500) throw new Error('empty page')
      if (/Just a moment|cf-challenge|challenge-platform/i.test(html.slice(0, 3000))) {
        throw new Error('cloudflare challenge')
      }
      if (!/limetorrents|torrent/i.test(html.slice(0, 2500))) throw new Error('unexpected content')
      if (validate && !validate(html)) throw new Error('page failed validation')
      globalState.__otamaLimeMirror = mirror
      return { html, mirror }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`LimeTorrents unreachable from all mirrors (${(lastErr as Error)?.message || 'unknown error'})`)
}

/* ------------------------------ parsing ------------------------------ */

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function sizeToBytes(value: string, unit: string): number {
  const n = parseFloat(value)
  if (isNaN(n)) return 0
  const mult: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return Math.round(n * (mult[unit.toUpperCase()] || 1))
}

interface LimeRow {
  hash: string
  name: string
  detailUrl: string
  seeds: number
  leechers: number
  size: string
  sizeBytes: number
  category?: string
}

/** Parse the results table of a LimeTorrents search page. */
export function parseLimeRows(html: string, mirror: string): LimeRow[] {
  const rows: LimeRow[] = []
  // results live in <table class="table2"> (table1/table3 are ads)
  const tables = [...html.matchAll(/<table[^>]*class="table2"[^>]*>[\s\S]*?<\/table>/gi)]
  const body = tables.length ? tables.map((t) => t[0]).join('') : html
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRe.exec(body))) {
    const row = m[1]
    if (!row.includes('torrent-')) continue
    // infohash from the itorrents.net download link (present in every row)
    const hashM = /itorrents\.net\/torrent\/([A-Za-z0-9]{32,40})\.torrent/i.exec(row)
    const titleM = /<a href="(\/[^"]*-torrent-\d+\.html)"[^>]*>([\s\S]*?)<\/a>/i.exec(row)
    if (!hashM || !titleM) continue
    const hash = hashM[1].toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(hash)) continue
    const name = stripTags(titleM[2])
    if (!name) continue

    const seedM = /<td class="tdseed"[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    const leechM = /<td class="tdleech"[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    const sizeM = /<td class="tdnormal"[^>]*>([\s\S]*?)<\/td>\s*<td class="tdseed"/i.exec(row)
      || /([\d.]+\s*(?:B|KB|MB|GB|TB))<\/td>\s*<td class="tdseed"/i.exec(row)
    const catM = /- in ([^<]+)<\/a>/i.exec(row) || /in\s+([A-Za-z ]+)</i.exec(row)
    const sizeText = sizeM ? stripTags(sizeM[1]) : ''
    const sizeMatch = /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(sizeText)

    rows.push({
      hash,
      name,
      detailUrl: `${mirror}${titleM[1]}`,
      seeds: parseInt(stripTags(seedM?.[1] || ''), 10) || 0,
      leechers: parseInt(stripTags(leechM?.[1] || ''), 10) || 0,
      size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : sizeText,
      sizeBytes: sizeMatch ? sizeToBytes(sizeMatch[1], sizeMatch[2]) : 0,
      category: catM ? stripTags(catM[1]) : undefined,
    })
  }
  return rows
}

function optionFromRow(r: LimeRow): TorrentOption {
  return {
    hash: r.hash,
    title: r.name,
    quality: detectQuality(r.name),
    codec: detectCodecFromName(r.name),
    size: r.size,
    sizeBytes: r.sizeBytes,
    seeds: r.seeds,
    leechers: r.leechers,
    provider: 'limetorrents',
    source: r.hash,
    detailUrl: r.detailUrl,
  }
}

export interface LimeOptions {
  page?: number // 1-based
  category?: LimeCategory
}

/** Search LimeTorrents. Rows carry the infohash inline — nothing else to resolve. */
export async function limeSearch(q: string, opts: LimeOptions = {}): Promise<TorrentOption[]> {
  const cat = opts.category && LIME_CATEGORIES.includes(opts.category) ? opts.category : 'all'
  const page = Math.max(1, opts.page || 1)
  const encoded = encodeURIComponent(q).replace(/%20/g, '+')
  // page 1: /search/{cat}/{q}/          (the /order/1/ suffix redirects home)
  // page N: /search/{cat}/{q}/{N}/      (plain numeric pagination)
  const path = page > 1
    ? `/search/${cat}/${encoded}/${page}/`
    : `/search/${cat}/${encoded}/`
  const { html, mirror } = await limeGet(path, 12_000, (h) => h.includes('itorrents.net') || h.includes('-torrent-'))
  return parseLimeRows(html, mirror).map(optionFromRow)
}

/** TV helper for the episode fallback chain. */
export async function limeSearchTv(q: string): Promise<TorrentOption[]> {
  return limeSearch(q, { category: 'tv' })
}
