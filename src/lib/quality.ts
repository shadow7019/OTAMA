/**
 * Shared torrent-quality helpers (pure functions — safe on client AND server).
 *
 * Categorises releases into resolution buckets so streaming links can be
 * grouped and filtered the way users think: 4K → 1440p → 1080p → 720p →
 * 480p/SD → Other. Detection scans both the provider-supplied quality tag
 * and the raw release name (many providers tag "WEB-DL"/"BluRay" instead of
 * the resolution, or embed "1920x1080").
 */

export type QualityBucket = '2160p' | '1440p' | '1080p' | '720p' | '480p' | 'other'

/** Display order, best first. */
export const QUALITY_BUCKETS: QualityBucket[] = ['2160p', '1440p', '1080p', '720p', '480p', 'other']

interface BucketMeta {
  /** full section label */
  label: string
  /** short chip label */
  short: string
  /** badge tone (tailwind classes) */
  badge: string
  /** chip active tone (tailwind classes) */
  chip: string
}

export const BUCKET_META: Record<QualityBucket, BucketMeta> = {
  '2160p': {
    label: '4K Ultra HD',
    short: '4K',
    badge: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
    chip: 'bg-violet-500 text-white border-violet-400',
  },
  '1440p': {
    label: '1440p QHD',
    short: '1440p',
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
    chip: 'bg-fuchsia-500 text-white border-fuchsia-400',
  },
  '1080p': {
    label: '1080p Full HD',
    short: '1080p',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    chip: 'bg-emerald-500 text-white border-emerald-400',
  },
  '720p': {
    label: '720p HD',
    short: '720p',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
    chip: 'bg-teal-500 text-white border-teal-400',
  },
  '480p': {
    label: '480p / SD',
    short: 'SD',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    chip: 'bg-amber-500 text-black border-amber-400',
  },
  other: {
    label: 'Other / unknown',
    short: 'Other',
    badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40',
    chip: 'bg-zinc-500 text-white border-zinc-400',
  },
}

/** Pure resolution patterns — 2160p/4k/uhd, 1440p, 1080p/i, 720p, 576/540/480/360p, FHD/HD. */
const RES_RE = /\b(2160p|1440p|1080p|1080i|720p|576p|540p|480p|360p|4k|uhd|qhd|fhd)\b/i
/** Width×height patterns (e.g. 1920x1080, 3840x2160). */
const WXH_RE = /\b(?:3840|2560|1920|1280|854|852|640)\s*[x×]\s*(2160|1440|1080|720|480|360)\b/i

/** Resolution-only detection from any text (release name, quality tag…). */
export function detectResolution(text: string): string | undefined {
  if (!text) return undefined
  const wxh = WXH_RE.exec(text)
  if (wxh) {
    const h = parseInt(wxh[1], 10)
    if (h >= 2000) return '2160p'
    if (h >= 1400) return '1440p'
    if (h >= 1000) return '1080p'
    if (h >= 700) return '720p'
    if (h >= 460) return '480p'
    return undefined
  }
  const m = RES_RE.exec(text)
  if (!m) return undefined
  const q = m[1].toLowerCase()
  if (q === '4k' || q === 'uhd' || q === '2160p') return '2160p'
  if (q === 'qhd' || q === '1440p') return '1440p'
  if (q === 'fhd' || q === '1080p' || q === '1080i') return '1080p'
  if (q === '720p') return '720p'
  if (q === '576p' || q === '540p' || q === '480p') return '480p'
  return undefined // 360p and anything exotic → 'other' bucket
}

/** Which bucket a torrent belongs in — checks the quality tag AND the raw name. */
export function bucketOf(t: { quality?: string; title?: string }): QualityBucket {
  const res = detectResolution(`${t.quality || ''} ${t.title || ''}`)
  if (res) return res as QualityBucket
  return 'other'
}

/** Buckets present in a list, best first. */
export function groupTorrentsByQuality<T extends { quality?: string; title?: string }>(
  torrents: T[],
): { bucket: QualityBucket; torrents: T[] }[] {
  const map = new Map<QualityBucket, T[]>()
  for (const t of torrents) {
    const b = bucketOf(t)
    const list = map.get(b) || []
    list.push(t)
    map.set(b, list)
  }
  return QUALITY_BUCKETS.filter((b) => map.has(b)).map((bucket) => ({ bucket, torrents: map.get(bucket)! }))
}
