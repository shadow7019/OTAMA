// Connectivity test v2: guaranteed exit, logs wire/peer/tracker events
import WebTorrent from "webtorrent";

console.log("[*] webtorrent imported, creating client…");
const client = new WebTorrent({ userAgent: "otama-test" });

const magnet =
  "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=http%3A%2F%2Ftracker.openbittorrent.com%2Fannounce&tr=https%3A%2F%2Ftracker.tiny-vps.com%3A443%2Fannounce";

// hard exit no matter what
setTimeout(() => {
  console.log("RESULT: TIMEOUT — no data flowing after 45s");
  client.destroy(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
}, 45000);

client.add(magnet, { path: "/tmp/tt" }, (torrent) => {
  console.log(`[+] METADATA in ${((Date.now() - t0) / 1000).toFixed(1)}s files: ${torrent.files.map((f) => f.name).join(", ")}`);
  const iv = setInterval(() => {
    console.log(`progress=${(torrent.progress * 100).toFixed(1)}% peers=${torrent.numPeers} down=${(torrent.downloadSpeed / 1e6).toFixed(2)}MB/s`);
    if (torrent.progress > 0.05) {
      console.log("RESULT: SUCCESS — data is flowing");
      clearInterval(iv);
      client.destroy(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    }
  }, 2500);
  torrent.on("wire", () => console.log("[wire] connected a peer"));
});

const t0 = Date.now();
client.on("error", (e) => console.log("[client error]", e.message));
