/**
 * Installs the embedded engine's runtime dependencies (torrent-stream, socket.io).
 * Runs everywhere Node runs (Windows/macOS/Linux) — no bun required.
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE_DIR = path.join(DESKTOP_ROOT, 'engine')

console.log('[prepare-engine] installing engine dependencies…')
execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
  cwd: ENGINE_DIR,
  stdio: 'inherit',
})
console.log('[prepare-engine] engine dependencies ready.')
