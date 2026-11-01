/**
 * Makes the native WebRTC module optional inside webrtc-polyfill.
 *
 * webrtc-polyfill/lib/RTCPeerConnection.js hard-imports node-datachannel at
 * top level. When the deployed host's bundler loses the relative require
 * context for the native binary ("Cannot find module
 * '../../../build/Release/node_datachannel.node' from ''"), that hard import
 * crashes the whole webtorrent load and torrent playback dies with it.
 *
 * Torrent streaming itself needs no WebRTC: data flows over TCP/uTP with
 * HTTP/UDP/WebSocket trackers. Only browser-style WebRTC peers break — an
 * acceptable degradation — so the import becomes a guarded require that
 * degrades to "no WebRTC" instead of killing the engine.
 *
 * Idempotent; run via postinstall so the patch re-applies after any fresh
 * install on any host. Never fails the install: if the upstream file changes
 * shape, warn and exit 0 (the engine's engineOk banner remains the fallback).
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
try {
  ;({ PeerConnection, RtcpReceivingSession, Video, Audio, cleanup } = __otamaRequire('node-datachannel'))
} catch {
  // native WebRTC unavailable (missing/broken node_datachannel.node on this
  // host or bundler): WebRTC peers are unsupported, plain torrent streaming
  // over TCP/uTP + HTTP/UDP/WebSocket trackers is unaffected
}`;

const candidates = [
  path.resolve("node_modules/webrtc-polyfill/lib/RTCPeerConnection.js"),
  path.resolve("node_modules/webtorrent/node_modules/webrtc-polyfill/lib/RTCPeerConnection.js"),
];
const file = candidates.find((f) => existsSync(f));
if (!file) {
  console.warn("[patch-native-webrtc] webrtc-polyfill not found — skipping");
  process.exit(0);
}

let src = readFileSync(file, "utf8");
if (src.includes(MARKER)) {
  console.log("[patch-native-webrtc] already patched");
  process.exit(0);
}
if (!src.includes(ORIGINAL)) {
  console.warn(
    "[patch-native-webrtc] known import pattern not found (upstream changed?) — skipping without failing",
  );
  process.exit(0);
}
src = src.replace(ORIGINAL, REPLACEMENT);
writeFileSync(file, src);
console.log(`[patch-native-webrtc] patched ${file} — node-datachannel is now optional`);
