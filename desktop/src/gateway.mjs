/**
 * OTAMA embedded gateway — a tiny reverse proxy that mirrors the production
 * web deployment (Caddy) inside the desktop app.
 *
 *   client ──► :3000 (the ONE port that must be reachable)
 *                ├─ any request with ?XTransformPort=<n> ──► 127.0.0.1:<n>
 *                │    (torrent engine: REST, range streaming, socket.io)
 *                ├─ WebSocket upgrades with ?XTransformPort=<n> ──► raw TCP
 *                └─ everything else ──► 127.0.0.1:<nextPort> (Next.js UI)
 *
 * Why: a phone connecting over the internet should need exactly ONE forwarded
 * router port. Without the gateway the phone would need BOTH the web port
 * (3000) and the engine port (3003) exposed. With it, the engine can stay on
 * loopback and every engine request rides the same origin as the UI.
 *
 * The `?XTransformPort=<port>` convention is identical to the sandbox/production
 * Caddyfile, so the web app needs no changes: its transport auto-detection
 * (`ensureEngineTransport`) finds the gateway path by itself.
 *
 * Failure philosophy (mirrors the JSON-guaranteed API work): when an upstream
 * service is down, this proxy answers a JSON 502 — never plain text — so
 * clients can never parse an HTML error page into "Unexpected token".
 */
import { createServer, request as httpRequest } from 'node:http'
import net from 'node:net'

/** RFC 2616 hop-by-hop headers must not be forwarded by a proxy. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** Extract the upstream port from ?XTransformPort=<n> (defaults to nextPort). */
function targetPort(rawUrl, nextPort) {
  try {
    const q = new URL(rawUrl, 'http://gateway.internal').searchParams.get('XTransformPort')
    if (q && /^\d+$/.test(q) && Number(q) > 0 && Number(q) < 65536) return Number(q)
  } catch {
    /* malformed query — fall through to the UI upstream */
  }
  return nextPort
}

function proxyHttp(req, res, port) {
  const headers = {}
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]
    if (HOP_BY_HOP.has(name.toLowerCase())) continue
    headers[name] = req.rawHeaders[i + 1]
  }
  if (!headers.Host) headers.Host = `127.0.0.1:${port}`

  const upstream = httpRequest({ host: '127.0.0.1', port, method: req.method, path: req.url, headers })
  upstream.on('response', (ur) => {
    const out = {}
    for (const [name, value] of Object.entries(ur.headers)) {
      if (HOP_BY_HOP.has(name.toLowerCase())) continue
      out[name] = value
    }
    // writeHead passthrough keeps Content-Length / Content-Range intact —
    // video seeking depends on 206 responses arriving byte-identical.
    res.writeHead(ur.statusCode || 502, out)
    ur.pipe(res) // unbuffered stream (Caddy flush_interval -1 equivalent)
  })
  req.pipe(upstream)
  upstream.on('error', (err) => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(502, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(JSON.stringify({ error: 'OTAMA gateway: service not ready', code: String(err?.code || err), port }))
  })
}

/** Raw TCP pass-through for WebSocket upgrades (socket.io live stats). */
function proxyUpgrade(req, clientSocket, head, port) {
  const upstream = net.connect({ host: '127.0.0.1', port })
  clientSocket.setTimeout(0)
  upstream.setTimeout(0)
  clientSocket.pause() // no client frames may interleave before our replay

  const destroy = () => {
    try { upstream.destroy() } catch { /* noop */ }
    try { clientSocket.destroy() } catch { /* noop */ }
  }
  clientSocket.on('error', destroy)
  upstream.on('error', destroy)
  clientSocket.on('close', destroy)
  upstream.on('close', destroy)

  upstream.on('connect', () => {
    // Replay the original request line + headers verbatim (keeps
    // Sec-WebSocket-* headers so the handshake succeeds upstream).
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    }
    upstream.write(lines.join('\r\n') + '\r\n\r\n')
    if (head && head.length) upstream.write(head)
    clientSocket.resume()
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })
}

/**
 * Start the gateway. Resolves with the http.Server once it is listening.
 * @param {{ port: number, host?: string, nextPort: number }} opts
 */
export function startOtamaGateway(opts) {
  const { port, host = '127.0.0.1', nextPort } = opts
  const server = createServer((req, res) => {
    proxyHttp(req, res, targetPort(req.url, nextPort))
  })
  server.on('upgrade', (req, clientSocket, head) => {
    if (!clientSocket.writable) return
    proxyUpgrade(req, clientSocket, head, targetPort(req.url, nextPort))
  })
  server.on('clientError', (err, socket) => {
    try {
      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\ncontent-type: application/json\r\n\r\n{"error":"bad request"}')
      }
    } catch { /* noop */ }
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ port, host }, () => resolve(server))
  })
}
