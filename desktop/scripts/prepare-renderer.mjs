/**
 * Builds the OTAMA web UI (Next.js, standalone output) and copies it into
 * desktop/resources/renderer so electron-builder can embed it.
 *
 * Cross-platform (works on Windows CI): performs the standalone assembly in
 * Node instead of the root package.json's `cp`-based build script.
 *
 * Steps:
 *   1. `npx next build` in the project root  → .next/standalone
 *   2. copy .next/standalone              → desktop/resources/renderer
 *   3. copy .next/static                  → desktop/resources/renderer/.next/static
 *   4. copy public/                       → desktop/resources/renderer/public
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = path.resolve(DESKTOP_ROOT, '..')
const DEST = path.join(DESKTOP_ROOT, 'resources', 'renderer')

function cp(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing build artifact: ${src}`)
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[prepare-renderer] copied ${path.relative(PROJECT_ROOT, src)} → ${path.relative(DESKTOP_ROOT, dest)}`)
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('[prepare-renderer] building web UI (npx next build)…')
execSync('npx next build', { cwd: PROJECT_ROOT, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })

console.log('[prepare-renderer] assembling standalone renderer…')
rm(DEST)
fs.mkdirSync(DEST, { recursive: true })

cp(path.join(PROJECT_ROOT, '.next', 'standalone'), DEST)
cp(path.join(PROJECT_ROOT, '.next', 'static'), path.join(DEST, '.next', 'static'))
cp(path.join(PROJECT_ROOT, 'public'), path.join(DEST, 'public'))

if (!fs.existsSync(path.join(DEST, 'server.js'))) {
  throw new Error('Standalone server.js not found after copy — build output format changed?')
}

fs.writeFileSync(
  path.join(DEST, 'otama-build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), platform: process.platform }, null, 2),
)

console.log('[prepare-renderer] renderer ready at desktop/resources/renderer')
