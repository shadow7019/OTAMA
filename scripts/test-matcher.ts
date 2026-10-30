/* Quick verification of the Bigg Boss matcher fixes */
import { parseRelease, matchTv } from "../src/lib/torrent-match";

const cases: {
  name: string;
  title: string;
  season: number;
  episode: number;
  airDate?: string | null;
  expect: string | null;
}[] = [
  // The user's failing case: 2012 Season 6 torrents requested for S20E54
  { name: "Bigg Boss Season 6 -22 Dec..2012", title: "Bigg Boss", season: 20, episode: 54, airDate: "2026-10-29", expect: null },
  { name: "Bigg Boss Season 6 -26 to 31 October 2012-", title: "Bigg Boss", season: 20, episode: 54, airDate: "2026-10-29", expect: null },
  // Dated season-20 daily episodes: exact date => verified, wrong date => reject
  { name: "Bigg Boss Season 20 - 29th October 2026 720p HDTV", title: "Bigg Boss", season: 20, episode: 54, airDate: "2026-10-29", expect: "verified" },
  { name: "Bigg Boss Season 20 - 30th October 2026 720p HDTV", title: "Bigg Boss", season: 20, episode: 54, airDate: "2026-10-29", expect: null },
  { name: "Bigg Boss Season 20 - 30th October 2026 720p HDTV", title: "Bigg Boss", season: 20, episode: 55, airDate: "2026-10-30", expect: "verified" },
  // Tamil-style: Bigg Boss (2026) S09E101 with site prefix
  { name: "www.1TamilBlasters.bz - Bigg Boss (2026) S09E101 [Tamil - 480p HD AVC]", title: "Bigg Boss", season: 9, episode: 101, airDate: null, expect: "verified" },
  { name: "www.1TamilBlasters.bz - Bigg Boss (2026) S09E101 [Tamil - 480p HD AVC]", title: "Bigg Boss", season: 20, episode: 55, airDate: null, expect: null },
  // Genuine season packs still work
  { name: "Bigg Boss Season 20 Complete 1080p WEB-DL", title: "Bigg Boss", season: 20, episode: 54, airDate: "2026-10-29", expect: "pack" },
  { name: "Game of Thrones S01 Complete 720p BluRay", title: "Game of Thrones", season: 1, episode: 1, airDate: null, expect: "pack" },
  { name: "Breaking Bad Season 1-5 Complete", title: "Breaking Bad", season: 3, episode: 7, airDate: null, expect: "pack" },
  { name: "Breaking Bad Season 1-5 Complete", title: "Breaking Bad", season: 6, episode: 7, airDate: null, expect: null },
  // Regular SxxEyy
  { name: "Loki S02E04 1080p WEB-DL DDP5.1", title: "Loki", season: 2, episode: 4, airDate: null, expect: "verified" },
  { name: "Loki S02E04 1080p WEB-DL DDP5.1", title: "Loki", season: 2, episode: 5, airDate: null, expect: null },
];

let fail = 0;
for (const c of cases) {
  const p = parseRelease(c.name);
  const got = matchTv(p, c.season, c.episode, c.title, undefined, {
    airDate: c.airDate,
    showLang: null,
  });
  const ok = got === c.expect;
  if (!ok) fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} | want ${c.expect ?? "null"} got ${got ?? "null"} | "${c.name}" (S${c.season}E${c.episode})`
  );
}
// GoT title check for the pack cases
const p2 = parseRelease("Game of Thrones S01 Complete 720p BluRay");
console.log(matchTv(p2, 1, 1, "Game of Thrones", undefined, {}) === "pack" ? "PASS" : "FAIL", "| GoT title");
const p3 = parseRelease("Breaking Bad Season 1-5 Complete");
console.log(matchTv(p3, 3, 7, "Breaking Bad", undefined, {}) === "pack" ? "PASS" : "FAIL", "| Breaking Bad range");
process.exit(fail ? 1 : 0);
