// Replicate the ENGINE's exact add() call to isolate the failure
import WebTorrent from "webtorrent";

const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.tiny-vps.com:6969/announce",
  "http://tracker.openbittorrent.com/announce",
  "https://tracker.tiny-vps.com:443/announce",
  "wss://tracker.openwebtorrent.com",
];

const mode = process.argv[2] ?? "engine";
const client = new WebTorrent(mode === "engine" ? { maxConns: 120 } : {});
const hash = "224bf45881252643dfc2e71abc7b2660a21c68c4";
const params = new URLSearchParams({ xt: `urn:btih:${hash}`, dn: "Inception 1080p YIFY" });
const trList = mode === "engine" ? TRACKERS : ["udp://tracker.opentrackr.org:1337/announce", "http://tracker.openbittorrent.com/announce"];
for (const tr of trList) params.append("tr", tr);
const magnet = `magnet:?${params.toString()}`;
const opts = mode === "engine" ? { path: "/tmp/otama-torrents", announce: TRACKERS } : { path: "/tmp/tt-plain" };

console.log(`mode=${mode}`);
console.log("client:", client.dht ? "dht ready" : "no dht");
client.on("error", (e) => console.log("[client error]", e.message));

const t0 = Date.now();
try {
  client.add(magnet, opts, (t) => {
    console.log(`METADATA in ${((Date.now() - t0) / 1000).toFixed(1)}s name=${t.name} files=${t.files?.length}`);
    client.destroy(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  });
} catch (e) {
  console.log("add threw:", e.message);
  process.exit(1);
}
setTimeout(() => {
  const t = client.torrents[0];
  console.log("TIMEOUT 30s. torrents:", client.torrents.length, t ? `progress=${t.progress} peers=${t.numPeers} discoverTracked=${!!t._discovery}` : "none");
  if (t) {
    console.log("tracker stats:", JSON.stringify(t.discovery?.tracker?.stats ?? t._discovery?.tracker?.stats ?? "n/a").slice(0, 400));
  }
  client.destroy(() => process.exit(1));
  setTimeout(() => process.exit(1), 2000);
}, 30000);
