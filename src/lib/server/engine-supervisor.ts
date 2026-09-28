/**
 * OTAMA engine supervisor — guarantees a torrent-streaming engine exists
 * next to the web server.
 *
 * WHY: the web UI needs the engine mini-service (port 3003) for every Play
 * action, but the engine used to be started only as a separate manual
 * process. Cloud deployments that just boot the Next.js server (Z.ai
 * hosting, self-hosted `next start`, Docker…) ended up with a UI that lists
 * torrents fine (server-side APIs) yet fails every Play with
 * "Streaming engine unreachable" — the gateway answered the engine route
 * with 502 because NOTHING was listening on :3003.
 *
 * HOW: `src/instrumentation.ts` calls `ensureEngineSupervisor()` once at
 * server boot. The supervisor:
 *   1. skips entirely inside the desktop shell (Electron starts + owns its
 *      own engine — it exports OTAMA_ENGINE_PORT / OTAMA_DESKTOP into the
 *      renderer server's env);
 *   2. reuses an already-healthy engine on :3003 (manual mini-service,
 *      orphaned engine from a previous run — reuse is by design);
 *   3. otherwise spawns the bundled plain-JS engine
 *      (desktop/engine/engine.mjs — same REST/socket surface, runs on the
 *      current runtime) on 127.0.0.1:3003 where the gateway's
 *      XTransformPort route expects it;
 *   4. keeps a low-frequency watchdog that respawns the engine if it ever
 *      dies (max attempts, then gives up quietly).
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ENGINE_PORT = 3003
const SCRIPT_CANDIDATES = [
  'desktop/engine/engine.mjs', // project root (dev server, repo checkouts)
  '../../desktop/engine/engine.mjs', // `next start` standalone (cwd = .next/standalone)
  '../desktop/engine/engine.mjs', // nested standalone layouts
]
const MAX_SPAWN_ATTEMPTS = 8
const BOOT_TIMEOUT_MS = 12_000
const WATCHDOG_INTERVAL_MS = 45_000

type SupervisorState = {
  booted: boolean
  attempts: number
  watchdog?: ReturnType<typeof setInterval>
  child?: ReturnType<typeof spawn>
}

const g = globalThis as unknown as { __otamaEngineSupervisor?: SupervisorState }
const state: SupervisorState =
  g.__otamaEngineSupervisor ?? { booted: false, attempts: 0 }
g.__otamaEngineSupervisor = state

async function healthOk(timeoutMs: number): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`http://127.0.0.1:${ENGINE_PORT}/health`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return false
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null
    return j?.ok === true
  } catch {
    return false
  }
}

function resolveEngineScript(): string | null {
  for (const rel of SCRIPT_CANDIDATES) {
    const abs = path.resolve(process.cwd(), rel)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

function spawnEngine(): void {
  if (state.attempts >= MAX_SPAWN_ATTEMPTS) {
    if (state.attempts === MAX_SPAWN_ATTEMPTS) {
      state.attempts++ // only log the give-up once
      console.error('[otama-engine] giving up — engine failed to stay up after max attempts')
    }
    return
  }
  state.attempts++
  const script = resolveEngineScript()
  if (!script) {
    console.error(
      `[otama-engine] bundled engine script not found under ${process.cwd()} — cannot spawn`,
    )
    return
  }
  try {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OTAMA_ENGINE_PORT: String(ENGINE_PORT),
        // Loopback only: the gateway (Caddy XTransformPort route) forwards
        // to localhost — the engine must never be exposed directly.
        OTAMA_HOST: '127.0.0.1',
        ELECTRON_RUN_AS_NODE: undefined,
      } as NodeJS.ProcessEnv,
      stdio: 'inherit', // engine logs land in dev.log / server.log
      detached: false,
    })
    state.child = child
    child.on('error', (err) =>
      console.error('[otama-engine] spawn error:', err.message),
    )
    child.on('exit', (code) => {
      if (code && code !== 0) {
        console.warn(`[otama-engine] engine exited (code ${code})`)
      }
      if (state.child === child) state.child = undefined
    })
    child.unref()
    console.log(`[otama-engine] spawned engine (pid ${child.pid}) on :${ENGINE_PORT}`)
  } catch (err) {
    console.error('[otama-engine] spawn failed:', (err as Error).message)
  }
}

function startWatchdog(): void {
  if (state.watchdog) return
  state.watchdog = setInterval(() => {
    void (async () => {
      if (await healthOk(1500)) return
      console.warn('[otama-engine] watchdog: engine down — respawning')
      spawnEngine()
    })()
  }, WATCHDOG_INTERVAL_MS)
  state.watchdog.unref()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Make sure an engine is (or will soon be) listening on :3003.
 * Idempotent and safe to call from instrumentation AND API routes.
 * Returns true when a healthy engine is confirmed, false when spawning
 * is skipped or still in progress (never throws).
 */
export async function ensureEngineSupervisor(): Promise<boolean> {
  if (state.booted) return true

  // Desktop shell: Electron starts and owns the engine (its port is exported
  // as OTAMA_ENGINE_PORT for the preload bridge). Never spawn a second one.
  if (process.env.OTAMA_DESKTOP === '1' || process.env.OTAMA_ENGINE_PORT) {
    state.booted = true
    return false
  }
  // Escape hatch for exotic deployments.
  if (process.env.OTAMA_NO_ENGINE_SPAWN === '1') {
    state.booted = true
    return false
  }

  if (await healthOk(1500)) {
    state.booted = true
    console.log(`[otama-engine] engine already healthy on :${ENGINE_PORT} — supervisor idle`)
    startWatchdog()
    return true
  }

  console.log(`[otama-engine] no engine on :${ENGINE_PORT} — spawning bundled engine…`)
  for (let i = 0; i < 3 && !state.booted; i++) {
    spawnEngine()
    const deadline = Date.now() + BOOT_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(900)
      if (await healthOk(1200)) {
        state.booted = true
        console.log(`[otama-engine] engine is up on :${ENGINE_PORT} — streaming ready`)
        startWatchdog()
        return true
      }
    }
    console.warn(`[otama-engine] boot attempt ${i + 1} did not become healthy — retrying`)
  }
  // Keep trying quietly in the background; the client also retries.
  startWatchdog()
  return false
}
