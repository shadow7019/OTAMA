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

/* ------------------------------ transport ------------------------------
 * The web UI can be served from:
 *  1. A gateway deployment (sandbox / self-hosted Caddy) — the engine is
 *     reachable ONLY through relative `?XTransformPort=3003` routes.
 *  2. The desktop app's LAN server (phone browser → http://<pc>:3000) —
 *     NO gateway exists there; the engine answers directly on <pc>:3003
 *     with permissive CORS (engine cors origin: '*').
 *
 * Probe both transports once per page load: whichever /health answers wins.
 * Desktop (Electron) always uses the direct embedded engine.
 * --------------------------------------------------------------------- */

export type EngineTransport = 'direct' | 'gateway'

let transport: EngineTransport | null = null
let detectPromise: Promise<EngineTransport> | null = null

/** Current transport — null until detection has completed (assumes gateway). */
export function engineTransport(): EngineTransport | null {
  return transport
}

/** Resolve the engine transport once; subsequent calls return the cached result. */
export function ensureEngineTransport(): Promise<EngineTransport> {
  if (typeof window === 'undefined') return Promise.resolve('gateway')
  if (isDesktop()) {
    transport = 'direct'
    return Promise.resolve('direct')
  }
  if (detectPromise) return detectPromise
  detectPromise = (async () => {
    const host = window.location.hostname || '127.0.0.1'
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    try {
      const probes = await Promise.allSettled([
        fetch(`/health?XTransformPort=${ENGINE_PORT}`, { cache: 'no-store', signal: ctrl.signal }),
        fetch(`http://${host}:${ENGINE_PORT}/health`, { cache: 'no-store', signal: ctrl.signal }),
      ])
      const ok = (p: PromiseSettledResult<Response>) => p.status === 'fulfilled' && p.value.ok
      const gatewayOk = ok(probes[0])
      const directOk = ok(probes[1])
      // Gateway wins ties (established path when both happen to be exposed).
      transport = directOk && !gatewayOk ? 'direct' : 'gateway'
    } catch {
      transport = 'gateway'
    } finally {
      clearTimeout(timer)
    }
    return transport
  })()
  return detectPromise
}

function preferDirect(): boolean {
  return isDesktop() || transport === 'direct'
}

/**
 * Build an engine URL.
 *  - Direct (desktop shell / LAN phone): absolute http://<window host>:<port>.
 *    The window host is 127.0.0.1 in the Electron app itself, but becomes the
 *    desktop's LAN IP when a phone loads the app in LAN mode, so REST + video
 *    range-streaming reach the right machine from any device.
 *  - Gateway (web deployment): relative path + XTransformPort query.
 */
export function engineUrl(path: string, params?: Record<string, string>): string {
  if (preferDirect()) {
    const search = new URLSearchParams(params || {})
    const qs = search.toString()
    const host = window.location.hostname || '127.0.0.1'
    return `http://${host}:${desktopEnginePort()}${path}${qs ? `?${qs}` : ''}`
  }
  const search = new URLSearchParams({ ...(params || {}), XTransformPort: String(ENGINE_PORT) })
  return `${path}?${search.toString()}`
}

/** Socket.io target matching the detected transport (see use-engine-state). */
export function engineSocketTarget(): { url: string; path: string } {
  if (preferDirect()) {
    const host = window.location.hostname || '127.0.0.1'
    return { url: `http://${host}:${desktopEnginePort()}`, path: '/socket.io' }
  }
  return { url: `/?XTransformPort=${ENGINE_PORT}`, path: '/socket.io' }
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

/** Container family of a release/file name (for ranking + badges). */
export function containerOf(fileName?: string | null): 'mp4' | 'webm' | 'mkv' | 'mov' | 'legacy' | null {
  if (!fileName) return null
  const m = fileName.toLowerCase().match(/\.(mp4|m4v|webm|mkv|mov|avi|ts)\b/)
  if (!m) return null
  if (m[1] === 'mp4' || m[1] === 'm4v') return 'mp4'
  if (m[1] === 'webm') return 'webm'
  if (m[1] === 'mkv') return 'mkv'
  if (m[1] === 'mov') return 'mov'
  return 'legacy' // avi / ts / mpeg — <video> cannot demux these
}

/** MKV/MOV: plays in Chromium-based browsers but NOT in Firefox/Safari. */
export function isRiskyContainer(fileName?: string | null): boolean {
  const c = containerOf(fileName)
  return c === 'mkv' || c === 'mov'
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

/**
 * Playback rank — lower plays in more browsers:
 * 0 mp4/webm · 1 mkv/mov (Chromium-only) · 2 avi/ts (never) · 3 hevc (never)
 */
export function playbackRank(option: { title?: string; codec?: string }): number {
  if (isHevcName(option.title) || option.codec === 'hevc') return 3
  const c = containerOf(option.title)
  if (c === 'legacy') return 2
  if (c === 'mkv' || c === 'mov') return 1
  return 0
}

/** Playable containers first (mp4 before mkv before avi/ts before hevc), then by seed count. */
export function playableFirst(options: TorrentOption[]): TorrentOption[] {
  return [...options].sort((a, b) => {
    const ra = playbackRank(a)
    const rb = playbackRank(b)
    if (ra !== rb) return ra - rb
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

/**
 * Add a torrent option to the engine and pick the best video file.
 *
 * The engine's POST responds instantly with a (possibly still pending) torrent;
 * metadata resolution is followed by polling the engine list until `ready`, so
 * the caller always gets a torrent with real files — or a clear error.
 */
export async function streamTorrentOption(
  option: TorrentOption,
  meta?: { poster?: string; refId?: string; kind?: string },
) {
  const t = await addTorrent({
    source: option.source,
    title: option.title,
    poster: meta?.poster,
    refId: meta?.refId,
    kind: meta?.kind,
  })
  const deadline = Date.now() + 80_000
  let current = t
  while (!current.ready && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800))
    const list = await engineList()
    const found = list.find((x) => x.infoHash.toLowerCase() === t.infoHash.toLowerCase())
    if (!found) throw new Error('Torrent dropped while connecting — dead torrent or no peers. Try another one.')
    current = found
  }
  if (!current.ready) throw new Error('Timed out connecting to the swarm (no peers answered) — try another torrent')

  // Post-ready LIVENESS GATE: index sites frequently list huge, stale seed
  // counts on swarms that no longer answer (the classic "stuck on buffering"
  // Spider-Man case). Give the swarm a short window to prove data flows;
  // otherwise fail fast so the caller can pick another torrent immediately
  // instead of staring at an endless buffering spinner.
  const alive = (s: EngineTorrent) =>
    s.numPeers > 0 && (s.downloaded > 0 || s.downloadSpeed > 10_000 || s.numPeers >= 3)
  const livenessDeadline = Date.now() + 12_000
  while (!alive(current) && Date.now() < livenessDeadline) {
    await new Promise((r) => setTimeout(r, 900))
    const list = await engineList()
    const found = list.find((x) => x.infoHash.toLowerCase() === t.infoHash.toLowerCase())
    if (!found) throw new Error('Torrent dropped while connecting — dead torrent or no peers. Try another one.')
    if (found.ready) current = found
  }
  if (!alive(current)) {
    throw new Error('This torrent\'s swarm looks dead (stale seed count — nobody is answering). Try another release or quality.')
  }
  // Prefer the provider-supplied file index (Torrentio fileIdx) when valid —
  // it points at the exact video file instead of the largest one.
  const hinted =
    option.fileIndex != null && current.files?.[option.fileIndex]?.isVideo
      ? current.files[option.fileIndex]
      : null
  const file = hinted || bestVideoFile(current)
  if (!file) throw new Error('No video file found in this torrent')
  return { torrent: current, file }
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
