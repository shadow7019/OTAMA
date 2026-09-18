/**
 * OTAMA preload — runs in the renderer before the web app boots.
 *
 * Exposes a tiny, read-only bridge so the Next.js app can detect the desktop
 * shell and connect straight to the embedded torrent engine:
 *
 *   window.otama = { isDesktop: true, platform, version, enginePort }
 */
const { contextBridge } = require('electron')

const enginePort = Number(process.env.OTAMA_ENGINE_PORT) || 3003
const version = process.env.OTAMA_VERSION || '1.0.0'

contextBridge.exposeInMainWorld('otama', {
  isDesktop: true,
  platform: process.platform,
  version,
  enginePort,
})
