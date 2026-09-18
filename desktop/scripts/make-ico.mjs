/**
 * Generates desktop/build/icon.ico from desktop/build/icon.png.
 *
 * Uses sharp (root project dependency) to rasterize every classic Windows icon
 * size, then png-to-ico (desktop devDependency) to pack them into a single .ico.
 *
 * Usage:  npm run make:icon   (inside desktop/)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_DIR = path.join(DESKTOP_ROOT, 'build')
const SRC = path.join(BUILD_DIR, 'icon.png')

const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`icon.png not found at ${SRC} — export a 1024x1024 master first`)
  const pngs = []
  for (const size of SIZES) {
    const out = path.join(BUILD_DIR, `.icon-${size}.png`)
    await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toFile(out)
    pngs.push(out)
  }
  const ico = await pngToIco(pngs)
  const dest = path.join(BUILD_DIR, 'icon.ico')
  fs.writeFileSync(dest, ico)
  // 512 px PNG copy for docs/CI artifacts
  await sharp(SRC).resize(512, 512, { fit: 'cover' }).png().toFile(path.join(BUILD_DIR, 'icon-512.png'))
  for (const p of pngs) fs.rmSync(p, { force: true })
  console.log(`[make-ico] wrote ${dest} (${SIZES.join(', ')})`)
}

main().catch((err) => {
  console.error('[make-ico] failed:', err)
  process.exit(1)
})
