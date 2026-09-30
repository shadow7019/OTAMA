import sharp from 'sharp'
import fs from 'node:fs'
const SRC = 'upload/ChatGPT Image Sep 30, 2026 at 06_55_23 PM.png'
// FULL ART: rounded square incl. neon glow (bbox 78,45..1178,1217), center-square, 0.5% inset
const fullBuf = await sharp(SRC).extract({ left: 46, top: 48, width: 1166, height: 1166 })
  .resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer()
// MARK (swirl O only): geometric crop, avoids wordmark (starts ~66%)
const markBuf = await sharp(SRC).extract({ left: 220, top: 44, width: 778, height: 778 })
  .resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer()
const out = async (p, size, input) => {
  fs.writeFileSync(p, await sharp(input).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer())
  console.log('wrote', p, size)
}
// full art → desktop + iOS + web logo
fs.writeFileSync('desktop/build/icon-master.png', fullBuf); console.log('wrote desktop/build/icon-master.png 1024')
fs.writeFileSync('desktop/build/icon.png', fullBuf); console.log('wrote desktop/build/icon.png 1024')
await out('desktop/build/icon-512.png', 512, fullBuf)
await out('public/logo.png', 512, fullBuf)
fs.copyFileSync('desktop/build/icon-master.png', 'ios/OTAMA/Assets.xcassets/AppIcon.appiconset/AppIcon.png'); console.log('wrote iOS AppIcon.png 1024')
// mark → android mipmaps + web favicon/nav
await out('public/logo-mark.png', 512, markBuf)
for (const [p, s] of Object.entries({
  'android/app/src/main/res/mipmap-mdpi/ic_launcher.png': 48,
  'android/app/src/main/res/mipmap-hdpi/ic_launcher.png': 72,
  'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png': 96,
  'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png': 144,
  'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': 192,
})) await out(p, s, markBuf)
// icns from full art
const entries = []
for (const [type, size] of [['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const png = await sharp(fullBuf).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer()
  const head = Buffer.alloc(8); head.write(type, 0, 'ascii'); head.writeUInt32BE(png.length + 8, 4)
  entries.push(Buffer.concat([head, png]))
}
const body = Buffer.concat(entries)
const hdr = Buffer.alloc(8); hdr.write('icns', 0, 'ascii'); hdr.writeUInt32BE(body.length + 8, 4)
fs.writeFileSync('desktop/build/icon.icns', Buffer.concat([hdr, body]))
console.log('wrote desktop/build/icon.icns')
