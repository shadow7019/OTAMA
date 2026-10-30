/* Standalone test: Bigg Boss Tamil S9E101 via the full provider chain */
import { searchTorrentSources } from "../src/lib/torrent-sources";

const t0 = Date.now();
const res = await searchTorrentSources({
  type: "tv",
  tmdbId: 72908, // Bigg Boss Tamil (ta, JioHotstar)
  title: "Bigg Boss Tamil",
  year: "2017",
  season: 9,
  episode: 101,
});
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s — results: ${res.length}`);
for (const r of res.slice(0, 10)) {
  console.log(
    ` ${r.match} | ${r.provider} | ${r.seeders} seed | ${Math.round(r.sizeBytes / 1e6)}MB | ${r.releaseName.slice(0, 85)}`
  );
}
