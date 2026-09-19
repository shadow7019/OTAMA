/**
 * TorrentGalaxy (TGx) provider — HTML scraping, best-effort.
 *
 * TorrentGalaxy has no API; the main domain (torrentgalaxy.to) sits behind
 * aggressive Cloudflare and rotates domains (also seen: .mx, .pro, tgx.rs).
 * Strategy mirrors 1337x: a static mirror list unioned with the live proxy
 * list Torrends.to maintains, first reachable mirror wins.
 *
 * Layout (search page /torrents.php?search={q}):
 *   <div class="tgxtablerow txlight"> …
 *     <a href="/torrent/{id}/{Title-slug}" title="…">title</a>
 *     <span …><b>{seeds}</b></span> / <span …><b>{leechers}</b></span>
 *     size cell contains e.g. "1.46 GB"
 *   </div>
 *
 * The list page has NO magnet — detail pages carry href="magnet:?…", resolved
 * for the top rows and cached 24 h. All mirrors failing → empty result (the
 * aggregator rows from Torrentio still include TGx content elsewhere).
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, decodeEntities, detectQuality, detectCodecFromName, cached } from './providers'
import { torrendsMirrorsFor } from './torrends'

const STATIC_MIRRORS = [
  'https://torrentgalaxy.to',
  'https://torrentgalaxy.mx',
  'https://tgx.rs',
  'https://torrentgalaxy.pro',
  'https://tgx.unblockninja.com',
]

const globalState = globalThis as unknown as { __otamaTgxMirror?: string | null }

async function mirrorCandidates(): Promise<string[]> {
  const proxyList = await torrendsMirrorsFor('torrentgalaxy')
  const good = globalState.__otamaTgxMirror
  const all = [...STATIC_MIRRORS, ...proxyList]
  const ordered = good ? [good, ...all.filter((m) => m !== good)] : all
  return [...new Set(ordered.map((m) => m.trim().replace(/^http:\/\//, 'https://').replace(/\/+$/, '')))]
}

async function tgxGet(path: string, timeoutMs = 10_000, validate?: (html: string) => boolean): Promise<{ html: string; mirror: string }> {
  let lastErr: unknown
  for (const mirror of await mirrorCandidates()) {
    try {
      const html = await cfGetText(`${mirror}${path}`, timeoutMs)
      if (!html || html.length < 500) throw new Error('empty page')
      if (/Just a moment|cf-challenge|challenge-platform/i.test(html.slice(0, 3000))) {
        throw new Error('cloudflare challenge')
      }
      if (!/torrentgalaxy|tgx|torrent/i.test(html.slice(0, 2500))) throw new Error('unexpected content')
      if (validate && !validate(html)) throw new Error('page failed validation')
      globalState.__otamaTgxMirror = mirror
      return { html, mirror }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`TorrentGalaxy unreachable from all mirrors (${(lastErr as Error)?.message || 'unknown error'})`)
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

interface TgxRow {
  detailPath: string
  detailUrl: string
  name: string
  seeds: number
  leechers: number
  size: string
  sizeBytes: number
}

/** Parse the tgxtablerow blocks of a TorrentGalaxy search page. */
export function parseTgxRows(html: string, mirror: string): TgxRow[] {
  const rows: TgxRow[] = []
  const seen = new Set<string>()
  const divRe = /<div[^>]*class="[^"]*tgxtablerow[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*tgxtablerow|<\/div>\s*<\/div>\s*<\/div>|\s*<\/section>|\s*$)/gi
  let m: RegExpExecArray | null
  while ((m = divRe.exec(html))) {
    const block = m[1]
    const linkM = /<a[^>]+href="(\/torrent\/(\d+)\/[^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!linkM) continue
    const detailPath = linkM[1]
    const id = linkM[2]
    if (seen.has(id)) continue
    seen.add(id)
    const name = linkM[3] ? decodeEntities(linkM[3]).trim() : stripTags(linkM[4] || '')
    if (!name) continue
    // seed/leech cells carry <b>N</b>; pick by order with attr hints when present
    const bolds = [...block.matchAll(/<b>(\d+)<\/b>/gi)].map((b) => parseInt(b[1], 10))
    const seedHint = /seed[^>]*>\s*<b>(\d+)<\/b>/i.exec(block) || /<b>(\d+)<\/b>[^<]*<span[^>]*>[^<]*seed/i.exec(block)
    const seeds = seedHint ? parseInt(seedHint[1], 10) : (bolds.length > 0 ? bolds[0] : 0)
    const leechers = bolds.length > 1 ? bolds[1] : 0
    const sizeM = /([\d.]+)\s*(B|KB|MB|GB|TB)\b/i.exec(block)
    rows.push({
      detailPath,
      detailUrl: `${mirror}${detailPath}`,
      name,
      seeds,
      leechers,
      size: sizeM ? `${sizeM[1]} ${sizeM[2].toUpperCase()}` : '',
      sizeBytes: sizeM ? sizeToBytes(sizeM[1], sizeM[2]) : 0,
    })
  }
  return rows
}

function hashFromMagnet(magnet: string): string | null {
  const m = /urn:btih:([a-z0-9]+)/i.exec(magnet)
  return m ? m[1].toLowerCase() : null
}

/** Resolve the magnet from a detail page (cached 24h). */
async function tgxMagnet(detailPath: string): Promise<string | null> {
  return cached(`tgx:m:${detailPath}`, 24 * 60 * 60_000, async () => {
    const { html } = await tgxGet(detailPath, 12_000, (h) => /magnet:\?xt=urn:btih:/i.test(h))
    const mag = /href="(magnet:\?xt=urn:btih:[^"]+)"/i.exec(html)
      || /"(magnet:\?xt=urn:btih:[^"]+)"/i.exec(html)
    return mag ? decodeEntities(mag[1]) : null
  })
}

/** Search TorrentGalaxy; resolves magnets for the top rows. Empty (not throw) when all mirrors fail. */
export async function tgxSearch(q: string, opts: { resolve?: number } = {}): Promise<TorrentOption[]> {
  const encoded = encodeURIComponent(q).replace(/%20/g, '+')
  const { html, mirror } = await tgxGet(`/torrents.php?search=${encoded}`, 10_000, (h) => h.includes('/torrent/'))
  const rows = parseTgxRows(html, mirror)
  const head = rows.slice(0, opts.resolve ?? 8)
  const magnets = await Promise.allSettled(head.map((r) => tgxMagnet(r.detailPath)))
  const out: TorrentOption[] = []
  head.forEach((r, i) => {
    const st = magnets[i]
    const magnet = st.status === 'fulfilled' ? st.value : null
    if (!magnet) return
    out.push({
      hash: hashFromMagnet(magnet) || '',
      title: r.name,
      quality: detectQuality(r.name),
      codec: detectCodecFromName(r.name),
      size: r.size,
      sizeBytes: r.sizeBytes,
      seeds: r.seeds,
      leechers: r.leechers,
      provider: 'torrentgalaxy',
      source: magnet,
      detailUrl: r.detailUrl,
    })
  })
  return out.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))
}
