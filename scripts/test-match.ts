/**
 * Unit tests for the torrent release matcher, using REAL release names
 * scraped from apibay (PirateBay) for Bigg Boss (Indian daily show) plus
 * the original same-name-mixing regression cases.
 *
 * Run: bun run scripts/test-match.ts
 */
import { countryPenalty, matchMovie, matchTv, parseRelease } from "../src/lib/torrent-match";

let pass = 0;
let fail = 0;

function tv(
  label: string,
  expected: "verified" | "pack" | null,
  name: string,
  season: number,
  episode: number,
  opts: { title?: string; airDate?: string | null; showLang?: string | null } = {}
) {
  const p = parseRelease(name);
  const got = matchTv(p, season, episode, opts.title ?? "Bigg Boss", undefined, {
    airDate: opts.airDate,
    showLang: opts.showLang,
  });
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"} [tv] ${label}\n     want=${expected} got=${got}  (S${season}E${episode}${opts.showLang ? ", show=" + opts.showLang : ""}${opts.airDate ? ", air=" + opts.airDate : ""})\n     parsed: S=${p.season} E=${p.episode} pack=${p.isSeasonPack} lang=${p.language} date=${JSON.stringify(p.date)} year=${p.year} title=[${p.titleTokens.join(" ")}]`
  );
}

function mv(label: string, expected: "verified" | "weak" | null, name: string, title: string, year: string) {
  const p = parseRelease(name);
  const got = matchMovie(p, title, undefined, year);
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} [movie] ${label} — want=${expected} got=${got}`);
}

/* ---------- Bigg Boss — Indian daily-show naming (must now match) ---------- */

tv(
  "SxxExx with dated tail",
  "verified",
  "Bigg Boss - Season 4 - Episode 29 - 31 October 2010 - XviD - MP3 - CBTorrents",
  4, 29,
  { airDate: "2010-10-31", showLang: "hindi" }
);

tv(
  "Episode N with season in title (Day N noise)",
  "verified",
  "Bigg Boss 11 - Episode 24 (Day 23) - 720p HDTV Rip - DTOne",
  11, 24,
  { showLang: "hindi" }
);

tv(
  "S14.EP.34 dotted style",
  "verified",
  "Bigg.Boss.S14.EP.34.2020.1080p.VOOT.WEB-DL.AAC.2.0.H264-Telly",
  14, 34,
  { airDate: "2020-11-22", showLang: "hindi" }
);

tv(
  "date-only premiere (day+month, no year)",
  "verified",
  "Bigg Boss 11 Season Premier 1st Oct 720p x264 AAC [DDR]",
  11, 1,
  { airDate: "2017-10-01", showLang: "hindi" }
);

tv(
  "date-only vs wrong episode (next day) → reject",
  null,
  "Bigg Boss 11 Season Premier 1st Oct 720p x264 AAC [DDR]",
  11, 2,
  { airDate: "2017-10-02", showLang: "hindi" }
);

tv(
  "language-tagged episode, matching show language",
  "verified",
  "Bigg Boss (2018) 720p Telugu - Season 2 - EP.40 (Telecast Version)",
  2, 40,
  { showLang: "telugu" }
);

tv(
  "language-tagged episode vs other-language show → reject",
  null,
  "Bigg Boss (2018) 720p Telugu - Season 2 - EP.40 (Telecast Version)",
  2, 40,
  { showLang: "tamil" }
);

tv(
  "language-tagged season pack, matching language",
  "pack",
  "Bigg Boss (2019) Telugu Season 3 DAY 32 HDTV x264-S33MMYY",
  3, 15,
  { showLang: "telugu" }
);

tv(
  "SxxExx launch ceremony with partial date",
  "verified",
  "Bigg Boss (Lauch Ceremony) - S05E01 - 2nd Oct - XviD - [DDR]",
  5, 1,
  { showLang: "hindi" }
);

tv(
  "multi-episode block start",
  "verified",
  "Bigg Boss - S05E03 to S05E09 - 4th Oct to 10th Oct - XviD - [DDR",
  5, 3,
  { showLang: "hindi" }
);

tv(
  "season pack word form",
  "pack",
  "Bigg Boss Hindi Season 13  DAY 0 Premiere  HDRip x264[MB]",
  13, 7,
  { showLang: "hindi" }
);

/* ---------- conservative rejections (no mixing) ---------- */

tv(
  "episode-only, no season anywhere → reject for S10",
  null,
  "Bigg Boss - Episode 24 (Day 23) - 720p HDTV Rip - DTOne",
  10, 24,
  { showLang: "tamil" }
);

tv(
  "title season ≠ requested season → reject",
  null,
  "Bigg Boss 11 - Episode 24 (Day 23) - 720p HDTV Rip - DTOne",
  10, 24,
  { showLang: "hindi" }
);

tv(
  "wrong episode number → reject",
  null,
  "Bigg Boss - Season 4 - Episode 30 - 1 November 2010 - XviD",
  4, 29,
  { airDate: "2010-10-31", showLang: "hindi" }
);

tv(
  "unrelated title → reject",
  null,
  "Breaking Bad S01E01 1080p BluRay x264-Belex",
  10, 24,
  { showLang: "tamil" }
);

tv(
  "different language tag on pack → reject",
  null,
  "Bigg Boss Telugu Season 4 Complete 1080p WEB-DL",
  4, 5,
  { showLang: "tamil" }
);

/* ---------- original mixing regressions ---------- */

tv(
  "The Office US S02E04 for UK show → verified + country penalty",
  "verified",
  "The.Office.US.S02E04.The.Fire.DVDRip.XviD-FoV",
  2, 4,
  { title: "The Office", showLang: "en" }
);

console.log(
  `countryPenalty(US release, GB show) = ${countryPenalty(parseRelease("The.Office.US.S02E04.DVDRip.XviD"), ["GB"])} (want -8)`
);
if (countryPenalty(parseRelease("The.Office.US.S02E04.DVDRip.XviD"), ["GB"]) !== -8) fail++;
else pass++;

tv(
  "movie same name different year → reject",
  null,
  "It.2019.1080p.BluRay.x264-DRONES",
  "It",
  "2017"
);

mv("movie same name right year → verified", "verified", "It.2017.1080p.BluRay.x264-DRONES", "It", "2017");
mv("movie no year in name → weak", "weak", "Inception.1080p.BluRay.x264-AMIABLE", "Inception", "2010");
mv("movie full match → verified", "verified", "Inception.2010.1080p.BluRay.x264-AMIABLE", "Inception", "2010");
mv("movie different words → reject", null, "Inception.Age.2010.720p.WEB-DL", "Inception", "2010");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
