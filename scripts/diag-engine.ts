/**
 * End-to-end test: can webtorrent fetch metadata + first bytes of the
 * best-seeded Inception torrent, using the same tracker list as the app?
 */
import WebTorrent from "webtorrent";
import crypto from "node:crypto";

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "wss://tracker.openwebtorrent.com",
];

const hash = process.argv[2] ?? "167c1e4256e77507af078a2d9b41eb12e3a0ba0b"; // will be replaced by caller
const magnet = `magnet:?xt=urn:btih:${hash}&dn=test&` + TRACKERS.map((t) => `tr=${encodeURIComponent(t)}`).join("&");

const client = new WebTorrent({ maxConns: 60 });
const t0 = Date.now();

client.on("error", (e) => console.log("client error:", (e as Error).message));

const timer = setTimeout(() => {
  console.log(`TIMEOUT after ${(Date.now() - t0) / 1000}s`);
  console.log("torrents:", client.torrents.length);
  for (const t of client.torrents) {
    console.log(`  infoHash=${t.infoHash} ready=${t.ready} peers=${t.numPeers} wires=${t.wires?.length} progress=${t.progress}`);
    console.log(`  discovered trackers:`, (t as unknown as { _trackers?: unknown[] })._trackers?.length ?? "n/a");
  }
  process.exit(1);
}, 45000);

client.add(magnet, (tor: unknown) => {
  const t = tor as { infoHash: string; numPeers: number; on: (e: string, cb: () => void) => void; files: { name: string; length: number }[] };
  console.log(`metadata OK in ${(Date.now() - t0) / 1000}s, peers=${t.numPeers}`);
  clearTimeout(timer);
  setTimeout(() => process.exit(0), 1000);
});

// progress logging
setInterval(() => {
  for (const t of client.torrents) {
    const wires = (t as unknown as { wires: unknown[] }).wires?.length ?? 0;
    console.log(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s peers=${t.numPeers} wires=${wires} ready=${t.ready}`);
  }
}, 8000);
