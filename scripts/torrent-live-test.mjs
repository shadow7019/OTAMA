/**
 * Live provider tests for the torrent content-matching fix.
 * Runs the real search pipeline without the Next.js server.
 * Run: bun scripts/torrent-live-test.mjs
 */
import { searchTorrentSources } from "../src/lib/torrent-sources.ts";

/** normalize a release name: dots/underscores → spaces, lowercase */
const norm = (s) => s.replace(/[._]/g, " ").toLowerCase();

let failures = 0;

const CASES = [
  {
    name: "It (2017) — must NOT return Chapter Two / other years",
    args: { type: "movie", tmdbId: 346364, title: "It", year: "2017", season: 1, episode: 1 },
    check: (r) => {
      const bad = r.filter((t) => {
        const n = norm(t.releaseName);
        if (!/\bit\b/.test(n)) return true; // different title
        if (/chapter two/.test(n)) return true; // the sequel
        const years = (n.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
        // multi-year collections that include the exact year are OK (the
        // player's year hint picks the right file); a single wrong year is not
        return years.length > 0 && years.every((y) => Math.abs(y - 2017) > 1); // wrong year only
      });
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
  {
    name: "Breaking Bad S01E01 — only BB 1x01/season packs",
    args: { type: "tv", tmdbId: 1396, title: "Breaking Bad", year: "2008", season: 1, episode: 1 },
    check: (r) => {
      const bad = r.filter((t) => {
        const n = norm(t.releaseName);
        if (!/breaking bad/.test(n)) return true;
        const right = /(?<!\d)1x01(?!\d)/.test(n) || /s0*1[\s._-]*e0*1(?!\d)/.test(n) || t.match === "pack";
        return !right;
      });
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
  {
    name: "UK Office (2996) S02E04 — no US-tagged releases",
    args: { type: "tv", tmdbId: 2996, title: "The Office", year: "2001", season: 2, episode: 4 },
    check: (r) => {
      const bad = r.filter((t) => /\bus\b/i.test(t.releaseName.replace(/outline|house|because/gi, "")));
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
  {
    name: "US Office (2316) S02E04 — exact episodes or S02 packs",
    args: { type: "tv", tmdbId: 2316, title: "The Office", year: "2005", season: 2, episode: 4 },
    check: (r) => {
      const bad = r.filter((t) => {
        const n = norm(t.releaseName);
        const right = /(?<!\d)2x04(?!\d)/.test(n) || /s0*2[\s._-]*e0*4(?!\d)/.test(n) || t.match === "pack";
        return !right;
      });
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
  {
    name: "Us (2019) — no Us And Them / other years",
    args: { type: "movie", tmdbId: 458723, title: "Us", year: "2019", season: 1, episode: 1 },
    check: (r) => {
      const bad = r.filter((t) => {
        const n = norm(t.releaseName);
        if (!/\bus\b/.test(n)) return true;
        if (/and them|world of us/.test(n)) return true;
        const years = (n.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
        return years.length > 0 && years.every((y) => Math.abs(y - 2019) > 1);
      });
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
  {
    name: "Aladdin (1992) — no 2019 remake",
    args: { type: "movie", tmdbId: 812, title: "Aladdin", year: "1992", season: 1, episode: 1 },
    check: (r) => {
      const bad = r.filter((t) => {
        const n = norm(t.releaseName);
        if (!/aladdin/.test(n)) return true;
        const years = (n.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
        return years.length > 0 && years.every((y) => Math.abs(y - 1992) > 1);
      });
      return bad.length ? `leaked: ${bad.map((t) => t.releaseName.slice(0, 50)).join(" | ")}` : null;
    },
  },
];

for (const c of CASES) {
  try {
    const results = await searchTorrentSources(c.args);
    const problem = c.check(results);
    if (problem) {
      failures++;
      console.log(`✗ ${c.name}\n    ${problem}`);
    } else {
      console.log(`✓ ${c.name} (${results.length} results)`);
    }
    for (const t of results.slice(0, 4)) {
      console.log(`      ${t.match.padEnd(9)} ${t.provider.padEnd(13)} ${String(t.seeders).padEnd(6)} ${t.releaseName.slice(0, 60)}`);
    }
  } catch (err) {
    failures++;
    console.log(`✗ ${c.name}\n    threw: ${err.message}`);
  }
}

console.log(failures ? `\n${failures} case(s) FAILED` : "\nall live cases passed");
process.exit(failures ? 1 : 0);
