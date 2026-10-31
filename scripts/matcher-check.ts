/* Unit checks for the release matcher against real-world titles. */
import { parseRelease, matchTv, matchMovie } from "../src/lib/torrent-match";

let pass = 0;
let fail = 0;
function tv(
  name: string,
  season: number,
  episode: number,
  expected: string | null,
  ctx: Parameters<typeof matchTv>[5] = {},
  title = "Bigg Boss"
) {
  const got = matchTv(parseRelease(name), season, episode, title, undefined, ctx);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | want ${expected} got ${got} | ${name}`);
}
function movie(name: string, title: string, year: string, expected: string | null, originalTitle?: string) {
  const got = matchMovie(parseRelease(name), title, originalTitle, year);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | want ${expected} got ${got} | ${name}`);
}

// ---- Bigg Boss S20E55 (aired 2026-10-30) ----
const air = "2026-10-30";
tv("Bigg Boss 20 30th October 2026 Video Episode 55 Bigg Boss 20 854x 480", 20, 55, "verified", { airDate: air });
tv("Bigg Boss 20 30th October 2026 Video Episode 55 Bigg Boss 20 854x 480", 20, 54, null, { airDate: "2026-10-29" });
tv("Bigg Boss (2026) S20E55 Hindi 1080p WEB-DL", 20, 55, "verified", { airDate: air, showLang: "hindi" });
tv("Bigg Boss (2026) S20E55 Telugu 1080p WEB-DL", 20, 55, null, { airDate: air, showLang: "hindi" });
tv("www.1TamilMV.rocks - Bigg Boss (Tamil) - Season 3 - EP.72 (Telecast Version) - HDTV - 720p", 3, 72, "verified", { showLang: "tamil" }, "Bigg Boss");
tv("Bigg Boss Season 20 - 29th October 2026", 20, 54, null, { airDate: "2026-10-30" }); // wrong day's episode
tv("Bigg Boss Season 20 - 30th October 2026", 20, 55, "verified", { airDate: air });
tv("Bigg Boss 11 - Episode 24 480p HDTV", 11, 24, "verified");
tv("www.5MovieRulz.company - BIGG BOSS (Telugu) S10 EP21 DAY 20 TRUE WEB-DL - 1080p - AVC - AAC - 950MB.", 10, 21, "verified", { showLang: "telugu" }, "Bigg Boss");
tv("Taarak Mehta Ka Ooltah Chashmah S20E55", 20, 55, null, { airDate: air }, "Bigg Boss"); // different show
// ---- anime absolute numbering ----
tv("One Piece - 1085 [1080p]", 21, 158, "verified", { absEpisode: 1085 }, "One Piece");
tv("One Piece - 891 [1080p]", 21, 1, null, { absEpisode: 892 }, "One Piece"); // wrong abs number
tv("[SubsPlease] Jujutsu Kaisen S02E05 (1080p) [04B3E2A0]", 2, 5, "verified", {}, "Jujutsu Kaisen");
tv("[SubsPlease] Jujutsu Kaisen - 29 (1080p)", 2, 5, "verified", { absEpisode: 29 }, "Jujutsu Kaisen");
tv("[Erai-raws] One Piece - 801 ~ 900 [1080p]", 21, 1, null, { absEpisode: 892 }, "One Piece"); // range → pack handled in provider; matcher rejects (ok)
// ---- movies ----
movie("It Chapter Two 2019 1080p BluRay x264", "It", "2017", null); // sequel must not match
movie("It 2017 1080p BluRay x264", "It", "2017", "verified");
movie("[SubsPlease] Suzume no Tojimari (2023) [1080p]", "Suzume", "2022", "verified", "Suzume no Tojimari");
movie("Suzume 2022 1080p", "Suzume", "2022", "verified");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
