/**
 * Downloads the Caddy web server into resources/caddy/ so the packaged desktop
 * app can serve AUTOMATIC HTTPS (Let's Encrypt) for a user-configured public
 * domain, e.g. https://otama.your-domain.com.
 *
 * - Runs everywhere Node runs; uses only Node stdlib + tar/PowerShell.
 * - Fail-soft: if a download fails (offline runner, GitHub hiccup), the build
 *   continues WITHOUT that binary — OTAMA still works over HTTP.
 * - macOS DMGs are built for BOTH CPU arches from one runner, so on darwin we
 *   download BOTH binaries with arch-suffixed names (caddy-arm64 / caddy-x64);
 *   main.mjs picks the right one at runtime via process.arch.
 * - Called from the CI workflows and as part of `npm run prepare:all`
 *   (dist:win / dist:mac).
 */
import { execSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CADDY_VERSION = '2.8.4'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(DESKTOP_ROOT, 'resources', 'caddy')

/**
 * Per host platform: list of { file, bin } downloads.
 * `file` = caddy release archive, `bin` = name the binary must end up as.
 * On darwin both arches are fetched so one runner can package arm64 + x64 DMGs.
 */
const TARGETS = {
  win32_x64: [
    { file: `caddy_${CADDY_VERSION}_windows_amd64.zip`, bin: 'caddy.exe' },
  ],
  darwin_arm64: [
    { file: `caddy_${CADDY_VERSION}_mac_arm64.tar.gz`, bin: 'caddy-arm64' },
    { file: `caddy_${CADDY_VERSION}_mac_amd64.tar.gz`, bin: 'caddy-x64' },
  ],
  darwin_x64: [
    { file: `caddy_${CADDY_VERSION}_mac_arm64.tar.gz`, bin: 'caddy-arm64' },
    { file: `caddy_${CADDY_VERSION}_mac_amd64.tar.gz`, bin: 'caddy-x64' },
  ],
}

const key = `${process.platform}_${process.arch}`
mkdirSync(OUT_DIR, { recursive: true })

const targets = TARGETS[key]
if (!targets) {
  console.log(`[prepare-caddy] no Caddy binary for ${key} — HTTPS proxy will be disabled (HTTP still works)`)
  writeFileSync(path.join(OUT_DIR, 'README.txt'), `No Caddy binary for ${key}. Automatic HTTPS disabled; OTAMA serves plain HTTP.\n`)
  process.exit(0)
}

let downloaded = 0
for (const target of targets) {
  const binPath = path.join(OUT_DIR, target.bin)
  if (existsSync(binPath)) {
    console.log(`[prepare-caddy] ${target.bin} already present — skipping`)
    downloaded += 1
    continue
  }

  const url = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/${target.file}`
  console.log(`[prepare-caddy] downloading ${url}`)
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())

    const archive = path.join(OUT_DIR, target.file)
    writeFileSync(archive, buf)

    // Extract into a temp dir — every caddy archive calls its binary "caddy",
    // so two downloads need two extraction dirs before the final rename.
    const tmpDir = path.join(OUT_DIR, `.tmp-${target.bin}`)
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${archive}' -DestinationPath '${tmpDir}' -Force"`,
        { stdio: 'inherit' },
      )
    } else {
      execSync(`tar -xzf '${archive}' -C '${tmpDir}'`, { stdio: 'inherit' })
    }
    rmSync(archive, { force: true })

    const extracted = path.join(tmpDir, process.platform === 'win32' ? 'caddy.exe' : 'caddy')
    if (!existsSync(extracted)) throw new Error('binary not found after extraction')
    if (process.platform !== 'win32') chmodSync(extracted, 0o755)
    renameSync(extracted, binPath)
    rmSync(tmpDir, { recursive: true, force: true })

    console.log(`[prepare-caddy] Caddy v${CADDY_VERSION} ready → ${binPath}`)
    downloaded += 1
  } catch (err) {
    console.warn(`[prepare-caddy] ${target.bin} download failed (${err.message}) — continuing without it`)
  }
}

if (downloaded === 0) {
  writeFileSync(path.join(OUT_DIR, 'README.txt'), `Caddy downloads failed on the build machine (${key}). Automatic HTTPS disabled; OTAMA serves plain HTTP.\n`)
} else {
  console.log(`[prepare-caddy] ${downloaded}/${targets.length} Caddy binary(ies) ready.`)
}
