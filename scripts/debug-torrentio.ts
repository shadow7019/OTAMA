/* Debug why providerTorrentio yields nothing: run each stage and print. */
import { parseRelease, matchMovie, matchTv } from "../src/lib/torrent-match";

const TIO = "https://torrentio.strem.fun";
const imdbId = "tt1375666"; // Inception

async function main() {
  const t0 = Date.now();
  let data: { streams?: { infoHash?: string; name?: string; title?: string; fileIdx?: number; behaviorHints?: { filename?: string } }[] } | null = null;
  try {
    const r = await fetch(`${TIO}/stream/movie/${imdbId}.json`, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    console.log("http", r.status, "in", Date.now() - t0, "ms");
    data = await r.json();
  } catch (e) {
    console.log("FETCH FAILED:", (e as Error).message, "after", Date.now() - t0, "ms");
    return;
  }
  const streams = data?.streams ?? [];
  console.log("streams:", streams.length);
  let stage = { hash: 0, sanity: 0, match: 0, ok: 0 };
  const matchSamples: string[] = [];
  const sanitySamples: string[] = [];
  for (const s of streams.slice(0, 12)) {
    if (!s.infoHash || !/^[0-9a-f]{40}$/i.test(s.infoHash)) continue;
    stage.hash++;
    const titleLines = (s.title ?? "").split("\n");
    const releaseName = (titleLines[0] || s.behaviorHints?.filename || "Torrent").trim();
    const parsed = parseRelease(releaseName);
    if (sanitySamples.length < 4) sanitySamples.push(releaseName.slice(0, 60));
    // replicate sanityOk as far as possible: it is not exported, so only match here
    const match = matchMovie(parsed, "Inception", "Inception", "2010");
    if (!match) {
      if (matchSamples.length < 6) matchSamples.push(`REJECT ${releaseName.slice(0, 70)} -> year=${parsed.year} S${parsed.season}E${parsed.episode}`);
      continue;
    }
    stage.match++;
    stage.ok++;
    if (stage.ok <= 3) console.log("OK:", releaseName.slice(0, 60), "match:", match);
  }
  console.log("stage counts:", JSON.stringify(stage));
  console.log("sanity samples:", JSON.stringify(sanitySamples));
  console.log("match rejects:", JSON.stringify(matchSamples, null, 1));
}
main();
