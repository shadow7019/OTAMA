/**
 * OTAMA torrent streaming engine.
 *
 * Re-implementation of the streaming core of popcorn-desktop (which used the
 * peerflix / torrent-stream stack) as a standalone HTTP + socket.io service.
 *
 * Endpoints:
 *   GET    /health
 *   POST   /torrents                { source: magnet|infoHash, title?, poster?, refId? }
 *   GET    /torrents                list of active engines with live stats
 *   GET    /torrents/:infoHash      single engine stats
 *   DELETE /torrents/:infoHash      destroy engine (?wipe=1 also removes files)
 *   GET    /stream/:infoHash/:fileIndex   HTTP range stream for <video>
 *   GET    /file/:infoHash/:fileIndex     full-file download (attachment)
 *   GET    /magnet/:infoHash        magnet uri for a known engine
 *
 * Realtime: socket.io broadcasts {event:'state', torrents:[...]} every 1.5s.
 */
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import fs from 'node:fs'
import path from 'node:path'
import torrentStream from 'torrent-stream'
import type { Engine as TSEngine, EngineFile } from 'torrent-stream'

const PORT = 3003
const ENGINE_VERSION = '1.3.0'
const DOWNLOAD_ROOT = process.env.OTAMA_DOWNLOAD_DIR || '/tmp/otama-engine'
/** How long we keep trying to fetch metadata before dropping the torrent. */
const META_TIMEOUT_MS = 75_000
/** How long a stream/file request may wait for metadata + first pieces. */
const STREAM_WAIT_TIMEOUT_MS = 90_000
const IDLE_DESTROY_MS = 30 * 60 * 1000
const MAX_ENGINES = 6
const BROADCAST_INTERVAL = 1500
/** Streaming cache is disposable — bound it so the disk never fills up. */
const MAX_CACHE_BYTES = (parseInt(process.env.OTAMA_MAX_CACHE_MB || '', 10) || 8192) * 1024 * 1024
/** Bytes of a video file's head pulled with priority after metadata is ready —
 *  guarantees the first moov/ftyp box lands fast so time-to-first-frame is low. */
const HEAD_PRIORITY_BYTES = 8 * 1024 * 1024
/** Bytes of a video file's TAIL pulled with priority — MKV Cues (seek index)
 *  and tail-mounted MP4 moov boxes live here. Chromium refuses to raise
 *  readyState above 0 until it has parsed them, which is the classic
 *  "player looks dead on resume" stall: the swarm downloads the head while
 *  the demuxer waits for the index at the very end of a multi-GB file. */
const TAIL_PRIORITY_BYTES = 1536 * 1024
/** Bytes at the start of every range request marked critical (hotswap-enabled) —
 *  makes seeks snappy by stealing blocks from slow peers for the new position. */
const SEEK_CRITICAL_BYTES = 4 * 1024 * 1024

/**
 * Wide tracker mix (UDP + HTTP + HTTPS). In networks where UDP egress is
 * blocked, the HTTP(S) trackers and DHT still get us peers — a dead swarm is
 * the other common cause of endless buffering.
 * First 14 are the long-proven set; the rest widen peer discovery (curated
 * from the ngosang/trackerslist "best" list) for faster swarm joins.
 */
const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://opentracker.io:6969/announce',
  'https://tracker.tamersunion.org:443/announce',
  'http://tracker.gbitt.info:80/announce',
  'https://tracker.gbitt.info:443/announce',
  // widened discovery set
  'udp://explodie.org:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.novg.net:6969/announce',
  'udp://bt1.archive.org:6969/announce',
  'udp://tracker.leech.ie:1337/announce',
  'http://tracker.bt4g.com:2095/announce',
  'https://tracker.lilithraws.org:443/announce',
  'https://tracker.foreverhorizon.yt:443/announce',
  'udp://tracker.auctor.tv:6969/announce',
  'udp://tracker.tanners.co.za:6969/announce',
  'udp://tracker.gmi.gd:6969/announce',
]

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.ts'])

interface Meta {
  title?: string
  poster?: string
  refId?: string
  kind?: string
}

interface ActiveTorrent {
  engine: TSEngine
  meta: Meta
  addedAt: number
  lastAccessed: number
  ready: boolean
  selectedFile: number | null
  streams: number
  /** piece range already given the priority head window (avoid duplicates) */
  headPriorityDone: boolean
  tailPriorityDone: boolean
}

/** torrent-stream exposes these at runtime but not in its typings. */
interface SelectableEngine extends TSEngine {
  select?(from: number, to: number, priority?: boolean | number, notify?: () => void): void
  deselect?(from: number, to: number, priority?: boolean | number, notify?: () => void): void
  critical?(piece: number, width?: number): void
}

const torrents = new Map<string, ActiveTorrent>() // key: infoHash (lower)
/** Hashes with a metadata fetch currently in flight (no duplicate adds). */
const pendingAdds = new Set<string>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true })

/* ------------------------------ helpers ------------------------------ */

const normalizeHash = (h: string) => h.trim().toLowerCase()

function buildMagnet(source: string): string {
  const s = source.trim()
  if (s.startsWith('magnet:')) return s
  if (/^[0-9a-fA-F]{40}$/.test(s)) {
    const tr = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${s}&dn=OTAMA${tr}`
  }
  if (/^[0-9a-zA-Z]{2,}$/.test(s)) {
    // maybe a base32 hash (32 chars)
    const tr = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
    return `magnet:?xt=urn:btih:${s}${tr}`
  }
  return s // try as-is (parse-torrent will throw if bad)
}

function isVideoFile(f: { name: string }): boolean {
  return VIDEO_EXT.has(path.extname(f.name).toLowerCase())
}

function fileMime(f: { name: string }): string {
  return MIME[path.extname(f.name).toLowerCase()] || 'application/octet-stream'
}

function findHash(prefix: string): string | null {
  const lower = prefix.toLowerCase()
  for (const key of torrents.keys()) if (key === lower || key.startsWith(lower)) return key
  return null
}

function progressOf(a: ActiveTorrent): number {
  const t = a.engine.torrent
  if (!t || !a.engine.bitfield) return 0
  const total = t.pieces.length
  if (!total) return 0
  let done = 0
  for (let i = 0; i < total; i++) if (a.engine.bitfield.get(i)) done++
  return done / total
}

function filesOf(a: ActiveTorrent) {
  const t = a.engine.torrent
  if (!t) return []
  return t.files.map((f: { name: string; length: number }, index: number) => ({
    index,
    name: f.name,
    length: f.length,
    isVideo: isVideoFile(f),
  }))
}

function torrentStats(a: ActiveTorrent, infoHash: string) {
  const t = a.engine.torrent
  const progress = progressOf(a)
  const speed = a.engine.swarm.downloadSpeed()
  const upSpeed = a.engine.swarm.uploadSpeed()
  const remainingBytes = t ? Math.max(0, t.length * (1 - progress)) : 0
  return {
    infoHash,
    title: a.meta.title || t?.name || infoHash,
    poster: a.meta.poster || null,
    refId: a.meta.refId || null,
    kind: a.meta.kind || null,
    name: t?.name || null,
    length: t?.length || 0,
    progress,
    downloadSpeed: speed,
    uploadSpeed: upSpeed,
    downloaded: a.engine.swarm.downloaded,
    uploaded: a.engine.swarm.uploaded,
    numPeers: a.engine.swarm.wires.filter((w: { ready?: boolean }) => w.ready !== false).length,
    ready: a.ready,
    done: progress >= 0.999,
    timeRemaining: speed > 2_000 ? Math.round((remainingBytes / speed) * 1000) : Infinity,
    files: a.ready ? filesOf(a) : [],
    selectedFile: a.selectedFile,
    activeStreams: a.streams,
    magnet: magnetFor(infoHash, a),
    addedAt: a.addedAt,
    lastAccessed: a.lastAccessed,
  }
}

function magnetFor(infoHash: string, a: ActiveTorrent): string {
  const dn = a.engine.torrent?.name || a.meta.title || infoHash
  const tr = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(dn)}${tr}`
}

/**
 * Give the head of a video file absolute download priority + critical
 * (hotswap-enabled) status.
 *
 * torrent-stream already prioritises a stream's exact requested range, but a
 * fresh <video> typically asks `bytes=0-` — an open-ended range spanning the
 * WHOLE file, which dilutes that priority. Selecting the first ~8 MB as a
 * PRIORITY selection (sorted ahead of the whole-file selection) and marking
 * it critical (enables block hotswapping) makes first-frame latency much
 * lower, especially on slow swarms.
 */
function prioritiseFileHead(a: ActiveTorrent, fileIndex: number) {
  try {
    const eng = a.engine as SelectableEngine
    if (!eng.select || !eng.critical || a.headPriorityDone) return
    const t = a.engine.torrent
    const file = a.engine.files[fileIndex] as (EngineFile & { offset?: number }) | undefined
    if (!t || !t.pieceLength || !file) return
    const offset = file.offset || 0
    const startPiece = Math.floor(offset / t.pieceLength)
    const endPiece = Math.floor((offset + Math.min(HEAD_PRIORITY_BYTES, file.length)) / t.pieceLength)
    eng.select(startPiece, endPiece, true)
    for (let p = startPiece; p <= endPiece; p++) eng.critical(p, 1)
    a.headPriorityDone = true
  } catch { /* prioritisation is best-effort */ }
}

/** Mark the first SEEK_CRITICAL_BYTES of a byte range critical AND give them a
 *  priority selection. critical() alone only permits block hotswapping — it
 *  does not jump the piece download queue. select(..., true) puts the region
 *  at the front, which is what a seek into an un-downloaded area needs. */
function markRangeCritical(a: ActiveTorrent, fileIndex: number, rangeStart: number) {
  try {
    const eng = a.engine as SelectableEngine
    if (!eng.critical) return
    const t = a.engine.torrent
    const file = a.engine.files[fileIndex] as (EngineFile & { offset?: number }) | undefined
    if (!t || !t.pieceLength || !file) return
    const absStart = (file.offset || 0) + rangeStart
    const first = Math.floor(absStart / t.pieceLength)
    const last = Math.floor((absStart + SEEK_CRITICAL_BYTES) / t.pieceLength)
    if (eng.select) eng.select(first, last, true)
    for (let p = first; p <= last; p++) eng.critical(p, 1)
  } catch { /* best-effort */ }
}

/**
 * Give the TAIL of a video file priority selection + critical status.
 * MKV files store their Cues (seek index) at the end; MP4 files may carry the
 * moov atom there. Chromium will not report metadata (readyState stays 0)
 * until it has that index, so on a cold resume the player can sit "dead" for
 * minutes while the swarm downloads from the front. Prefetching the tail the
 * moment the file is selected removes that chicken-and-egg wait.
 */
function prioritiseFileTail(a: ActiveTorrent, fileIndex: number) {
  try {
    const eng = a.engine as SelectableEngine
    if (!eng.select || !eng.critical || a.tailPriorityDone) return
    const t = a.engine.torrent
    const file = a.engine.files[fileIndex] as (EngineFile & { offset?: number }) | undefined
    if (!t || !t.pieceLength || !file || file.length < 50 * 1024 * 1024) return
    const offset = file.offset || 0
    const tailStart = Math.max(0, file.length - TAIL_PRIORITY_BYTES)
    const startPiece = Math.floor((offset + tailStart) / t.pieceLength)
    const endPiece = Math.floor((offset + file.length - 1) / t.pieceLength)
    if (endPiece < startPiece) return
    eng.select(startPiece, endPiece, true)
    for (let p = startPiece; p <= endPiece; p++) eng.critical(p, 1)
    a.tailPriorityDone = true
  } catch { /* prioritisation is best-effort */ }
}

function destroyTorrent(infoHash: string, wipe: boolean): Promise<void> {
  const a = torrents.get(infoHash)
  if (!a) return Promise.resolve()
  torrents.delete(infoHash)
  return new Promise((resolve) => {
    try {
      a.engine.destroy(() => {
        if (wipe) {
          fs.rm(a.engine.path, { recursive: true, force: true }, () => resolve())
        } else resolve()
      })
    } catch {
      resolve()
    }
  })
}

/**
 * Synchronously parse the infoHash out of a magnet/hash source so the REST
 * layer can respond instantly (the metadata fetch continues in background).
 */
function sourceHash(source: string): string | null {
  const s = source.trim()
  const m = /^magnet:\?xt=urn:btih:([0-9a-zA-Z]+)/i.exec(s)
  const raw = m ? m[1] : s
  if (/^[0-9a-fA-F]{40}$/.test(raw)) return normalizeHash(raw)
  if (/^[A-Z2-7]{32}$/i.test(raw)) return normalizeHash(raw) // base32
  return null
}

/**
 * Start fetching a torrent WITHOUT blocking: the (pending) entry is registered
 * immediately so the UI/stream endpoints can track it, and metadata resolution
 * continues in the background. On success the entry flips to ready and the
 * biggest video file is pre-selected so head-of-file pieces start downloading
 * before the first <video> request even arrives (fast time-to-first-frame).
 */
function startAdd(source: string, meta: Meta): ActiveTorrent | null {
  const hash = sourceHash(source)
  const magnet = buildMagnet(source)
  let engine: TSEngine
  try {
    engine = torrentStream(magnet, {
      connections: 250,
      uploads: 12,
      path: DOWNLOAD_ROOT,
      trackers: DEFAULT_TRACKERS,
      verify: true,
    }) as TSEngine
  } catch {
    return null // invalid source
  }
  const key = normalizeHash(engine.infoHash || hash || '')
  const a: ActiveTorrent = {
    engine,
    meta,
    addedAt: Date.now(),
    lastAccessed: Date.now(),
    ready: false,
    selectedFile: null,
    streams: 0,
    headPriorityDone: false,
    tailPriorityDone: false,
  }
  if (key) torrents.set(key, a)
  pendingAdds.add(key || magnet)

  const settle = (ok: boolean) => {
    pendingAdds.delete(key || magnet)
    if (!ok) {
      // metadata never arrived / engine broken — drop the entry so callers
      // stop waiting and report a clean "dead torrent" state.
      const k = [...torrents.entries()].find(([, v]) => v === a)?.[0]
      if (k) torrents.delete(k)
      try { engine.destroy() } catch { /* noop */ }
    }
  }

  const timeout = setTimeout(() => settle(false), META_TIMEOUT_MS)
  engine.on('ready', () => {
    clearTimeout(timeout)
    a.ready = true
    a.lastAccessed = Date.now()
    // Auto-select small files (subtitles etc.) but leave big media unselected;
    // streaming a range auto-prioritises the pieces it needs.
    engine.files.forEach((f: EngineFile) => {
      if (f.length < 10 * 1024 * 1024 && !isVideoFile(f)) f.select()
      else f.deselect()
    })
    // Pre-select the largest video file: its first pieces download immediately
    // (torrent-stream pulls selected pieces in order) — playback starts as
    // soon as the browser asks, instead of racing the first range request.
    const videos = engine.files.filter((f: EngineFile) => isVideoFile(f) && f.length >= 10 * 1024 * 1024)
    if (videos.length) {
      const best = videos.reduce((x: EngineFile, y: EngineFile) => (y.length > x.length ? y : x))
      best.select()
      a.selectedFile = engine.files.indexOf(best)
      // Head-of-file absolute priority: first ~8 MB as a PRIORITY selection +
      // critical pieces — first frame lands even before the browser connects.
      prioritiseFileHead(a, a.selectedFile)
      // Tail (MKV Cues / MP4 moov) priority — the demuxer index downloads in
      // parallel with the head so Chromium never stalls on a missing index.
      prioritiseFileTail(a, a.selectedFile)
    }
  })
  engine.on('error', () => { clearTimeout(timeout); settle(false) })
  return a
}

/**
 * Resolve an ActiveTorrent for streaming endpoints, AUTO-ADDING the torrent
 * from its hash when the engine does not have it (restart / LRU eviction /
 * resumed session). The stream URL is therefore self-healing: a <video> that
 * requests /stream/:hash/:i always eventually gets data instead of a 404
 * (Chromium turns an instant 404 into MEDIA_ERR_SRC_NOT_SUPPORTED, which used
 * to kill playback permanently).
 */
async function waitForActive(source: string): Promise<ActiveTorrent | null> {
  const hash = normalizeHash(source)
  const deadline = Date.now() + STREAM_WAIT_TIMEOUT_MS
  let started = false
  for (;;) {
    const found = findHash(hash)
    if (found) {
      const a = torrents.get(found)!
      a.lastAccessed = Date.now()
      if (a.ready) return a
      // pending metadata — keep the request hanging (no headers sent yet)
    } else if (!started) {
      started = true
      startAdd(hash, {})
    }
    if (Date.now() >= deadline) {
      const k = findHash(hash)
      return k && torrents.get(k)!.ready ? torrents.get(k)! : null
    }
    await sleep(400)
  }
}

/** Evict least-recently-used, non-streaming torrents when over capacity. */
function evictIfNeeded(excludeHash?: string) {
  if (torrents.size <= MAX_ENGINES) return
  const entries = [...torrents.entries()]
    .filter(([h]) => h !== excludeHash && torrents.get(h)!.streams === 0)
    .sort((x, y) => x[1].lastAccessed - y[1].lastAccessed)
  while (torrents.size > MAX_ENGINES && entries.length) {
    const [h] = entries.shift()!
    void destroyTorrent(h, true)
  }
}

/* ------------------------------ range streaming ------------------------------ */

function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' {
  if (!header) return { start: 0, end: size - 1 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return 'invalid'
  const [, rawStart, rawEnd] = m
  if (rawStart === '' && rawEnd === '') return { start: 0, end: size - 1 }
  if (rawStart === '') {
    // suffix range: last N bytes
    const n = parseInt(rawEnd, 10)
    if (n <= 0) return 'invalid'
    const start = Math.max(0, size - n)
    return { start, end: size - 1 }
  }
  const start = parseInt(rawStart, 10)
  const end = rawEnd === '' ? size - 1 : parseInt(rawEnd, 10)
  if (isNaN(start) || isNaN(end) || start > end || start >= size) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

async function streamFile(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  a: ActiveTorrent,
  infoHash: string,
  fileIndex: number,
  attachment: boolean,
) {
  // Wait for metadata if a pending add is still resolving (no headers have
  // been sent, so the browser just waits — that is exactly what we want).
  const deadline = Date.now() + STREAM_WAIT_TIMEOUT_MS
  while (!a.ready && Date.now() < deadline) await sleep(300)
  const t = a.engine.torrent
  if (!t || !a.ready) {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Torrent metadata not ready (dead torrent or no peers)')
    return
  }
  const file = a.engine.files[fileIndex] as (EngineFile & { name: string; length: number }) | undefined
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('File index out of range')
    return
  }

  a.lastAccessed = Date.now()

  // select the file for background download (only one big file at a time)
  if (a.selectedFile !== fileIndex && file.length >= 10 * 1024 * 1024) {
    if (a.selectedFile !== null && a.engine.files[a.selectedFile]) {
      try { a.engine.files[a.selectedFile].deselect() } catch { /* noop */ }
    }
    file.select()
    a.selectedFile = fileIndex
    a.headPriorityDone = false
    a.tailPriorityDone = false
    prioritiseFileHead(a, fileIndex)
    prioritiseFileTail(a, fileIndex)
  } else if (file.length < 10 * 1024 * 1024) {
    file.select()
  } else {
    // same file as before — still make sure the index region is prioritised
    prioritiseFileTail(a, fileIndex)
  }

  const size = file.length
  const range = parseRange(req.headers.range, size)
  const headers: Record<string, string | number> = {
    'Accept-Ranges': 'bytes',
    'Content-Type': fileMime(file),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (attachment) {
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(file.name)}"`
  }

  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` })
    res.end()
    return
  }

  let statusCode = 200
  if (range !== 'invalid') {
    if (req.headers.range) statusCode = 206
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['Content-Length'] = range.end - range.start + 1
  } else {
    headers['Content-Length'] = size
  }

  res.writeHead(statusCode, headers)

  // HEAD probe (players / TV remotes use it) — headers only, no body.
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  // Push headers to the client immediately so <video> starts buffering the
  // moment a single piece is available instead of waiting on the first chunk.
  res.flushHeaders()

  // Seek boost: mark the head of THIS range critical (hotswap-enabled) so the
  // pieces at the new read position are stolen from slow peers immediately.
  if (range !== 'invalid') markRangeCritical(a, fileIndex, range.start)

  const stream = file.createReadStream({ start: range.start, end: range.end })
  a.streams++
  const cleanup = () => {
    a.streams = Math.max(0, a.streams - 1)
    try { stream.destroy() } catch { /* noop */ }
  }
  res.on('close', cleanup)
  req.on('error', cleanup)
  stream.on('error', () => {
    a.streams = Math.max(0, a.streams - 1)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
  stream.pipe(res)
}

/* ------------------------------ http server ------------------------------ */

function json(res: import('node:http').ServerResponse, code: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
  })
  res.end(payload)
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      chunks.push(c)
      if (chunks.length > 1000) reject(new Error('Body too large'))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Range',
      'Access-Control-Max-Age': '600',
    })
    res.end()
    return
  }

  try {
    // health
    if (url.pathname === '/health' && req.method === 'GET') {
      json(res, 200, { ok: true, version: ENGINE_VERSION, torrents: torrents.size, uptime: Math.round(process.uptime()) })
      return
    }

    // POST /torrents — add (responds instantly; metadata resolves in background
    // and the UI/stream endpoints follow the ready flag via socket / polling)
    if (url.pathname === '/torrents' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}') as { source?: string; title?: string; poster?: string; refId?: string; kind?: string }
      if (!body.source) { json(res, 400, { error: 'source (magnet uri or info hash) required' }); return }
      const meta: Meta = { title: body.title, poster: body.poster, refId: body.refId, kind: body.kind }
      const existing = findHash(body.source.replace(/^magnet:\?xt=urn:btih:/i, '').slice(0, 40))
      if (existing) {
        const a = torrents.get(existing)!
        a.lastAccessed = Date.now()
        if (body.title) a.meta.title = body.title
        if (body.poster) a.meta.poster = body.poster
        if (body.refId) a.meta.refId = body.refId
        json(res, 200, torrentStats(a, existing))
        return
      }
      const created = startAdd(body.source, meta)
      if (!created) { json(res, 400, { error: 'Invalid torrent source (bad magnet or info hash)' }); return }
      const newKey = [...torrents.entries()].find(([, v]) => v === created)?.[0] || undefined
      evictIfNeeded(newKey)
      json(res, 200, torrentStats(created, newKey || ''))
      return
    }

    // GET /torrents — list
    if (url.pathname === '/torrents' && req.method === 'GET') {
      json(res, 200, [...torrents.entries()].map(([h, a]) => torrentStats(a, h)))
      return
    }

    // /torrents/:hash [GET, DELETE]
    if (parts[0] === 'torrents' && parts[1]) {
      const hash = findHash(parts[1])
      if (!hash) { json(res, 404, { error: 'torrent not active' }); return }
      const a = torrents.get(hash)!

      if (req.method === 'DELETE') {
        const wipe = url.searchParams.get('wipe') === '1'
        await destroyTorrent(hash, wipe)
        json(res, 200, { ok: true, wiped: wipe })
        return
      }
      if (req.method === 'GET') {
        a.lastAccessed = Date.now()
        json(res, 200, torrentStats(a, hash))
        return
      }
    }

    // GET /stream/:hash/:index or /file/:hash/:index — self-healing: the hash
    // is auto-added when missing and the request waits out metadata resolution.
    if ((parts[0] === 'stream' || parts[0] === 'file') && parts[1] && parts[2] !== undefined) {
      const a = await waitForActive(parts[1])
      if (!a) {
        json(res, 503, { error: 'Torrent metadata could not be fetched (dead torrent or no peers)' })
        return
      }
      const hash = [...torrents.entries()].find(([, v]) => v === a)![0]
      void streamFile(req, res, a, hash, parseInt(parts[2], 10), parts[0] === 'file')
      return
    }

    // GET /magnet/:hash
    if (parts[0] === 'magnet' && parts[1]) {
      const hash = findHash(parts[1])
      if (!hash) { json(res, 404, { error: 'torrent not active' }); return }
      json(res, 200, { magnet: magnetFor(hash, torrents.get(hash)!) })
      return
    }

    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, 500, { error: (err as Error).message || 'internal error' })
  }
})

/* ------------------------------ socket.io ------------------------------ */

const io = new Server(server, {
  // Standard socket.io path. The gateway (Caddy) forwards by ?XTransformPort
  // query param and preserves the path, so the client's /socket.io/ handshake
  // reaches this server. REST routes below use their own paths.
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

function broadcastState() {
  // Full stats INCLUDING files/refId/kind — the Downloads sheet picks the video
  // file straight from this payload, so it must not be a reduced projection.
  const list = [...torrents.entries()].map(([h, a]) => torrentStats(a, h))
  io.emit('state', { ts: Date.now(), torrents: list })
}

io.on('connection', (socket) => {
  socket.emit('state', { ts: Date.now(), torrents: [...torrents.entries()].map(([h, a]) => torrentStats(a, h)) })
  socket.on('ping-state', () => broadcastState())
})

setInterval(broadcastState, BROADCAST_INTERVAL)

// idle reaper + LRU eviction + cache quota
// All internal evictions WIPE the data: streamed content is a disposable
// cache, and keeping it around silently fills the disk (seen in the wild:
// 8 GB of orphaned pieces -> ENOSPC).
setInterval(() => {
  const now = Date.now()
  for (const [hash, a] of torrents.entries()) {
    if (a.streams === 0 && now - a.lastAccessed > IDLE_DESTROY_MS) {
      console.log(`[otama-engine] idle destroy ${hash}`)
      void destroyTorrent(hash, true)
    }
  }
  // hard cap on engines
  const sorted = [...torrents.entries()]
    .filter(([, a]) => a.streams === 0)
    .sort((x, y) => x[1].lastAccessed - y[1].lastAccessed)
  while (torrents.size > MAX_ENGINES && sorted.length) {
    const [hash] = sorted.shift()!
    void destroyTorrent(hash, true)
  }
  // hard cap on cache size (approximate: bytes pulled from the swarm)
  let cacheBytes = 0
  for (const a of torrents.values()) cacheBytes += a.engine.swarm.downloaded || 0
  while (cacheBytes > MAX_CACHE_BYTES && sorted.length) {
    const [hash, a] = sorted.shift()!
    cacheBytes -= a.engine.swarm.downloaded || 0
    console.log(`[otama-engine] cache quota eviction ${hash}`)
    void destroyTorrent(hash, true)
  }
}, 60_000)

server.listen(PORT, () => {
  console.log(`OTAMA engine v${ENGINE_VERSION} running on port ${PORT}, downloads in ${DOWNLOAD_ROOT}`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
