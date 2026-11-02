/**
 * Standalone DATA-FLOW test: add torrent from .torrent buffer (mirror),
 * mark first 1MB critical, measure bytes downloaded over 20s.
 * Exactly replicates the stream route's path.
 */
import WebTorrent from "webtorrent";
import fs from "node:fs";

const HASH = process.argv[2] ?? "4f1a4b7ad7d93f9bb991185c012d7964d7c696e1";
const URL_ = process.argv[3] ?? `https://itorrents.org/torrent/${HASH.toUpperCase()}.torrent`;

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://explodie.org:6969/announce",
  "wss://tracker.openwebtorrent.com",
];

const client = new WebTorrent({ maxConns: 60 });
const t0 = Date.now();

const res = await fetch(URL_, { signal: AbortSignal.timeout(7000), redirect: "follow" });
const buf = Buffer.from(await res.arrayBuffer());
console.log(`torrent file: ${res.status}, ${buf.length}B in ${Date.now() - t0}ms`);

client.add(buf, { path: "/tmp/otama-diag", announce: TRACKERS }, (t) => {
  console.log(`added+ready in ${(Date.now() - t0) / 1000}s, files=${t.files.length}, infoHash=${t.infoHash}`);
  if (t.infoHash !== HASH) console.log(`WARNING hash mismatch: ${t.infoHash} != ${HASH}`);
  const f = t.files[0];
  console.log(`file0: ${f.name} (${(f.length / 1e9).toFixed(2)} GB)`);
  const pieceLen = t.pieceLength || 262144;
  try { t.critical(0, Math.ceil(2e6 / pieceLen)); } catch {}
  const snap = () => {
    const dl = t.downloaded ?? 0;
    console.log(`t+${((Date.now() - t0) / 1000).toFixed(0)}s peers=${t.numPeers} downloaded=${(dl / 1e6).toFixed(2)}MB  progress=${(t.progress * 100).toFixed(1)}%`);
  };
  const iv = setInterval(snap, 3000);
  setTimeout(() => { clearInterval(iv); snap(); console.log("DONE"); process.exit(0); }, 21000);
});
client.on("error", (e) => console.log("client err:", e.message));
