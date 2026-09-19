/**
 * Patches electron-builder 26 for WINE-FREE Windows cross-builds on Linux,
 * and allows bundling node_modules via extraResources (required by the
 * self-contained Next.js standalone renderer and the embedded torrent engine).
 *
 * Patch 1 — NsisTarget.js
 *   Runs the freshly-built installer under wine to extract the NSIS
 *   uninstaller — except on macOS Catalina+, where a pure-JS
 *   UninstallerReader.exec() does the same job without executing anything.
 *   This patch lets Linux use that same pure-JS path (the catch-branch VM
 *   fallback still exists and still fails loudly if extraction ever breaks).
 *
 * Patch 2 — util/filter.js
 *   createFilter() hard-rejects any root-level "node_modules" directory of an
 *   extraResources copy (electron-builder#867). OTAMA's renderer/engine are
 *   SELF-CONTAINED and REQUIRE their node_modules at runtime, so the rejection
 *   is dropped for our copies.
 *
 * Idempotent: safe to run on every build. CI (windows-latest) is unaffected —
 * Windows takes its own native branch before Patch 1 is reached, and Patch 2
 * only enables what OTAMA's extraResources explicitly declare.
 *
 * Run automatically before dist:win / dist:win:portable / dist:dir via npm
 * pre-scripts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIB = path.join(DESKTOP_ROOT, 'node_modules', 'app-builder-lib', 'out')

let patched = 0

/* Patch 1 — wine-free uninstaller extraction on Linux */
{
  const TARGET = path.join(LIB, 'targets', 'nsis', 'NsisTarget.js')
  const ORIGINAL = 'if ((0, macosVersion_1.isMacOsCatalina)()) {'
  const PATCHED = 'if ((0, macosVersion_1.isMacOsCatalina)() || process.platform === "linux") { // OTAMA patch: wine-free uninstaller extraction on Linux'
  let src
  try {
    src = fs.readFileSync(TARGET, 'utf8')
  } catch {
    console.log('[patch-builder] electron-builder not installed — nothing to patch')
    process.exit(0)
  }
  if (src.includes(PATCHED)) {
    console.log('[patch-builder] NsisTarget.js already patched — skipping')
    patched += 1
  } else if (src.includes(ORIGINAL)) {
    fs.writeFileSync(TARGET, src.replace(ORIGINAL, PATCHED), 'utf8')
    console.log('[patch-builder] patched NsisTarget.js — Linux now uses pure-JS uninstaller extraction (no wine)')
    patched += 1
  } else {
    console.warn('[patch-builder] WARNING: NsisTarget.js expected code not found — electron-builder version changed?')
  }
}

/* Patch 2 — allow root node_modules inside extraResources copies */
{
  const TARGET = path.join(LIB, 'util', 'filter.js')
  const ORIGINAL = `        if (relative === "node_modules") {
            return false;
        }
        else if (relative.endsWith("/node_modules")) {`
  const PATCHED = `        // OTAMA patch: root node_modules rejection removed — OTAMA bundles self-contained renderer/engine node_modules via extraResources
        if (relative.endsWith("/node_modules")) {`
  let src
  try {
    src = fs.readFileSync(TARGET, 'utf8')
  } catch {
    console.warn('[patch-builder] WARNING: util/filter.js not found — skipping node_modules patch')
  }
  if (src != null) {
    if (src.includes(PATCHED)) {
      console.log('[patch-builder] util/filter.js already patched — skipping')
      patched += 1
    } else if (src.includes(ORIGINAL)) {
      fs.writeFileSync(TARGET, src.replace(ORIGINAL, PATCHED), 'utf8')
      console.log('[patch-builder] patched util/filter.js — extraResources may now bundle node_modules')
      patched += 1
    } else {
      console.warn('[patch-builder] WARNING: util/filter.js expected code not found — electron-builder version changed?')
    }
  }
}

if (patched < 2 && patched > 0) process.exitCode = 1
