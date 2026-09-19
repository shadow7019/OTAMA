/**
 * Torrentio provider — the Stremio-community torrent aggregator.
 *
 * One endpoint, a dozen source sites: Torrentio indexes YTS, EZTV, RARBG
 * (archived), 1337x, ThePirateBay, Kickasstorrents, TorrentGalaxy, MagnetDL,
 * TorrentDB, MediaSearch, NyaaSi and HDBits and serves ready-to-stream
 * results keyed by IMDb id — each entry carries the info hash AND the exact
 * video file index (fileIdx), so the engine plays the right file first try.
 *
 *   GET /stream/movie/tt0145487.json
 *   GET /stream/series/tt0903747:1:1.json        (season:episode)
 *   GET /stream/series/tt0903747.json            (whole show: packs + episodes)
 *
 * No API key. Answers fast JSON; results include seeds/size/source-site.
 */
import type { TorrentOption } from '@/lib/types'
import { cfGetText, detectQuality, detectCodecFromName, cached } from './providers'

const BASES = ['https://torrentio.strem.fun']

interface TorrentioStream {
  name?: string
  title?: string
  infoHash?: string
  fileIdx?: number
  behaviorHints?: { filename?: string; bingeGroup?: string }
  sources?: string[]
}

/** '50.09 GB' / '1.4GB' / '700 MB' -> bytes (0 when unparseable). */
export function sizeToBytes(s?: string): number {
  const m = /([\d.]+)\s*([KMGT]i?B)/i.exec(s || '')
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase().replace('IB', 'B')
  const mult = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : unit === 'GB' ? 1024 ** 3 : unit === 'TB' ? 1024 ** 4 : 0
  return Math.round(n * mult) || 0
}

/** '👤 195' / '👤 1.2K' -> seeds count. */
function parseSeeds(s?: string): number {
  const m = /👤\s*([\d.,]+)\s*([KM])?/i.exec(s || '')
  if (!m) return 0
  let n = parseFloat(m[1].replace(/,/g, ''))
  if (m[2]?.toUpperCase() === 'K') n *= 1000
  if (m[2]?.toUpperCase() === 'M') n *= 1_000_000
  return Math.round(n) || 0
}

function parseTorrentioStream(s: TorrentioStream): TorrentOption | null {
  if (!s.infoHash) return null
  const raw = (s.title || '').trim()
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const release = lines[0] || s.infoHash
  const meta = lines.slice(1).join(' · ')
  const sizeStr = /💾\s*([\d.]+\s*[KMGT]i?B)/i.exec(meta)?.[1]
  const site = /⚙️\s*([^\n·]+)/i.exec(meta)?.[1]?.trim()
  const seeds = parseSeeds(meta)
  // quality label lives on the 2nd line of `name` ("Torrentio\n4k HDR")
  const nameLabel = (s.name || '').split('\n')[1] || ''
  const quality = detectQuality(`${nameLabel} ${release}`) ||
    (/\b4k\b/i.test(nameLabel) ? '2160p' : undefined)
  const hash = s.infoHash.toLowerCase()
  return {
    hash,
    title: release,
    quality,
    codec: detectCodecFromName(`${release} ${s.behaviorHints?.filename || ''}`),
    size: sizeStr || undefined,
    sizeBytes: sizeToBytes(sizeStr) || 0,
    seeds,
    leechers: 0,
    provider: 'torrentio',
    source: hash,
    fileIndex: typeof s.fileIdx === 'number' ? s.fileIdx : undefined,
    sourceSite: site || undefined,
  }
}

/**
 * Streams for a movie or series.
 * kind='series': season+episode given -> that episode; both omitted -> whole
 * show (season packs + individual episodes). Adds episode numbers parsed from
 * the release name when absent so the UI can filter.
 */
export async function torrentioStreams(
  kind: 'movie' | 'series',
  imdbId: string,
  season?: number,
  episode?: number,
): Promise<TorrentOption[]> {
  const id = imdbId.replace(/^(tt)/, 'tt').toLowerCase()
  const key = `torrentio:${kind}:${id}:${season ?? ''}:${episode ?? ''}`
  return cached(key, 5 * 60_000, async () => {
    const path =
      kind === 'movie'
        ? `/stream/movie/${id}.json`
        : `/stream/series/${id}${season ? `:${season}${episode ? `:${episode}` : ''}` : ''}.json`
    let lastErr: unknown
    for (const base of BASES) {
      try {
        const text = await cfGetText(`${base}${path}`, 15_000)
        if (text.trimStart().startsWith('<')) throw new Error('torrentio returned HTML')
        const data = JSON.parse(text) as { streams?: TorrentioStream[] }
        const list = (data.streams || [])
          .map(parseTorrentioStream)
          .filter((t): t is TorrentOption => !!t)
        return annotateEpisodes(list)
      } catch (err) {
        lastErr = err
      }
    }
    throw new Error(`Torrentio unreachable (${(lastErr as Error)?.message || 'unknown'})`)
  })
}

/**
 * Torrentio whole-show responses mix season packs with single episodes and do
 * not tag them. Parse SxxEyy from the release name (incl. multi-episode
 * "S01E02-E03" / "S01E02E03") so the UI can match an episode exactly.
 */
function annotateEpisodes(list: TorrentOption[]): TorrentOption[] {
  return list.map((t) => {
    if (t.season != null && t.episode != null) return t
    const m = /\bS(\d{1,2})E(\d{1,3})(?:[-E]?E?(\d{1,3}))?\b/i.exec(t.title)
    if (!m) return t
    return {
      ...t,
      season: parseInt(m[1], 10),
      episode: parseInt(m[2], 10),
    }
  })
}

/**
 * Free-text search over Torrentio: resolves the query to an IMDb id via the
 * Cinemeta catalog (movies first, then series) and returns the matched item
 * plus its streams. Used by the Torrents-hub "Torrentio" tab.
 */
export async function torrentioSearch(q: string): Promise<{ item?: import('@/lib/types').MetaItem; torrents: TorrentOption[] }> {
  const { cineCatalog } = await import('./providers')
  const movies = await cineCatalog('movie', { search: q, sort: 'top' }).catch(() => [])
  for (const m of movies.slice(0, 3)) {
    if (!m.imdbId) continue
    const torrents = await torrentioStreams('movie', m.imdbId).catch(() => [])
    if (torrents.length) return { item: m, torrents }
  }
  const series = await cineCatalog('series', { search: q, sort: 'top' }).catch(() => [])
  for (const s of series.slice(0, 2)) {
    if (!s.imdbId) continue
    const torrents = await torrentioStreams('series', s.imdbId).catch(() => [])
    if (torrents.length) return { item: s, torrents }
  }
  return { torrents: [] }
}
