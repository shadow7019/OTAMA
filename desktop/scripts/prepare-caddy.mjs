/**
 * Downloads the platform-matched Caddy web server into resources/caddy/ so
 * the packaged desktop app can serve AUTOMATIC HTTPS (Let's Encrypt) for a
 * user-configured public domain, e.g. https://otama.linkpc.net.
 *
 * - Runs everywhere Node runs; uses only Node stdlib + tar/PowerShell.
 * - Fail-soft: if the download fails (offline runner, GitHub hiccup), the
 *   build continues WITHOUT the HTTPS proxy — OTAMA still works over HTTP.
 * - Called as part of `npm run prepare:all` (dist:win / dist:mac), so CI
 *   workflows need no changes.
 */
import { execSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CADDY_VERSION = '2.8.4'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(DESKTOP_ROOT, 'resources', 'caddy')

/** release archive + expected binary name per platform/arch */
const TARGETS = {
  win32_x64: { file: `caddy_${CADDY_VERSION}_windows_amd64.zip`, bin: 'caddy.exe' },
  darwin_arm64: { file: `caddy_${CADDY_VERSION}_mac_arm64.tar.gz`, bin: 'caddy' },
}

const key = `${process.platform}_${process.arch}`
mkdirSync(OUT_DIR, { recursive: true })

const target = TARGETS[key]
if (!target) {
  console.log(`[prepare-caddy] no Caddy binary for ${key} — HTTPS proxy will be disabled (HTTP still works)`)
  writeFileSync(path.join(OUT_DIR, 'README.txt'), `No Caddy binary for ${key}. Automatic HTTPS disabled; OTAMA serves plain HTTP.\n`)
  process.exit(0)
}

const binPath = path.join(OUT_DIR, target.bin)
if (existsSync(binPath)) {
  console.log(`[prepare-caddy] Caddy already present → ${binPath}`)
  process.exit(0)
}

const url = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${target.file}`
console.log(`[prepare-caddy] downloading ${url}`)

try {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())

  const archive = path.join(OUT_DIR, target.file)
  writeFileSync(archive, buf)

  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${archive}' -DestinationPath '${OUT_DIR}' -Force"`,
      { stdio: 'inherit' },
    )
  } else {
    execSync(`tar -xzf '${archive}' -C '${OUT_DIR}'`, { stdio: 'inherit' })
  }
  rmSync(archive, { force: true })
  if (process.platform !== 'win32') chmodSync(binPath, 0o755)

  if (!existsSync(binPath)) throw new Error('binary not found after extraction')
  console.log(`[prepare-caddy] Caddy v${CADDY_VERSION} ready → ${binPath}`)
} catch (err) {
  console.warn(`[prepare-caddy] download failed (${err.message}) — continuing WITHOUT automatic HTTPS`)
  writeFileSync(path.join(OUT_DIR, 'README.txt'), `Caddy download failed on the build machine (${key}). Automatic HTTPS disabled; OTAMA serves plain HTTP.\n`)
}
