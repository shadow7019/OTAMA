import sharp from 'sharp'
import fs from 'node:fs'
const SRC = 'upload/ChatGPT Image Sep 30, 2026 at 06_44_12 PM.png'
// Art bbox measured: 98,94 - 1155,1143 (1058x1050). Center square crop, 0.6% inset.
const cx = (98 + 1155) / 2, cy = (94 + 1143) / 2
let side = 1058
side = Math.round(side * 0.988) // inset edge halo
const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2)
const master = sharp(SRC).extract({ left, top, width: side, height: side }).resize(1024, 1024, { kernel: 'lanczos3' }).png()
const buf1024 = await sharp(await master.toBuffer()).png().toBuffer()
const out = async (p, size, input) => {
  const data = await sharp(input || buf1024).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  fs.writeFileSync(p, data)
  console.log('wrote', p, size)
}
await out('desktop/build/icon-master.png', 1024)
fs.writeFileSync('desktop/build/icon.png', buf1024); console.log('wrote desktop/build/icon.png 1024')
await out('desktop/build/icon-512.png', 512)
await out('public/logo.png', 512)
await out('ios/OTAMA/Assets.xcassets/AppIcon.appiconset/AppIcon.png', 1024)
const sizes = { 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png': 48, 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': 72, 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png': 96, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png': 144, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': 192 }
for (const [p, s] of Object.entries(sizes)) await out(p, s)
// --- icns (PNG-embedded ic07/ic08/ic09/ic10) ---
const icnsPath = 'desktop/build/icon.icns'
const entries = []
for (const [type, size] of [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const png = await sharp(buf1024).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  const head = Buffer.alloc(8); head.write(type, 0, 'ascii'); head.writeUInt32BE(png.length + 8, 4)
  entries.push(Buffer.concat([head, png]))
}
const body = Buffer.concat(entries)
const hdr = Buffer.alloc(8); hdr.write('icns', 0, 'ascii'); hdr.writeUInt32BE(body.length + 8, 4)
fs.writeFileSync(icnsPath, Buffer.concat([hdr, body]))
console.log('wrote', icnsPath, body.length + 8, 'bytes')
