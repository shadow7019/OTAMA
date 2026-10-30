/**
 * Unit tests for the torrent content-matching fix.
 * Run: bun scripts/torrent-match-test.mjs
 */
import {
  parseRelease,
  matchMovie,
  matchTv,
  countryPenalty,
} from "../src/lib/torrent-match.ts";
import { pickVideoFile } from "../src/lib/torrent-engine.ts";

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${name}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
  }
}

/* ---------- parseRelease ---------- */

let p = parseRelease("The.Office.US.S02E04.720p.BluRay.x264- group");
check("office US S/E", [p.season, p.episode, p.country, p.titleTokens], [2, 4, "US", ["the", "office", "us"]]);

p = parseRelease("Us.2019.1080p.BluRay.x264-AAA");
check("Us 2019", [p.year, p.titleTokens], [2019, ["us"]]);

p = parseRelease("It.Chapter.Two.2019.1080p.BluRay");
check("It Chapter Two", [p.year, p.titleTokens], [2019, ["it", "chapter", "two"]]);

p = parseRelease("1917.2019.1080p.BluRay.x264");
check("1917 movie keeps its title", [p.year, p.titleTokens], [2019, ["1917"]]);

p = parseRelease("Web.of.Lies.S01E01.720p.HDTV");
check("Web of Lies title intact", [p.season, p.episode, p.titleTokens], [1, 1, ["web", "of", "lies"]]);

p = parseRelease("A.Complete.Unknown.2024.1080p.WEB-DL.DDP5.1");
check("A Complete Unknown is a movie", [p.year, p.isSeasonPack, p.titleTokens], [2024, false, ["a", "complete", "unknown"]]);

p = parseRelease("Breaking.Bad.S03.Complete.720p.BluRay");
check("season pack complete", [p.season, p.episode, p.isSeasonPack], [3, null, true]);

p = parseRelease("Naagin.Season.2.Complete.Episode.1.to.50");
check("season pack word form", [p.season, p.isSeasonPack], [2, true]);

p = parseRelease("Show.2016.S01E01.720p");
check("S/E after year", [p.year, p.season, p.episode, p.titleTokens], [2016, 1, 1, ["show"]]);

p = parseRelease("Koffee.with.Karan.S06E24.1080p");
check("Koffee S/E", [p.season, p.episode, p.titleTokens], [6, 24, ["koffee", "with", "karan"]]);

p = parseRelease("A.Series.of.Unfortunate.Events.S01E02.720p");
check("A Series of... not a pack", [p.season, p.episode, p.isSeasonPack, p.titleTokens], [1, 2, false, ["a", "series", "of", "unfortunate", "events"]]);

p = parseRelease("Some.Movie.2.2019.1080p");
check("sequel numeral stays title", [p.year, p.titleTokens], [2019, ["some", "movie", "2"]]);

/* ---------- matchMovie: same-name mixing cases ---------- */

const us = parseRelease("Us.And.Them.2019.1080p.BluRay");
check("Us And Them ≠ Us (2019)", matchMovie(us, "Us", undefined, "2019"), null);

const usOk = parseRelease("Us.2019.1080p.BluRay.x264-AAA");
check("Us 2019 verified", matchMovie(usOk, "Us", undefined, "2019"), "verified");

const itTwo = parseRelease("It.Chapter.Two.2019.1080p.BluRay");
check("It Chapter Two ≠ It (2017)", matchMovie(itTwo, "It", undefined, "2017"), null);

const itOk = parseRelease("It.2017.1080p.BluRay.x264");
check("It 2017 verified", matchMovie(itOk, "It", undefined, "2017"), "verified");

const officeNoYear = parseRelease("Office.Space.1999.1080p.BluRay");
check("Office Space ≠ The Office", matchMovie(officeNoYear, "The Office", "The Office", "2005"), null);

const noYear = parseRelease("Nosferatu.1922.1080p.BluRay.x264");
check("exact year unknown-TMDB → weak", matchMovie(noYear, "Nosferatu", undefined, undefined), "weak");

const titleOnly = parseRelease("Nosferatu.1080p.BluRay.x264");
check("clean no-year title → weak", matchMovie(titleOnly, "Nosferatu", undefined, undefined), "weak");

const messyNoYear = parseRelease("Best.of.Enemies.BluRay.1080p");
check("no-year clean title → weak", matchMovie(messyNoYear, "Best of Enemies", undefined, undefined), "weak");

const sequelNum = parseRelease("Some.Movie.2.BluRay.1080p");
check("no-year sequel numeral is a different film → reject", matchMovie(sequelNum, "Some Movie", undefined, undefined), null);

const yearMismatch = parseRelease("The.Lion.King.2019.2160p.WEB-DL");
check("Lion King 2019 ≠ 1994", matchMovie(yearMismatch, "The Lion King", undefined, "1994"), null);

/* ---------- matchTv: same-name episode mixing cases ---------- */

check("Office UK request vs US release", matchTv(p = parseRelease("The.Office.US.S02E04.720p"), 2, 4, "The Office", "The Office"), "verified");
check("wrong episode rejected", matchTv(parseRelease("The.Office.S02E05.720p.HDTV"), 2, 4, "The Office", undefined), null);
check("wrong season rejected", matchTv(parseRelease("The.Office.S03E04.720p.HDTV"), 2, 4, "The Office", undefined), null);
check("season pack accepted", matchTv(parseRelease("The.Office.S02.Complete.720p.BluRay"), 2, 4, "The Office", undefined), "pack");
check("other season pack rejected", matchTv(parseRelease("The.Office.S03.Complete.720p"), 2, 4, "The Office", undefined), null);
check("range pack containing season accepted", matchTv(parseRelease("Show.Season.1-6.Complete.1080p"), 3, 7, "Show", undefined), "pack");
check("range pack outside rejected", matchTv(parseRelease("Show.Season.1-2.Complete.1080p"), 3, 7, "Show", undefined), null);
check("episode-only S1 ok", matchTv(parseRelease("Show.EP04.720p.WEB"), 1, 4, "Show", undefined), "verified");
check("episode-only non-S1 rejected", matchTv(parseRelease("Show.EP04.720p.WEB"), 2, 4, "Show", undefined), null);
check("no S/E at all rejected", matchTv(parseRelease("The.Office.720p.BluRay"), 2, 4, "The Office", undefined), null);
check("different show rejected", matchTv(parseRelease("The.Official.Chart.Show.S02E04.720p"), 2, 4, "The Office", undefined), null);
check("title too different rejected", matchTv(parseRelease("Office.Incubation.S02E04.720p"), 2, 4, "The Office", undefined), null);

/* ---------- country penalty ---------- */
check("US tag on GB show penalized", countryPenalty(parseRelease("The.Office.US.S02E04"), ["GB"]), -8);
check("US tag on US show fine", countryPenalty(parseRelease("The.Office.US.S02E04"), ["US"]), 0);
check("no tag no penalty", countryPenalty(parseRelease("The.Office.S02E04"), ["GB"]), 0);

/* ---------- pickVideoFile: season pack picks the requested episode ---------- */

function fakeTorrent(entries) {
  return {
    infoHash: "0".repeat(40),
    name: "pack",
    ready: true,
    files: entries.map((entry, index) => {
      const [name, size] = entry.split("|");
      const n = parseFloat(size);
      const length = /GB$/i.test(size) ? n * 1e9 : /MB$/i.test(size) ? n * 1e6 : n;
      return { name, path: name, length, index, offset: 0 };
    }),
  };
}

const pack = fakeTorrent([
  "Show.S02E01.720p.mkv|400MB",
  "Show.S02E02.720p.mkv|380MB",
  "Show.S02E03.1080p.mkv|2GB",
  "Show.S02E04.720p.mkv|390MB",
  "Show.S02E05.720p.mkv|410MB",
]);

check("pack picks requested S02E02 (not biggest E03)", pickVideoFile(pack, null, { season: 2, episode: 2 }).index, 1);
check("pack picks requested S02E05 (biggest)", pickVideoFile(pack, null, { season: 2, episode: 5 }).index, 4);
check("pack with no hint picks biggest video", pickVideoFile(pack, null, null).index, 2);

const folderPack = fakeTorrent([
  "Season 1/Show E01.mkv|300e6",
  "Season 1/Show E02.mkv|300e6",
  "Season 2/Show E02.mkv|300e6",
]);
check("folder path season+episode", pickVideoFile(folderPack, null, { season: 2, episode: 2 }).index, 2);

const movieTorrent = fakeTorrent([
  "sample.avi|1MB",
  "Movie.2019.1080p.BluRay.x264.mp4|1.4GB",
  "Movie.2019.720p.mkv|800MB",
]);
check("movie picks mp4 over bigger mkv, skips sample", pickVideoFile(movieTorrent, null, null).index, 1);

const collection = fakeTorrent([
  "It.Chapter.Two.2019.1080p.mkv|1.4GB",
  "It.2017.720p.mkv|800MB",
  "It.2017.Extras.mkv|50MB",
]);
check("year hint picks the 2017 file inside a collection", pickVideoFile(collection, null, null, 2017).index, 1);
check("no year hint picks biggest", pickVideoFile(collection, null, null, null).index, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
