'use client'

import type { EngineTorrent, EngineFile, TorrentOption } from '@/lib/types'

/** The torrent engine mini-service port (behind the gateway). */
export const ENGINE_PORT = 3003

/* Desktop shell detection (Electron preload exposes window.otama). */
type OtamaBridge = { isDesktop?: boolean; enginePort?: number; version?: string; platform?: string }

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { otama?: OtamaBridge }).otama?.isDesktop
}

export function desktopEnginePort(): number {
  const p = (window as unknown as { otama?: OtamaBridge }).otama?.enginePort
  return typeof p === 'number' && p > 0 ? p : ENGINE_PORT
}

/**
 * Build an engine URL.
 *  - Web mode:   relative path + XTransformPort query (Caddy gateway routing).
 *  - Desktop:    absolute http://127.0.0.1:<enginePort> — the engine runs
 *                embedded in the Electron app, no gateway exists there.
 */
export function engineUrl(path: string, params?: Record<string, string>): string {
  if (isDesktop()) {
    const search = new URLSearchParams(params || {})
    const qs = search.toString()
    return `http://127.0.0.1:${desktopEnginePort()}${path}${qs ? `?${qs}` : ''}`
  }
  const search = new URLSearchParams({ ...(params || {}), XTransformPort: String(ENGINE_PORT) })
  return `${path}?${search.toString()}`
}

export const streamUrl = (infoHash: string, fileIndex: number) =>
  engineUrl(`/stream/${infoHash}/${fileIndex}`)

export const fileUrl = (infoHash: string, fileIndex: number) =>
  engineUrl(`/file/${infoHash}/${fileIndex}`)

export async function engineHealth(): Promise<{ ok: boolean; version?: string } | null> {
  try {
    const res = await fetch(engineUrl('/health'), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as { ok: boolean; version?: string }
  } catch {
    return null
  }
}

export async function engineList(): Promise<EngineTorrent[]> {
  try {
    const res = await fetch(engineUrl('/torrents'), { cache: 'no-store' })
    if (!res.ok) return []
    return (await res.json()) as EngineTorrent[]
  } catch {
    return []
  }
}

export async function addTorrent(opts: {
  source: string
  title?: string
  poster?: string
  refId?: string
  kind?: string
}): Promise<EngineTorrent> {
  const res = await fetch(engineUrl('/torrents'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  let data: { error?: string } & EngineTorrent
  try {
    data = await res.json()
  } catch {
    // HTML/empty body -> the engine was not reachable through the gateway
    throw new Error('Streaming engine unreachable — try reloading the page')
  }
  if (!res.ok) throw new Error(data.error || 'Failed to add torrent')
  return data
}

export async function destroyTorrent(infoHash: string, wipe = false): Promise<void> {
  await fetch(engineUrl(`/torrents/${infoHash}`, { wipe: wipe ? '1' : '0' }), { method: 'DELETE' })
}

export function bestVideoFile(t: EngineTorrent | null | undefined): EngineFile | null {
  if (!t?.files?.length) return null
  const videos = t.files.filter((f) => f.isVideo)
  if (!videos.length) return null
  return videos.reduce((a, b) => (b.length > a.length ? b : a))
}

export function guessPlayableExt(fileName?: string): string | null {
  if (!fileName) return null
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext) return null
  if (['mp4', 'm4v', 'webm'].includes(ext)) return 'ok'
  if (['mkv', 'mov'].includes(ext)) return 'maybe'
  return 'unsupported'
}

/** HEVC/x265/H.265 in a release name — browsers usually cannot decode it. */
export function isHevcName(name?: string | null): boolean {
  if (!name) return false
  return /\b(x\s?265|h\.?265|hevc)\b/i.test(name)
}

/**
 * Why will this torrent probably not play in a browser?
 * Returns null when it should play fine.
 */
export function playbackBlocker(fileName?: string | null, releaseTitle?: string | null): string | null {
  if (isHevcName(fileName) || isHevcName(releaseTitle)) {
    return 'HEVC/x265 codec — browsers cannot decode it without hardware support'
  }
  const ext = guessPlayableExt(fileName)
  if (ext === 'unsupported') return 'container format (AVI/TS/MPEG) is not supported by browsers'
  return null
}

/** Non-HEVC alternatives first, then by seed count. */
export function playableFirst(options: TorrentOption[]): TorrentOption[] {
  return [...options].sort((a, b) => {
    const ha = isHevcName(a.title) || a.codec === 'hevc' ? 1 : 0
    const hb = isHevcName(b.title) || b.codec === 'hevc' ? 1 : 0
    if (ha !== hb) return ha - hb
    return (b.seeds || 0) - (a.seeds || 0)
  })
}

/**
 * Make sure a torrent exists on the engine (re-add after eviction/restart).
 * Returns the engine torrent or throws.
 */
export async function ensureTorrent(
  infoHash: string,
  meta?: { title?: string; poster?: string; refId?: string; kind?: string },
): Promise<EngineTorrent> {
  const list = await engineList()
  const found = list.find((t) => t.infoHash.toLowerCase() === infoHash.toLowerCase())
  if (found) return found
  return addTorrent({ source: infoHash, ...meta })
}

/** Add a torrent option to the engine and pick the best video file. */
export async function streamTorrentOption(option: TorrentOption, meta?: { poster?: string; refId?: string; kind?: string }) {
  const t = await addTorrent({
    source: option.source,
    title: option.title,
    poster: meta?.poster,
    refId: meta?.refId,
    kind: meta?.kind,
  })
  const file = bestVideoFile(t)
  if (!file) throw new Error('No video file found in this torrent')
  return { torrent: t, file }
}

export function fmtSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return '—'
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
}

export function fmtEta(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}
