// Compare magnet string constructions
import WebTorrent from "webtorrent";

const hash = "224bf45881252643dfc2e71abc7b2660a21c68c4";
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "http://tracker.openbittorrent.com/announce",
];

const variants = {
  hardcoded: `magnet:?xt=urn:btih:${hash}&dn=Inception&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=http%3A%2F%2Ftracker.openbittorrent.com%2Fannounce`,
  urlSearchParams: (() => {
    const p = new URLSearchParams();
    p.set("xt", `urn:btih:${hash}`);
    p.set("dn", "Inception");
    for (const tr of TRACKERS) p.append("tr", tr);
    return `magnet:?${p.toString()}`;
  })(),
  manual: (() => {
    const parts = [`xt=urn:btih:${hash}`, "dn=Inception"];
    for (const tr of TRACKERS) parts.push(`tr=${encodeURIComponent(tr)}`);
    return `magnet:?${parts.join("&")}`;
  })(),
};

for (const [name, magnet] of Object.entries(variants)) {
  console.log(`\n--- ${name} ---`);
  console.log(magnet.slice(0, 90));
  const client = new WebTorrent();
  let done = false;
  client.on("error", (e) => {
    console.log(`[${name}] client error:`, e.message);
  });
  try {
    client.add(magnet, { path: "/tmp/tt-mv" }, (t) => {
      done = true;
      console.log(`[${name}] METADATA OK: ${t.name} (${t.files?.length} files)`);
      client.destroy(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500);
    });
  } catch (e) {
    console.log(`[${name}] add threw:`, e.message);
  }
  setTimeout(() => {
    if (!done) {
      console.log(`[${name}] no metadata in 14s (torrents: ${client.torrents.length})`);
      client.destroy(() => process.exit(1));
      setTimeout(() => process.exit(1), 1500);
    }
  }, 14000);
  break; // run one at a time; rerun script with arg to test others
}
