/**
 * Builds the OTAMA web UI (Next.js, standalone output) and copies it into
 * desktop/resources/renderer so electron-builder can embed it.
 *
 * Cross-platform (works on Windows CI and Linux cross-builds alike).
 *
 * Steps:
 *   1. `npx next build` in the project root with OTAMA_PACK_BUILD=1
 *      → builds into .next-pack (never touches the live dev server's .next)
 *   2. copy .next-pack/standalone         → desktop/resources/renderer
 *   3. copy .next-pack/static             → desktop/resources/renderer/.next/static
 *   4. copy public/                       → desktop/resources/renderer/public
 *   5. copy TMDB_* lines from the project .env into renderer/.env so the
 *      embedded standalone server picks the TMDB credentials up at runtime
 *      (the desktop main process overrides DATABASE_URL itself).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')
const DEST = path.join(DESKTOP_ROOT, 'resources', 'renderer')
const PACK_DIST = path.join(PROJECT_ROOT, '.next-pack')

function cp(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing build artifact: ${src}`)
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[prepare-renderer] copied ${path.relative(PROJECT_ROOT, src)} → ${path.relative(DESKTOP_ROOT, dest)}`)
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('[prepare-renderer] building web UI (npx next build, OTAMA_PACK_BUILD=1)…')
execSync('npx next build', {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    OTAMA_PACK_BUILD: '1',
    // Build-time placeholder only; the desktop main process injects the real
    // per-user DB path (userData/otama.db) at runtime.
    DATABASE_URL: process.env.DATABASE_URL || 'file:./db/build-placeholder.db',
  },
})

console.log('[prepare-renderer] assembling standalone renderer…')
rm(DEST)
fs.mkdirSync(DEST, { recursive: true })

cp(path.join(PACK_DIST, 'standalone'), DEST)
// distDir is ".next-pack" during packaging (OTAMA_PACK_BUILD=1) — static
// assets must live INSIDE the dist dir the standalone server actually reads.
cp(path.join(PACK_DIST, 'static'), path.join(DEST, '.next-pack', 'static'))
cp(path.join(PROJECT_ROOT, 'public'), path.join(DEST, 'public'))

if (!fs.existsSync(path.join(DEST, 'server.js'))) {
  throw new Error('Standalone server.js not found after copy — build output format changed?')
}

// --- TMDB credentials -------------------------------------------------------
// The web deployment reads TMDB_API_KEY / TMDB_ACCESS_TOKEN from the project
// .env. The packaged desktop app runs from an isolated directory, so hand the
// standalone server an .env containing ONLY the TMDB lines (DATABASE_URL is
// always injected by the Electron main process and must never be overridden).
const envSrc = path.join(PROJECT_ROOT, '.env')
if (fs.existsSync(envSrc)) {
  const tmdbLines = fs
    .readFileSync(envSrc, 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\s*(TMDB_[A-Z_]+)\s*=/.test(line))
  if (tmdbLines.length) {
    fs.writeFileSync(path.join(DEST, '.env'), tmdbLines.join('\n') + '\n', 'utf8')
    console.log(`[prepare-renderer] wrote renderer/.env with ${tmdbLines.length} TMDB line(s)`)
  } else {
    console.warn('[prepare-renderer] WARNING: project .env has no TMDB_* lines — TMDB features will be unavailable in the packaged app')
  }
} else {
  console.warn('[prepare-renderer] WARNING: no project .env found — TMDB features will be unavailable in the packaged app')
}

// --- Sanity: Prisma engines -------------------------------------------------
// Both the native engine and the cross-target engines (e.g. the Windows dll)
// must be inside the standalone bundle via outputFileTracingIncludes.
const prismaDir = path.join(DEST, 'node_modules', '.prisma', 'client')
if (fs.existsSync(prismaDir)) {
  const engines = fs.readdirSync(prismaDir).filter((f) => f.includes('engine') || f.endsWith('.dll.node') || f.endsWith('.so.node'))
  console.log(`[prepare-renderer] bundled Prisma engines: ${engines.join(', ') || 'NONE'}`)
} else {
  console.warn('[prepare-renderer] WARNING: no .prisma/client in standalone — check outputFileTracingIncludes')
}

// --- Template database ------------------------------------------------------
// The packaged app gets a fresh userData dir — an EMPTY SQLite file would make
// favorites/history 500 (P2021). Create a schema-initialized template at build
// time; the Electron main process copies it to userData/otama.db on first run.
const TEMPLATE_DB = path.join(DESKTOP_ROOT, 'resources', 'otama-template.db')
console.log('[prepare-renderer] creating template SQLite database…')
execSync('npx prisma db push --skip-generate', {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
})

fs.writeFileSync(
  path.join(DEST, 'otama-build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), platform: process.platform }, null, 2),
)

console.log('[prepare-renderer] renderer ready at desktop/resources/renderer')
