import { parseRelease, matchTv, matchMovie, subtitleWords, bestTitleMatch } from "../src/lib/torrent-match";
import { batchRange } from "../src/lib/torrent-sources";

interface Item { title: string; infoHash: string; seeders: number; leechers: number; pubMs: number | null; }

async function nyaaSearch(query: string): Promise<Item[]> {
  const res = await fetch(`https://nyaa.si/?page=rss&f=0&c=0_0&q=${encodeURIComponent(query)}`, {
    headers: { accept: "application/rss+xml", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items: Item[] = [];
  for (const chunk of xml.split("<item>").slice(1)) {
    const pick = (re: RegExp) => chunk.match(re)?.[1]?.trim() ?? "";
    const title = pick(/<title>([\s\S]*?)<\/title>/);
    const infoHash = pick(/<nyaa:infoHash>([0-9a-fA-F]{40})<\/nyaa:infoHash>/).toLowerCase();
    if (!title || !infoHash) continue;
    const pubRaw = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const pubMs = pubRaw ? new Date(pubRaw).getTime() : NaN;
    items.push({
      title, infoHash,
      seeders: parseInt(pick(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/), 10) || 0,
      leechers: parseInt(pick(/<nyaa:leechers>(\d+)<\/nyaa:leechers>/), 10) || 0,
      pubMs: Number.isFinite(pubMs) ? pubMs : null,
    });
  }
  return items;
}

const TITLE = "Bleach: Thousand-Year Blood War";
const ORIGINAL = "BLEACH";

async function testVariant(name: string, query: string, opts: { season: number; episode: number; rel: number | null; abs: number | null }) {
  const items = await nyaaSearch(query);
  const seen = new Set<string>();
  const matches: { t: string; m: string; s: number }[] = [];
  for (const r of items) {
    if (seen.has(r.infoHash)) continue;
    seen.add(r.infoHash);
    const p = parseRelease(r.title);
    let match = matchTv(p, opts.season, opts.episode, TITLE, ORIGINAL, {
      airDate: null, absEpisode: opts.abs, relEpisode: opts.rel, pubDate: r.pubMs,
    });
    if (!match) {
      const br = batchRange(r.title);
      if (br) {
        const tm = bestTitleMatch(p, [TITLE, ORIGINAL]);
        const cleanExtras = subtitleWords(p, [TITLE, ORIGINAL]).length === 0;
        const wanted = opts.abs ?? opts.episode;
        const inAbs = wanted >= br[0] && wanted <= br[1];
        const inRel = opts.rel != null && opts.rel >= br[0] && opts.rel <= br[1];
        if (tm.ratio >= 0.5 && ((inAbs && cleanExtras) || (inRel && subtitleWords(p, [TITLE, ORIGINAL]).length >= 2))) match = "pack";
      }
    }
    if (match) matches.push({ t: r.title, m: match, s: r.seeders });
  }
  console.log(`\n### "${query}" → ${items.length} items, ${matches.length} MATCH`);
  for (const m of matches.slice(0, 8)) console.log(`   [${m.m}] seeders=${m.s} ${m.t.slice(0, 90)}`);
  // show 3 rejections with title ratio for diagnosis
  const rej = items.filter((r) => !matches.some((m) => m.t === r.title)).slice(0, 3);
  for (const r of rej) {
    const p = parseRelease(r.title);
    const tm = bestTitleMatch(p, [TITLE, ORIGINAL]);
    console.log(`   REJ ratio=${tm.ratio.toFixed(2)} ${r.title.slice(0, 90)}`);
  }
}

console.log("=========== Bleach TYBW S02E01 (season=2 episode=1 rel=1 abs=14) ===========");
await testVariant("S02-bare", `${TITLE} S02`, { season: 2, episode: 1, rel: 1, abs: 14 });
await testVariant("s02e01", `${TITLE} s02e01`, { season: 2, episode: 1, rel: 1, abs: 14 });
await testVariant("abs-14", `${TITLE} 14`, { season: 2, episode: 1, rel: 1, abs: 14 });
await testVariant("orig-14", `${ORIGINAL} 14`, { season: 2, episode: 1, rel: 1, abs: 14 });
await testVariant("romaji", "Bleach: Sennen Kessen-hen", { season: 2, episode: 1, rel: 1, abs: 14 });

console.log("\n=========== anime movie: Demon Slayer Mugen Train ===========");
const movie = await nyaaSearch("Demon Slayer Mugen Train");
const mseen = new Set<string>();
let mmatches = 0;
for (const r of movie) {
  if (mseen.has(r.infoHash)) continue;
  mseen.add(r.infoHash);
  const p = parseRelease(r.title);
  const m = matchMovie(p, "Demon Slayer: Mugen Train", "劇場版「鬼滅の刃」無限列車編", "2020");
  if (m) { mmatches++; if (mmatches <= 6) console.log(`   [${m}] seeders=${r.seeders} ${r.title.slice(0, 90)}`); }
}
console.log(`### "${"Demon Slayer Mugen Train"}" → ${movie.length} items, ${mmatches} MATCH`);
