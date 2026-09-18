/**
 * OTAMA torrent streaming engine — embedded build for the desktop app.
 *
 * Plain-JS port of mini-services/otama-engine (same REST surface + socket.io),
 * so the Windows desktop app and the web deployment behave identically.
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
 * Realtime: socket.io broadcasts {event:'state', torrents:[...]} every 1.5s on /socket.io.
 *
 * Env:
 *   OTAMA_ENGINE_PORT    (default 3003)
 *   OTAMA_HOST           (default 127.0.0.1 — desktop binds to loopback only)
 *   OTAMA_DOWNLOAD_DIR   (default <os tmp>/otama-engine)
 */
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import torrentStream from 'torrent-stream'

const PORT = Number(process.env.OTAMA_ENGINE_PORT) || 3003
const HOST = process.env.OTAMA_HOST || '127.0.0.1'
const ENGINE_VERSION = '1.0.0'
const DOWNLOAD_ROOT = process.env.OTAMA_DOWNLOAD_DIR || path.join(os.tmpdir(), 'otama-engine')
const META_TIMEOUT_MS = 45_000
const IDLE_DESTROY_MS = 30 * 60 * 1000
const MAX_ENGINES = 6
const BROADCAST_INTERVAL = 1500

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'https://tracker.tamersunion.org:443/announce',
]

const MIME = {
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

const Meta = undefined // (docs-only)

const torrents = new Map() // infoHash -> { engine, meta, addedAt, lastAccessed, ready, selectedFile, streams }

fs.mkdirSync(DOWNLOAD_ROOT, { recursive: true })

/* ------------------------------ helpers ------------------------------ */

const normalizeHash = (h) => h.trim().toLowerCase()

function buildMagnet(source) {
  const s = source.trim()
  if (s.startsWith('magnet:')) return s
  const tr = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  if (/^[0-9a-fA-F]{40}$/.test(s)) return `magnet:?xt=urn:btih:${s}&dn=OTAMA${tr}`
  if (/^[0-9a-zA-Z]{2,}$/.test(s)) return `magnet:?xt=urn:btih:${s}${tr}` // base32 or short hash
  return s // try as-is (parse-torrent will throw if bad)
}

function isVideoFile(f) {
  return VIDEO_EXT.has(path.extname(f.name).toLowerCase())
}

function fileMime(f) {
  return MIME[path.extname(f.name).toLowerCase()] || 'application/octet-stream'
}

function findHash(prefix) {
  const lower = prefix.toLowerCase()
  for (const key of torrents.keys()) if (key === lower || key.startsWith(lower)) return key
  return null
}

function progressOf(a) {
  const t = a.engine.torrent
  if (!t || !a.engine.bitfield) return 0
  const total = t.pieces.length
  if (!total) return 0
  let done = 0
  for (let i = 0; i < total; i++) if (a.engine.bitfield.get(i)) done++
  return done / total
}

function filesOf(a) {
  const t = a.engine.torrent
  if (!t) return []
  return t.files.map((f, index) => ({
    index,
    name: f.name,
    length: f.length,
    isVideo: isVideoFile(f),
  }))
}

function magnetFor(infoHash, a) {
  const dn = a.engine.torrent?.name || a.meta.title || infoHash
  const tr = DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(dn)}${tr}`
}

function torrentStats(a, infoHash) {
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
    numPeers: a.engine.swarm.wires.filter((w) => w.ready !== false).length,
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

function destroyTorrent(infoHash, wipe) {
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

function addTorrent(source, meta) {
  const magnet = buildMagnet(source)
  return new Promise((resolve, reject) => {
    let engine
    try {
      engine = torrentStream(magnet, {
        connections: 100,
        uploads: 12,
        path: DOWNLOAD_ROOT,
        trackers: DEFAULT_TRACKERS,
        verify: true,
      })
    } catch (err) {
      reject(new Error(`Invalid torrent source: ${err.message}`))
      return
    }
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        engine.destroy()
      } catch {
        /* noop */
      }
      reject(new Error('Timed out waiting for torrent metadata (no peers or dead torrent)'))
    }, META_TIMEOUT_MS)

    engine.on('ready', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const infoHash = normalizeHash(engine.infoHash)
      // Auto-select small files (subtitles etc.) but leave big media unselected;
      // streaming a range auto-prioritises the pieces it needs.
      engine.files.forEach((f) => {
        if (f.length < 10 * 1024 * 1024 && !isVideoFile(f)) f.select()
        else f.deselect()
      })
      const a = {
        engine,
        meta,
        addedAt: Date.now(),
        lastAccessed: Date.now(),
        ready: true,
        selectedFile: null,
        streams: 0,
      }
      torrents.set(infoHash, a)
      resolve({ ...a, infoHash })
    })
    engine.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/* ------------------------------ range streaming ------------------------------ */

function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return 'invalid'
  const [, rawStart, rawEnd] = m
  if (rawStart === '' && rawEnd === '') return { start: 0, end: size - 1 }
  if (rawStart === '') {
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

function streamFile(req, res, a, infoHash, fileIndex, attachment) {
  const t = a.engine.torrent
  if (!t || !a.ready) {
    res.writeHead(503, { 'Content-Type': 'text/plain' })
    res.end('Torrent metadata not ready')
    return
  }
  const file = a.engine.files[fileIndex]
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('File index out of range')
    return
  }

  a.lastAccessed = Date.now()

  // select the file for background download (only one big file at a time)
  if (a.selectedFile !== fileIndex && file.length >= 10 * 1024 * 1024) {
    if (a.selectedFile !== null && a.engine.files[a.selectedFile]) {
      try {
        a.engine.files[a.selectedFile].deselect()
      } catch {
        /* noop */
      }
    }
    file.select()
    a.selectedFile = fileIndex
  } else if (file.length < 10 * 1024 * 1024) {
    file.select()
  }

  const size = file.length
  const range = parseRange(req.headers.range, size)
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': fileMime(file),
    'Cache-Control': 'no-cache',
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
  if (req.headers.range) statusCode = 206
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
  headers['Content-Length'] = range.end - range.start + 1

  res.writeHead(statusCode, headers)

  const stream = file.createReadStream({ start: range.start, end: range.end })
  a.streams++
  const cleanup = () => {
    a.streams = Math.max(0, a.streams - 1)
    try {
      stream.destroy()
    } catch {
      /* noop */
    }
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

function json(res, code, body) {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => {
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

    // POST /torrents — add
    if (url.pathname === '/torrents' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      if (!body.source) {
        json(res, 400, { error: 'source (magnet uri or info hash) required' })
        return
      }
      const existing = findHash(body.source.replace(/^magnet:\?xt=urn:btih:/i, '').slice(0, 40))
      if (existing) {
        const a = torrents.get(existing)
        a.lastAccessed = Date.now()
        if (body.title) a.meta.title = body.title
        if (body.poster) a.meta.poster = body.poster
        if (body.refId) a.meta.refId = body.refId
        json(res, 200, torrentStats(a, existing))
        return
      }
      const created = await addTorrent(body.source, {
        title: body.title,
        poster: body.poster,
        refId: body.refId,
        kind: body.kind,
      })
      if (torrents.size > MAX_ENGINES) {
        // evict least recently accessed (not currently streaming)
        const entries = [...torrents.entries()]
          .filter(([h]) => h !== created.infoHash && torrents.get(h).streams === 0)
          .sort((x, y) => x[1].lastAccessed - y[1].lastAccessed)
        if (entries[0]) void destroyTorrent(entries[0][0], false)
      }
      json(res, 200, torrentStats(created, created.infoHash))
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
      if (!hash) {
        json(res, 404, { error: 'torrent not active' })
        return
      }
      const a = torrents.get(hash)

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

    // GET /stream/:hash/:index or /file/:hash/:index
    if ((parts[0] === 'stream' || parts[0] === 'file') && parts[1] && parts[2] !== undefined) {
      const hash = findHash(parts[1])
      if (!hash) {
        json(res, 404, { error: 'torrent not active' })
        return
      }
      const a = torrents.get(hash)
      streamFile(req, res, a, hash, parseInt(parts[2], 10), parts[0] === 'file')
      return
    }

    // GET /magnet/:hash
    if (parts[0] === 'magnet' && parts[1]) {
      const hash = findHash(parts[1])
      if (!hash) {
        json(res, 404, { error: 'torrent not active' })
        return
      }
      json(res, 200, { magnet: magnetFor(hash, torrents.get(hash)) })
      return
    }

    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, 500, { error: err.message || 'internal error' })
  }
})

/* ------------------------------ socket.io ------------------------------ */

const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

function broadcastState() {
  const list = [...torrents.entries()].map(([h, a]) => {
    const s = torrentStats(a, h)
    return {
      infoHash: s.infoHash,
      title: s.title,
      poster: s.poster,
      progress: s.progress,
      downloadSpeed: s.downloadSpeed,
      uploadSpeed: s.uploadSpeed,
      numPeers: s.numPeers,
      ready: s.ready,
      done: s.done,
      timeRemaining: s.timeRemaining,
      activeStreams: s.activeStreams,
      length: s.length,
    }
  })
  io.emit('state', { ts: Date.now(), torrents: list })
}

io.on('connection', (socket) => {
  socket.emit('state', { ts: Date.now(), torrents: [...torrents.entries()].map(([h, a]) => torrentStats(a, h)) })
  socket.on('ping-state', () => broadcastState())
})

setInterval(broadcastState, BROADCAST_INTERVAL)

// idle reaper + LRU eviction
setInterval(() => {
  const now = Date.now()
  for (const [hash, a] of torrents.entries()) {
    if (a.streams === 0 && now - a.lastAccessed > IDLE_DESTROY_MS) {
      console.log(`[otama-engine] idle destroy ${hash}`)
      void destroyTorrent(hash, false)
    }
  }
  const sorted = [...torrents.entries()]
    .filter(([, a]) => a.streams === 0)
    .sort((x, y) => x[1].lastAccessed - y[1].lastAccessed)
  while (torrents.size > MAX_ENGINES && sorted.length) {
    const [hash] = sorted.shift()
    void destroyTorrent(hash, false)
  }
}, 60_000)

server.listen(PORT, HOST, () => {
  console.log(`OTAMA engine v${ENGINE_VERSION} listening on ${HOST}:${PORT}, downloads in ${DOWNLOAD_ROOT}`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
