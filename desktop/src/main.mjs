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
 */
import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createServer, get } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

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
        OTAMA_HOST: lanMode ? '0.0.0.0' : '127.0.0.1',
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
 * this desktop instance over Wi-Fi. When enabled, BOTH the renderer server
 * and the torrent engine bind to 0.0.0.0 instead of loopback. The engine is
 * torrent-stream REST + streaming with permissive CORS by design; only opt in
 * on trusted networks.
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

  const port = await findFreePort(lanMode ? 3000 : undefined)
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
      HOSTNAME: lanMode ? '0.0.0.0' : '127.0.0.1',
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

function buildMenu(lanAddr) {
  const template = [
    {
      label: 'OTAMA',
      submenu: [
        { label: `OTAMA v${APP_VERSION}`, enabled: false },
        { type: 'separator' },
        {
          label: lanMode
            ? `LAN access: ON${lanAddr ? ` — phones connect to ${lanAddr}` : ''}`
            : 'LAN access: OFF — click to allow phones (restarts)',
          enabled: !lanMode,
          click: lanMode ? undefined : toggleLanMode,
        },
        ...(lanMode
          ? [{ label: 'Turn LAN access off (restarts OTAMA)', click: toggleLanMode }]
          : []),
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
  for (const child of [engineChild, rendererChild]) {
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
        rendererUrl = await startRendererServer()
        createWindow()
        await mainWindow.loadURL(rendererUrl)
        log('window loaded — OTAMA is ready')
        void apiSmokeCheck(rendererUrl)
      }

      if (lanMode && !DEV_URL) {
        const lan = lanAddress()
        const phoneUrl = lan ? `http://${lan}:${rendererPortNum}` : null
        buildMenu(phoneUrl || 'LAN')
        if (phoneUrl) {
          log(`LAN mode — phones connect to ${phoneUrl}`)
          dialog.showMessageBox({
            type: 'info',
            title: 'OTAMA — LAN access is ON',
            message: 'Phones on your Wi-Fi can now use OTAMA.',
            detail:
              `Open the OTAMA Android app and enter:\n\n${phoneUrl}\n\n` +
              'Both devices must be on the same Wi-Fi network.\n' +
              'If Windows Firewall asks, allow OTAMA on private networks.',
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
