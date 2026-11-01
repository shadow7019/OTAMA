/**
 * Makes webtorrent's native modules safe on every runtime we deploy to.
 *
 * Two native NAPI modules sit in webtorrent's server-side chain:
 *
 * - webrtc-polyfill hard-imports node-datachannel at top level. On hosts
 *   whose bundler loses the relative require context the import throws and
 *   webtorrent never loads; on BUN the module load itself PANICS
 *   ("unsupported uv function: uv_timer_init") — a panic is not a catchable
 *   exception, it kills the process mid-request. Every stream request dies,
 *   the player fail-overs, and playback loops forever ("loads, switches
 *   server, never plays").
 * - utp-native (uTP transport) is require-guarded upstream, but a Bun panic
 *   bypasses try/catch, so it must not be loaded there either.
 *
 * Torrent streaming needs neither module: data flows over TCP with
 * HTTP/UDP/WebSocket trackers; uTP is an optimization, WebRTC is unused
 * server-side. This patch (idempotent, run on postinstall AND build):
 *   - replaces the polyfill's hard import with a guarded require that
 *     degrades to "no WebRTC" on Node and skips entirely under Bun
 *   - makes webtorrent's uTP loader return {} under Bun
 * A panic cannot be caught — the only defense is not loading the module.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MARKER = "/* otama-patch: optional native WebRTC */";
const ORIGINAL =
  "import { PeerConnection, RtcpReceivingSession, Video, Audio, cleanup } from 'node-datachannel'";
const REPLACEMENT = `${MARKER}
import { createRequire as __otamaCreateRequire } from 'node:module'
const __otamaRequire = __otamaCreateRequire(import.meta.url)
let PeerConnection, RtcpReceivingSession, Video, Audio, cleanup
if (typeof process !== 'undefined' && process.versions && process.versions.bun) {
  // Bun panics ("unsupported uv function: uv_timer_init") when a NAPI module
  // touches libuv — node-datachannel does exactly that on load — and the
  // panic is not a catchable exception. Skip it outright under Bun; torrent
  // streaming needs no WebRTC.
} else {
  try {
    ;({ PeerConnection, RtcpReceivingSession, Video, Audio, cleanup } = __otamaRequire('node-datachannel'))
  } catch {
    // native WebRTC unavailable (missing/broken node_datachannel.node on this
    // host or bundler): WebRTC peers are unsupported, plain torrent streaming
    // over TCP/uTP + HTTP/UDP/WebSocket trackers is unaffected
  }
}`;

const UTP_MARK = "/* otama-patch: uTP off under Bun */";
const UTP_ORIGINAL = `module.exports = (() => {
  try {
    return require('utp-native')
  } catch (err) {
    console.warn('WebTorrent: uTP not supported', err)
    return {}
  }
})()`;
const UTP_REPLACEMENT = `${UTP_MARK}
module.exports = (() => {
  if (typeof process !== 'undefined' && process.versions && process.versions.bun) {
    // Bun panics on libuv-touching NAPI modules and utp-native is one; uTP is
    // only an optimization — TCP peers cover every swarm.
    console.warn('WebTorrent: uTP disabled under Bun (native module would panic)')
    return {}
  }
  try {
    return require('utp-native')
  } catch (err) {
    console.warn('WebTorrent: uTP not supported', err)
    return {}
  }
})()`;

function warn(msg) {
  console.warn(`[patch-native-webrtc] ${msg}`);
}

function patchPolyfill() {
  const candidates = [
    path.resolve("node_modules/webrtc-polyfill/lib/RTCPeerConnection.js"),
    path.resolve("node_modules/webtorrent/node_modules/webrtc-polyfill/lib/RTCPeerConnection.js"),
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) return warn("webrtc-polyfill not found — skipping");

  let src = readFileSync(file, "utf8");
  // Any previous patch form (guarded require v1, bun-aware v2, or a broken
  // upgrade) is always stripped: cut from the patch point to the first import
  // that follows it in the original file, then the pristine import line is
  // restored and the current patch re-applied. Idempotent by construction.
  const ANCHOR = "import RTCSessionDescription";
  const cutFrom = src.indexOf(MARKER);
  if (cutFrom !== -1) {
    const cutTo = src.indexOf(ANCHOR, cutFrom);
    if (cutTo === -1) return warn("previous patch found but cannot be parsed — leaving as is");
    src = src.slice(0, cutFrom) + ORIGINAL + "\n" + src.slice(cutTo);
    console.log("[patch-native-webrtc] re-applying bun-aware polyfill patch");
  }
  if (!src.includes(ORIGINAL)) {
    return warn("known import pattern not found (upstream changed?) — skipping without failing");
  }
  writeFileSync(file, src.replace(ORIGINAL, REPLACEMENT));
  console.log(`[patch-native-webrtc] patched ${file} — node-datachannel optional (skipped under Bun)`);
}

function patchUtp() {
  const candidates = [
    path.resolve("node_modules/webtorrent/lib/utp.cjs"),
    path.resolve("node_modules/webtorrent/node_modules/webtorrent/lib/utp.cjs"),
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) return warn("webtorrent utp.cjs not found — skipping");

  let src = readFileSync(file, "utf8");
  if (src.includes(UTP_MARK)) {
    return console.log("[patch-native-webrtc] utp.cjs already patched (bun-aware)");
  }
  if (!src.includes(UTP_ORIGINAL)) {
    return warn("utp.cjs pattern not found (upstream changed?) — skipping without failing");
  }
  writeFileSync(file, src.replace(UTP_ORIGINAL, UTP_REPLACEMENT));
  console.log(`[patch-native-webrtc] patched ${file} — uTP disabled under Bun`);
}

patchPolyfill();
patchUtp();
