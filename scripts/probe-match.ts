import { parseRelease, matchTv, bestTitleMatch } from "../src/lib/torrent-match";

const title = "Bleach";
const originalTitle = "ブリーチ";
const cases = [
  "名探偵コナン 黒鉄の魚影 第01-02巻 [Meitantei Konan kurogane no sabumarin vol 01-02]",
  "ルパン三世vs名探偵コナン THE MOVIE 第01-02巻 [Rupan sansei vs meitantei konan THE MOVIE 第01-02巻]",
  "名探偵コナン 第01-105巻 [Detective Conan vol 01-105]",
  "[Naruto-Kun.Hu] Bleach 001-063 (v2) [1080p]",
  "[Koten_Gars] Bleach - Season 1 [BD][1080p]",
  "Bleach Season 1 [1-20] EnG SuBB",
];

for (const name of cases) {
  const p = parseRelease(name);
  const tm = bestTitleMatch(p, [title, originalTitle]);
  const m = matchTv(p, 1, 1, title, originalTitle, {
    absEpisode: 1,
    airDate: "2004-10-05",
  });
  console.log(
    JSON.stringify({
      name: name.slice(0, 40),
      season: p.season,
      episode: p.episode,
      isSeasonPack: p.isSeasonPack,
      seasonRange: p.seasonRange,
      titleTokens: p.titleTokens.slice(0, 6),
      ratio: +tm.ratio.toFixed(2),
      unmatched: tm.unmatched.slice(0, 5),
      match: m,
    })
  );
}
