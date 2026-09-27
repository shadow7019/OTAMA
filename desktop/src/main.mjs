/**
 * OTAMA — Electron main process (Windows desktop shell).
 *
 * Architecture (mirrors the production web deployment, embedded locally):
 *
 *   ┌──────────────────────────── Electron ────────────────────────────┐
 *   │  BrowserWindow ── loads ──► Next.js standalone server (child)    │
 *   │        │                         127.0.0.1:<free port>           │
 *   │        │ preload injects window.otama { isDesktop, enginePort }  │
 *   │        ▼                                                         │
 *   │  OTAMA torrent engine (child, ELECTRON_RUN_AS_NODE)              │
 *   │        127.0.0.1:3003  — REST + range streaming + socket.io      │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * The renderer bundle is the exact same Next.js app used on the web; the only
 * difference is that `window.otama.isDesktop` switches the engine base URL
 * from the gateway (XTransformPort) to a direct 127.0.0.1 connection.
 *
 * Users do NOT need Node.js installed: both child services run through
 * Electron's own binary with ELECTRON_RUN_AS_NODE=1.
 *
 * Remote-access architecture (v1.1.4+): an embedded gateway (gateway.mjs — a
 * Caddy clone in ~100 lines) fronts BOTH services on ONE stable port. A phone
 * on the internet therefore needs a single forwarded router port, while the
 * engine and Next.js stay safely on loopback.
 */
import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createServer, get } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startOtamaGateway } from './gateway.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..') // .../desktop

const ENGINE_PORT = 3003
const DEV_URL = process.env.OTAMA_DEV_URL || '' // e.g. http://localhost:3000 while developing the web UI
const APP_VERSION = readOwnVersion()

let mainWindow = null
let engineChild = null
let rendererChild = null
let quitting = false
let engineRestarts = 0
let rendererUrl = ''
let rendererPortNum = 0
let lanMode = false
let gwPortNum = 0
let lanPhoneUrl = ''
let tlsChild = null
let httpsActive = false

/* ------------------------------ small utils ------------------------------ */

function readOwnVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8'))
    return pkg.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

function log(...args) {
  console.log(`[otama] ${new Date().toISOString()}`, ...args)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** GET a URL and resolve with { ok, status, body }. */
function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false
    const done = (result) => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }
    try {
      const req = get(url, { timeout: timeoutMs }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => done({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body }))
      })
      req.on('error', () => done({ ok: false, status: 0, body: '' }))
      req.on('timeout', () => {
        req.destroy()
        done({ ok: false, status: 0, body: '' })
      })
    } catch {
      done({ ok: false, status: 0, body: '' })
    }
  })
}

/** Poll a URL until it answers ok, or timeout. */
async function waitUntilReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await httpGet(url, 2500)
    if (res.ok) return true
    await sleep(500)
  }
  return false
}

/** Ask the OS for a free TCP port. In LAN mode a STABLE port matters — the
 *  user types the address into their phone, so prefer the well-known 3000
 *  and only fall back to a random port when it is taken. */
function portAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.unref()
    srv.once('error', () => resolve(false))
    srv.listen({ port, host }, () => srv.close(() => resolve(true)))
  })
}

async function findFreePort(preferred) {
  if (preferred && (await portAvailable(preferred))) return preferred
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen({ port: 0, host: '127.0.0.1' }, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** First non-internal IPv4 address — the address phones should connect to. */
function lanAddress() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

/** Run a plain-node script through Electron's bundled Node runtime. */
function spawnAsNode(scriptPath, opts = {}) {
  return spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      ...(opts.env || {}),
    },
    cwd: opts.cwd || path.dirname(scriptPath),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function pipeChildLogs(child, tag) {
  child.stdout.on('data', (d) => process.stdout.write(`[${tag}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${tag}] ${d}`))
}

/* ------------------------------ engine ------------------------------ */

function engineDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(DESKTOP_ROOT, 'engine')
}

async function probeEngine(port) {
  const res = await httpGet(`http://127.0.0.1:${port}/health`, 2000)
  if (!res.ok) return false
  try {
    return JSON.parse(res.body).ok === true
  } catch {
    return false
  }
}

async function ensureEngine() {
  // 1) Another OTAMA instance (or the dev mini-service) may already run one.
  if (await probeEngine(ENGINE_PORT)) {
    log(`engine already healthy on :${ENGINE_PORT} — reusing`)
    return { port: ENGINE_PORT, reused: true }
  }

  // 2) Spawn our embedded engine.
  const script = path.join(engineDir(), 'engine.mjs')
  if (!fs.existsSync(script)) {
    throw new Error(`Engine script missing: ${script} (run "npm run prepare:engine" first)`)
  }
  const downloadDir = path.join(app.getPath('userData'), 'downloads')
  fs.mkdirSync(downloadDir, { recursive: true })

  const start = () => {
    engineChild = spawnAsNode(script, {
      env: {
        OTAMA_ENGINE_PORT: String(ENGINE_PORT),
        // The engine NEVER faces the network directly — the embedded gateway
        // proxies ?XTransformPort=3003 traffic to it (see gateway.mjs).
        OTAMA_HOST: '127.0.0.1',
        OTAMA_DOWNLOAD_DIR: downloadDir,
      },
    })
    pipeChildLogs(engineChild, 'otama-engine')
    engineChild.on('exit', (code) => {
      engineChild = null
      if (quitting) return
      log(`engine exited (code=${code})`)
      if (engineRestarts < 5) {
        engineRestarts += 1
        log(`restarting engine (attempt ${engineRestarts}/5) in 2s…`)
        setTimeout(() => {
          if (!quitting) start()
        }, 2000)
      }
    })
  }

  start()
  const healthy = await waitUntilReady(`http://127.0.0.1:${ENGINE_PORT}/health`, 30_000)
  if (!healthy) throw new Error(`Embedded engine failed to start on :${ENGINE_PORT}`)
  log(`engine started on :${ENGINE_PORT}`)
  return { port: ENGINE_PORT, reused: false }
}

/* ------------------------------ renderer (Next.js standalone) ------------------------------ */

function rendererDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'renderer') : path.join(DESKTOP_ROOT, 'resources', 'renderer')
}

/**
 * LAN mode — lets the OTAMA Android app (or any phone browser) connect to
 * this desktop instance over Wi-Fi (and, with a forwarded router port, from
 * the internet). Only the embedded GATEWAY binds 0.0.0.0; the engine and the
 * renderer stay on loopback and are reached through the gateway, so exactly
 * one port is ever exposed. Only opt in on trusted networks.
 */
function lanFlagPath() {
  return path.join(app.getPath('userData'), 'lan-mode')
}

function detectLanMode() {
  lanMode = process.env.OTAMA_LAN === '1' || fs.existsSync(lanFlagPath())
}

function toggleLanMode() {
  try {
    if (lanMode) {
      fs.rmSync(lanFlagPath(), { force: true })
    } else {
      fs.writeFileSync(lanFlagPath(), new Date().toISOString())
    }
  } catch (err) {
    log('lan toggle failed:', err)
  }
  app.relaunch()
  app.exit(0)
}

/* ------------------------- public (internet) address ------------------------- */

/**
 * The address phones use when they are NOT on the same Wi-Fi — e.g.
 * https://otama.linkpc.net. Resolution order:
 *   1. OTAMA_SERVER_URL / SERVER_URL / API_URL environment variable
 *   2. public-url.txt inside the user profile (editable in-app via the
 *      "Set public address" menu item — no terminal knowledge required)
 */
function publicUrlFilePath() {
  return path.join(app.getPath('userData'), 'public-url.txt')
}

function normalizePublicUrl(raw) {
  let u = String(raw || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u
  return u
}

function readPublicUrl() {
  const env = normalizePublicUrl(
    process.env.OTAMA_SERVER_URL || process.env.SERVER_URL || process.env.API_URL || '',
  )
  if (env) return env
  try {
    return normalizePublicUrl(fs.readFileSync(publicUrlFilePath(), 'utf8'))
  } catch {
    return ''
  }
}

const PROMPT_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>OTAMA — public address</title>
<style>
  body{background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;padding:22px 24px;font-size:13px;line-height:1.5}
  h2{margin:0 0 10px;font-size:16px;letter-spacing:.04em}
  p{color:#a1a1aa;margin:0 0 12px}
  code{color:#f59e0b;font-family:ui-monospace,Consolas,monospace;font-size:12px}
  input{width:100%;box-sizing:border-box;background:#27272a;border:1px solid #3f3f46;border-radius:8px;color:#fafafa;
    padding:10px 12px;font-size:14px;outline:none;margin:2px 0 10px}
  input:focus{border-color:#f59e0b}
  .hint{font-size:11.5px;color:#71717a}
  .row{display:flex;gap:10px;margin-top:14px}
  button{flex:1;padding:10px 0;border:0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  #save{background:#f59e0b;color:#09090b}
  #close{background:#27272a;color:#fafafa}
</style></head><body>
  <h2>Public address</h2>
  <p>The address phones use when they are <b>not</b> on your Wi-Fi — for example<br>
  <code>https://otama.linkpc.net</code> (https) or <code>http://otama.linkpc.net:3000</code></p>
  <input id="u" spellcheck="false" placeholder="https://your-domain">
  <p class="hint">https://… enables automatic HTTPS (Let's Encrypt; router must forward TCP 80+443).
  http://…:3000 is plain HTTP (forward TCP 3000). Your DDNS/domain must point at this network's public IP.
  Leave empty + Save to clear. OTAMA_SERVER_URL / SERVER_URL / API_URL environment variables override this file.</p>
  <div class="row">
    <button id="save">Save</button>
    <button id="close">Close</button>
  </div>
<script>
  var inp = document.getElementById('u')
  document.getElementById('save').onclick = function () {
    document.title = 'SAVE:' + encodeURIComponent(inp.value.trim())
  }
  document.getElementById('close').onclick = function () {
    document.title = 'CLOSE'
  }
  inp.focus()
</script></body></html>`

/** Small in-app dialog that saves public-url.txt (no terminal needed). */
function promptPublicUrl() {
  const win = new BrowserWindow({
    width: 560,
    height: 330,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#09090b',
    title: 'OTAMA — public address',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PROMPT_HTML)}`)
  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (event, title) => {
    if (title === 'CLOSE') {
      event.preventDefault()
      win.destroy()
    } else if (title.startsWith('SAVE:')) {
      event.preventDefault()
      const value = decodeURIComponent(title.slice(5)).trim()
      try {
        if (value) fs.writeFileSync(publicUrlFilePath(), normalizePublicUrl(value) + '\n')
        else fs.rmSync(publicUrlFilePath(), { force: true })
      } catch (err) {
        log('public-url save failed:', err)
      }
      win.destroy()
      buildMenu() // re-render menu labels with the new address
    }
  })
}

/* --------------------- automatic HTTPS (bundled Caddy) --------------------- */

function caddyBinPath() {
  const name = process.platform === 'win32' ? 'caddy.exe' : 'caddy'
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'caddy')
    : path.join(DESKTOP_ROOT, 'resources', 'caddy')
  return path.join(base, name)
}

/**
 * Serve the public HTTPS address with a real Let's Encrypt certificate.
 * Spawns the bundled Caddy when the public URL is https://<domain>:
 *
 *   internet ──► :443 (Caddy, auto-TLS for the domain)
 *                 └─ reverse_proxy ──► 127.0.0.1:<gateway>
 *   internet ──► :80  (Caddy) ──► redirect to https + ACME challenges
 *
 * Requires the router to forward TCP 80 + 443 to this PC and the domain to
 * point at this network's public IP. Failures never affect OTAMA itself —
 * the HTTP path (gateway :3000) keeps working regardless.
 */
async function maybeStartHttpsProxy() {
  const pub = readPublicUrl()
  if (!pub.startsWith('https://')) return null
  let host = ''
  try {
    host = new URL(pub).hostname || ''
  } catch {
    return null
  }
  // ACME needs a real domain — bare IPs cannot get certificates.
  if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    log(`https proxy skipped — '${host}' is not a domain name`)
    return null
  }
  const bin = caddyBinPath()
  if (!fs.existsSync(bin)) {
    log('https proxy skipped — bundled Caddy not present (HTTP path still works)')
    return null
  }

  const dir = path.join(app.getPath('userData'), 'caddy')
  const dataDir = path.join(dir, 'data')
  const cfgDir = path.join(dir, 'config')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.mkdirSync(cfgDir, { recursive: true })

  const caddyfile = [
    '{',
    '  admin off',
    `  storage file_system ${JSON.stringify(dataDir).replace(/\\/g, '/')}`,
    '}',
    `${host} {`,
    `  reverse_proxy 127.0.0.1:${gwPortNum} {`,
    '    header_up Host {host}',
    '    flush_interval -1',
    '  }',
    '}',
    '',
  ].join('\n')
  const cfgPath = path.join(dir, 'Caddyfile')
  fs.writeFileSync(cfgPath, caddyfile)

  const child = spawn(bin, ['run', '--config', cfgPath, '--adapter', 'caddyfile'], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: cfgDir,
      XDG_DATA_HOME: dataDir,
    },
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  pipeChildLogs(child, 'otama-https')
  child.on('exit', (code) => {
    tlsChild = null
    httpsActive = false
    log(`https proxy exited (code=${code}) — check router forwarding of TCP 80+443 and the domain A record`)
  })
  tlsChild = child
  httpsActive = true
  log(`https proxy starting for ${host} → 127.0.0.1:${gwPortNum} on ports 80+443`)
  return child
}

/**
 * TMDB credentials for the embedded renderer.
 *
 * prepare-renderer.mjs writes a renderer/.env containing the TMDB_* lines of
 * the project .env. The standalone Next server usually picks that up itself;
 * this explicit forward makes the credentials work even if @next/env's file
 * loading changes, and lets users override by dropping their own renderer/.env
 * (or setting TMDB_* in the environment they launch OTAMA from).
 */
function loadRendererTmdbEnv(dir) {
  const envPath = path.join(dir, '.env')
  const out = {}
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(TMDB_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env — TMDB features degrade gracefully */
  }
  for (const key of Object.keys(out)) {
    if (!process.env[key]) process.env[key] = out[key]
  }
  return Object.keys(out)
}

/**
 * First-run database bootstrap.
 *
 * Prisma does NOT create tables in an empty SQLite file, so packaging ships a
 * schema-initialized template (prepare-renderer.mjs runs `prisma db push`)
 * and we copy it into the user profile on first launch. Preserves a user's
 * favorites/history across upgrades — only copied when the file is absent.
 */
function ensureDatabaseFile(dbPath) {
  if (fs.existsSync(dbPath)) return
  const template = app.isPackaged
    ? path.join(process.resourcesPath, 'otama-template.db')
    : path.join(DESKTOP_ROOT, 'resources', 'otama-template.db')
  try {
    if (fs.existsSync(template)) {
      fs.copyFileSync(template, dbPath)
      log(`database initialized from template → ${dbPath}`)
      return
    }
  } catch (err) {
    log('template database copy failed:', err)
  }
  log(`no template database — Prisma will create an empty file at ${dbPath}`)
}

async function startRendererServer() {
  const dir = rendererDir()
  const serverJs = path.join(dir, 'server.js')
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Renderer server missing: ${serverJs} (run "npm run prepare:renderer" first)`)
  }

  // Loopback only — phones reach the UI through the gateway port.
  const port = await findFreePort(3001)
  rendererPortNum = port
  // Writable SQLite database inside the user profile (Prisma DATABASE_URL).
  const dbPath = path.join(app.getPath('userData'), 'otama.db').replace(/\\/g, '/')
  ensureDatabaseFile(dbPath)
  const tmdbKeys = loadRendererTmdbEnv(dir)
  if (tmdbKeys.length) log(`renderer TMDB credentials loaded: ${tmdbKeys.join(', ')}`)

  rendererChild = spawnAsNode(serverJs, {
    cwd: dir,
    env: {
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      DATABASE_URL: `file:${dbPath}`,
      OTAMA_DESKTOP: '1',
    },
  })
  pipeChildLogs(rendererChild, 'otama-web')

  rendererChild.on('exit', (code) => {
    rendererChild = null
    if (!quitting && mainWindow) {
      dialog.showErrorBox(
        'OTAMA — server stopped',
        `The embedded web server exited unexpectedly (code ${code}).\nPlease restart the app.`,
      )
      app.quit()
    }
  })

  const url = `http://127.0.0.1:${port}`
  const ready = await waitUntilReady(url, 60_000)
  if (!ready) throw new Error('Embedded web server did not become ready in time')
  log(`renderer ready at ${url}`)
  return url
}

/**
 * The ONE externally-reachable port. Mirrors the production Caddyfile: any
 * request carrying ?XTransformPort=<n> goes to the engine on <n>, everything
 * else goes to the Next.js UI. LAN mode binds 0.0.0.0 (phones), otherwise
 * loopback only (desktop window).
 */
async function startGatewayServer() {
  const port = await findFreePort(3000)
  const host = lanMode ? '0.0.0.0' : '127.0.0.1'
  await startOtamaGateway({ port, host, nextPort: rendererPortNum })
  gwPortNum = port
  log(`gateway listening on ${host}:${port} — UI :${rendererPortNum}, engine via ?XTransformPort`)
  return port
}

/* ------------------------------ window ------------------------------ */

const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#09090b;color:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;user-select:none}
  .mark{width:84px;height:84px;border-radius:22px;background:linear-gradient(135deg,#f59e0b,#d97706);
    display:flex;align-items:center;justify-content:center;box-shadow:0 12px 40px rgba(245,158,11,.25)}
  .tri{width:0;height:0;border-left:26px solid #09090b;border-top:16px solid transparent;border-bottom:16px solid transparent;margin-left:6px}
  h1{font-size:26px;letter-spacing:.35em;margin:0;font-weight:700;text-indent:.35em}
  p{color:#a1a1aa;font-size:13px;margin:0}
  .spin{width:18px;height:18px;border:2px solid #3f3f46;border-top-color:#f59e0b;border-radius:50%;animation:s .8s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head><body>
  <div class="mark"><div class="tri"></div></div>
  <h1>OTAMA</h1><p>starting torrent engine…</p><div class="spin"></div>
</body></html>`

function buildMenu() {
  const pub = readPublicUrl()
  const template = [
    {
      label: 'OTAMA',
      submenu: [
        { label: `OTAMA v${APP_VERSION}`, enabled: false },
        { type: 'separator' },
        {
          label: lanMode
            ? `LAN access: ON${lanPhoneUrl ? ` — same Wi-Fi: ${lanPhoneUrl}` : ''}`
            : 'LAN access: OFF — click to allow phones (restarts)',
          enabled: !lanMode,
          click: lanMode ? undefined : toggleLanMode,
        },
        ...(lanMode
          ? [{ label: 'Turn LAN access off (restarts OTAMA)', click: toggleLanMode }]
          : []),
        ...(lanMode
          ? [{ label: pub ? `Public address: ${pub}` : 'Public address: not set', enabled: false }]
          : []),
        ...(httpsActive ? [{ label: `HTTPS: ${pub} — automatic certificate (ports 80+443)`, enabled: false }] : []),
        {
          label: pub ? 'Edit public address…' : 'Set public address (domain)…',
          click: promptPublicUrl,
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'quit', label: 'Quit OTAMA' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    title: 'OTAMA',
    icon: path.join(DESKTOP_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // Splash while services boot.
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`)

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Any navigation outside our own origin (posters are <img>, links are external) → system browser.
  const allowed = (url) => url.startsWith(rendererUrl) || url.startsWith('devtools://') || url.startsWith('data:')
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!allowed(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowed(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/* ------------------------------ lifecycle ------------------------------ */

/**
 * Post-start API self-check. The phone UI speaks JSON to this embedded
 * server; if the API layer is broken (e.g. a packaging problem on this
 * machine), the desktop window still opens but every catalog/metadata call
 * fails with cryptic client errors. Surface it HERE, on the PC, in plain
 * words. Provider outages do NOT trigger this — those stay JSON (502).
 */
async function apiSmokeCheck(base) {
  const smoke = await httpGet(`${base}/api/catalog?type=movie&skip=0`, 25_000)
  const looksJson = (smoke.body || '').trimStart().startsWith('{')
  if (smoke.ok && looksJson) {
    log('API self-check ok (JSON)')
    return
  }
  const bodyStart = (smoke.body || '').slice(0, 100).replace(/\s+/g, ' ')
  log(`API self-check FAILED — status=${smoke.status} body="${bodyStart}"`)
  dialog.showMessageBox({
    type: 'warning',
    title: 'OTAMA — self-check',
    message: 'OTAMA started, but its local API answered unexpectedly.',
    detail:
      `HTTP ${smoke.status} (expected JSON)${bodyStart ? ` — got: ${bodyStart}` : ''}\n\n` +
      'Phones connecting over LAN will not be able to browse metadata.\n' +
      'Try restarting OTAMA once; if it keeps happening, reinstall the app.',
    buttons: ['OK'],
  })
}

function killChildren() {
  for (const child of [engineChild, rendererChild, tlsChild]) {
    if (child && !child.killed) {
      try {
        child.kill()
      } catch {
        /* noop */
      }
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    detectLanMode()
    log(`OTAMA desktop v${APP_VERSION} — platform=${process.platform} packaged=${app.isPackaged} dev=${!!DEV_URL} lan=${lanMode}`)
    buildMenu()

    try {
      const engine = await ensureEngine()
      // The preload script reads these; must be set BEFORE the window exists.
      process.env.OTAMA_ENGINE_PORT = String(engine.port)
      process.env.OTAMA_VERSION = APP_VERSION

      if (DEV_URL) {
        rendererUrl = DEV_URL.replace(/\/$/, '')
        log(`dev mode — loading ${rendererUrl} (engine :${engine.port})`)
        createWindow()
        await mainWindow.loadURL(rendererUrl)
      } else {
        // Next.js on loopback → gateway in front on the ONE public port.
        await startRendererServer()
        const gwPort = await startGatewayServer()
        // rendererUrl = the origin the window loads (gateway) — also used by
        // the external-navigation guard in createWindow().
        rendererUrl = `http://127.0.0.1:${gwPort}`
        createWindow()
        await mainWindow.loadURL(rendererUrl)
        log('window loaded — OTAMA is ready')
        void apiSmokeCheck(rendererUrl)
      }

      // Automatic HTTPS for the public domain (bundled Caddy) — works with
      // or without LAN mode since it proxies the loopback gateway.
      if (!DEV_URL && (await maybeStartHttpsProxy())) {
        buildMenu()
      }

      if (lanMode && !DEV_URL) {
        const lan = lanAddress()
        lanPhoneUrl = lan ? `http://${lan}:${gwPortNum}` : ''
        const pub = readPublicUrl()
        buildMenu()
        if (lanPhoneUrl) {
          log(`LAN mode — phones on the same Wi-Fi connect to ${lanPhoneUrl}`)
          dialog.showMessageBox({
            type: 'info',
            title: 'OTAMA — LAN access is ON',
            message: 'Phones can now use OTAMA.',
            detail:
              `SAME WI-FI — enter this in the OTAMA Android app:

${lanPhoneUrl}

` +
              (pub
                ? `INTERNET (anywhere) — enter this instead:

${pub}

One-time setup: forward TCP port ${gwPortNum} on your router to this PC, ` +
                  `and make sure your domain (otama.linkpc.net or your own) points at this network's public IP.

`
                : 'INTERNET (anywhere) — set your domain via menu:\nOTAMA → "Set public address (domain)…"\n\n') +
              'If Windows Firewall asks, allow OTAMA on private AND public networks.',
            buttons: ['OK'],
          })
        } else {
          buildMenu()
          log('LAN mode — no LAN IPv4 address found (offline?)')
        }
      } else {
        buildMenu()
      }
    } catch (err) {
      log('startup failed:', err)
      dialog.showErrorBox('OTAMA failed to start', String(err?.message || err))
      app.quit()
    }
  })

  app.on('before-quit', () => {
    quitting = true
    killChildren()
  })

  app.on('window-all-closed', () => {
    // Windows convention: quit when the window is closed.
    app.quit()
  })

  app.on('quit', () => {
    quitting = true
    killChildren()
  })

  process.on('exit', killChildren)
}
