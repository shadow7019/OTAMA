/**
 * Torrends.to provider — the largest torrent-site directory (700+ sites) with
 * live proxy lists and per-site search-URL templates.
 *
 * Two roles in OTAMA:
 *  1. Directory UI  — one-click search across dozens of sites ("more content").
 *  2. Mirror resolver — fresh working mirrors for the 1337x/YTS/Nyaa clients,
 *     so scrapers still find a reachable host when the main domain is blocked.
 *
 * The aggregate "search all sites at once" view of Torrends is a client-side
 * Google CSE widget and cannot be scraped server-side; per-site search is
 * fully supported (and OTAMA's own multi-provider search covers aggregation).
 *
 * Endpoint: POST https://search.torrends.to/ajax.php  body: action=getSites
 */
import { UA, cfGetText, cached } from './providers'

const AJAX_URL = 'https://search.torrends.to/ajax.php'

export interface TorrendsSite {
  id?: number
  name: string
  title: string
  permalink?: string
  url?: string
  url_alt?: string
  proxies?: { url?: string; official?: boolean }[]
  search_url?: string
  private_tracker?: boolean
  language?: string
}

/** POST form data, curl-first (Cloudflare-safe) with fetch fallback. */
async function postForm(url: string, body: string, timeoutMs = 15_000): Promise<string> {
  const maxTime = Math.ceil(timeoutMs / 1000)
  try {
    const { execFile } = await import('node:child_process')
    const out = await new Promise<string>((resolve, reject) => {
      execFile(
        'curl',
        [
          '-s', '--compressed', '--max-time', String(maxTime),
          '-A', UA,
          '-H', 'Content-Type: application/x-www-form-urlencoded',
          '-H', 'X-Requested-With: XMLHttpRequest',
          '--data', body,
          url,
        ],
        { timeout: (maxTime + 2) * 1000, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout)),
      )
    })
    if (out) return out
  } catch { /* curl missing or failed -> fetch fallback */ }
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

/** Full site directory (713 entries). Cached 1h — mirrors change weekly at most. */
export async function torrendsSites(): Promise<TorrendsSite[]> {
  return cached('torrends:sites', 60 * 60_000, async () => {
    const text = await postForm(AJAX_URL, 'action=getSites')
    const sites = JSON.parse(text) as TorrendsSite[]
    if (!Array.isArray(sites) || sites.length === 0) throw new Error('bad Torrends directory payload')
    return sites
  })
}

/** All candidate mirrors (main, alt, proxies) for a site, https-normalised. */
export async function torrendsMirrorsFor(name: string): Promise<string[]> {
  try {
    const sites = await torrendsSites()
    const site = sites.find((s) => s.name === name)
    if (!site) return []
    const list = [site.url, site.url_alt, ...(site.proxies || []).map((p) => p.url)]
      .filter((u): u is string => !!u)
    return [...new Set(list.map(normalizeBase))]
  } catch {
    return []
  }
}

function normalizeBase(u: string): string {
  return u.trim().replace(/^http:\/\//, 'https://').replace(/\/+$/, '')
}

/** Build a search URL for a site; null when the site exposes no template. */
export function siteSearchUrl(site: TorrendsSite, q: string): string | null {
  if (!site.search_url || !site.search_url.includes('@@s@@')) return null
  const base = site.url || site.url_alt || site.proxies?.find((p) => p.url)?.url
  if (!base) return null
  const path = site.search_url.replace('@@s@@', encodeURIComponent(q)).replace(/^\/+/, '')
  return `${normalizeBase(base)}/${path}`
}

export interface TorrendsDirectoryEntry {
  name: string
  title: string
  url: string
  /** full URL with @@s@@ placeholder for the client to substitute */
  searchTemplate: string | null
  proxies: string[]
}

/** Curated, video/general-focused directory for the UI (searchable sites first). */
const CURATED_ORDER = [
  '1337x', 'pirate-bay-search', 'yts', 'torrentgalaxy', 'limetorrents', 'eztv',
  'rarbg', 'kickass-torrents', 'torrentproject', 'idope', 'bt4g', 'solidtorrents',
  'btdig', 'nyaa-si', 'torlock', 'torrentfunk', 'zoogle', 'monova',
  'yourbittorrent', 'glotorrents', 'snowfl', 'magnetdl', 'toorgle',
]

/**
 * Fallback search-URL templates for directory sites whose Torrends entry lacks
 * a `search_url`. Tokens: @@s@@ = encoded query, @@m@@ = lowercase-dash query
 * (magnetdl style), @F@ = first letter/dir segment (magnetdl style).
 */
const FALLBACK_SEARCH: Record<string, string> = {
  'pirate-bay-search': 'search/@@s@@/0/99/0',
  yts: 'browse-movies/@@s@@/all/all/desc/latest',
  torrentgalaxy: 'torrents.php?search=@@s@@',
  limetorrents: 'search/@@s@@/seeders/1/',
  eztv: 'search/@@s@@',
  rarbg: 'torrents.php?search=@@s@@',
  'kickass-torrents': 'usearch/@@s@@/',
  torrentproject: '?t=@@s@@',
  idope: 'torrent-list/@@s@@/',
  bt4g: 'search?q=@@s@@',
  solidtorrents: 'search?q=@@s@@',
  btdig: 'search?q=@@s@@',
  'nyaa-si': '?f=0&c=0_0&q=@@s@@',
  torlock: '@@s@@-torrents.html',
  torrentfunk: '@@s@@-torrents.html',
  zoogle: 'search?q=@@s@@',
  monova: 'search?q=@@s@@',
  yourbittorrent: '?q=@@s@@',
  glotorrents: 'search/@@s@@/seeders/1/',
  snowfl: '?q=@@s@@',
  toorgle: 'search.php?q=@@s@@',
  magnetdl: '@F@/@@m@@/',
}

export async function torrendsDirectory(q?: string, limit = 48): Promise<TorrendsDirectoryEntry[]> {
  const sites = await torrendsSites()
  const rank = (name: string) => {
    const i = CURATED_ORDER.indexOf(name)
    return i === -1 ? CURATED_ORDER.length + 100 : i
  }
  return sites
    // private_tracker is "0"/"1" as a STRING — beware truthiness ("0" is truthy)
    .filter((s) => s.name && (s.url || s.proxies?.some((p) => p.url)) && s.private_tracker !== '1' && (s as { private_tracker?: string | boolean }).private_tracker !== true)
    .map((s) => {
      const base = s.url || s.url_alt || s.proxies?.find((p) => p.url)?.url || ''
      let template: string | null = null
      if (s.search_url && s.search_url.includes('@@s@@')) {
        template = `${normalizeBase(base)}/${s.search_url.replace(/^\/+/, '')}`
      } else if (FALLBACK_SEARCH[s.name]) {
        template = `${normalizeBase(base)}/${FALLBACK_SEARCH[s.name]}`
      }
      return {
        name: s.name,
        title: s.title || s.name,
        url: normalizeBase(base),
        searchTemplate: template,
        proxies: (s.proxies || []).map((p) => p.url).filter((u): u is string => !!u).slice(0, 3),
      }
    })
    .filter((e) => e.url)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.title.localeCompare(b.title))
    .slice(0, limit)
}
