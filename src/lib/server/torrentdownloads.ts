/**
 * TorrentDownloads provider — HTML scraping.
 *
 * Main domain torrentdownloads.pro (mirror: torrentdownload.info is linked
 * from the site itself). Search page layout (verified live):
 *
 *   <div class="grey_bar3">
 *     <p><a href="/torrent/{numericId}/{slug}" title="View torrent info : {full name}">…</a></p>
 *     <span class="health">…</span>
 *     <span>{leech}</span><span>{seeds}</span><span>{size}</span>   ← header: leech/seeds/size
 *   </div>
 *
 * The numeric id in the URL is NOT the infohash, so magnets are resolved from
 * the detail page (contains href="magnet:?xt=urn:btih:{40hex}") and cached 24 h.
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, decodeEntities, detectQuality, detectCodecFromName, cached } from './providers'

const STATIC_MIRRORS = [
  'https://torrentdownloads.pro',
  'https://www.torrentdownload.info',
  'https://torrentdownloads.unblockninja.com',
]

const globalState = globalThis as unknown as { __otamaTdMirror?: string | null }

async function mirrorCandidates(): Promise<string[]> {
  const good = globalState.__otamaTdMirror
  const ordered = good ? [good, ...STATIC_MIRRORS.filter((m) => m !== good)] : STATIC_MIRRORS
  return [...new Set(ordered.map((m) => m.replace(/\/+$/, '')))]
}

async function tdGet(path: string, timeoutMs = 12_000, validate?: (html: string) => boolean): Promise<{ html: string; mirror: string }> {
  let lastErr: unknown
  for (const mirror of await mirrorCandidates()) {
    try {
      const html = await cfGetText(`${mirror}${path}`, timeoutMs)
      if (!html || html.length < 500) throw new Error('empty page')
      if (/Just a moment|cf-challenge|challenge-platform/i.test(html.slice(0, 3000))) {
        throw new Error('cloudflare challenge')
      }
      if (!/torrent/i.test(html.slice(0, 2500))) throw new Error('unexpected content')
      if (validate && !validate(html)) throw new Error('page failed validation')
      globalState.__otamaTdMirror = mirror
      return { html, mirror }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`TorrentDownloads unreachable from all mirrors (${(lastErr as Error)?.message || 'unknown error'})`)
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

interface TdRow {
  detailPath: string
  detailUrl: string
  name: string
  seeds: number
  leechers: number
  size: string
  sizeBytes: number
}

/** Parse the grey_bar3 rows of a TorrentDownloads search page. */
export function parseTdRows(html: string, mirror: string): TdRow[] {
  const rows: TdRow[] = []
  const seen = new Set<string>()
  const divRe = /<div class="grey_bar3[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="grey_bar3|<\/div>|$)/gi
  let m: RegExpExecArray | null
  while ((m = divRe.exec(html))) {
    const block = m[1]
    // skip the header bar (contains <b>leech</b> etc.)
    if (/<b>leech<\/b>|<b>seeds<\/b>/i.test(block)) continue
    const linkM = /<a href="(\/torrent\/(\d+)\/[^"]*)"[^>]*title="View torrent info : ([^"]*)"/i.exec(block)
      || /<a href="(\/torrent\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!linkM) continue
    const detailPath = linkM[1]
    const id = linkM[2]
    if (seen.has(id)) continue
    seen.add(id)
    const name = linkM[3] ? decodeEntities(linkM[3]).trim() : stripTags(linkM[4] || '')
    if (!name) continue
    // spans after health: [leech, seeds, size] — but sponsored rows vary, so
    // find the size ONLY inside a dedicated span ("7.49 GB" etc.), never by a
    // loose block-wide regex (which used to match "5 Brand…" → "5 B").
    const spans = [...block.matchAll(/<span(?:\s[^>]*)?>([\s\S]*?)<\/span>/gi)]
      .map((s) => stripTags(s[1]))
    const sizeIn = (txt: string | undefined) => txt && /^[\d.]+\s*(B|KB|MB|GB|TB)$/i.test(txt.trim()) ? txt.trim() : null
    const sizeText = [...spans].reverse().map(sizeIn).find(Boolean) || ''
    const nums = spans.filter((s) => /^\d+$/.test(s)).map((s) => parseInt(s, 10))
    if (!sizeText || nums.length < 2) continue // sponsored/noise row
    const leech = nums[0]
    const seeds = nums[1]
    const sizeMatch = /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(sizeText)
    rows.push({
      detailPath,
      detailUrl: `${mirror}${detailPath}`,
      name,
      seeds,
      leechers: leech,
      size: sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}` : sizeText,
      sizeBytes: sizeMatch ? sizeToBytes(sizeMatch[1], sizeMatch[2]) : 0,
    })
  }
  return rows
}

function hashFromMagnet(magnet: string): string | null {
  const m = /urn:btih:([a-z0-9]+)/i.exec(magnet)
  return m ? m[1].toLowerCase() : null
}

/** Resolve the magnet/infoHash from a detail page (cached 24h). */
async function tdMagnet(detailPath: string): Promise<string | null> {
  return cached(`td:m:${detailPath}`, 24 * 60 * 60_000, async () => {
    const { html } = await tdGet(detailPath, 12_000, (h) => /magnet:\?xt=urn:btih:/i.test(h))
    const mag = /href="(magnet:\?xt=urn:btih:[^"]+)"/i.exec(html)
      || /"(magnet:\?xt=urn:btih:[^"]+)"/i.exec(html)
    return mag ? decodeEntities(mag[1]) : null
  })
}

/** Search TorrentDownloads. Detail pages resolve magnets for the top rows. */
export async function torrentDownloadsSearch(q: string, opts: { resolve?: number } = {}): Promise<TorrentOption[]> {
  const encoded = encodeURIComponent(q).replace(/%20/g, '+')
  const { html, mirror } = await tdGet(`/search/?search=${encoded}`, 12_000, (h) => h.includes('/torrent/'))
  const rows = parseTdRows(html, mirror)
  const head = rows.slice(0, opts.resolve ?? 8)
  const magnets = await Promise.allSettled(head.map((r) => tdMagnet(r.detailPath)))
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
      provider: 'torrentdownloads',
      source: magnet,
      detailUrl: r.detailUrl,
    })
  })
  return out.sort((a, b) => (b.seeds || 0) - (a.seeds || 0))
}
