/**
 * Focused checks for the anime merged-sequel rules (Bleach TYBW case).
 * Run: bun run scripts/test-anime-rel.ts
 */
import { parseRelease, matchTv, subtitleWords } from "../src/lib/torrent-match";
import { batchRange } from "../src/lib/torrent-sources";

// TMDB "Bleach" (30984): S02E45 = Thousand-Year Blood War ep 45, air ~2026-09-22
const AIR = "2026-09-22";
const now = Date.now();
const fresh = now - 3 * 86400000; // 3 days ago
const old = now - 400 * 86400000; // ~13 months ago (old TYBW reseed / old upload)

type Case = {
  name: string;
  release: string;
  pub: number | null;
  expect: "verified" | "pack" | null;
};

const cases: Case[] = [
  // Rule A — subtitled bare-number fansub, fresh upload
  {
    name: "WF romaji single, fresh",
    release: "[WF] BLEACH: Sennen Kessen-hen - 45 [WEB-DL CR 1080p x264 AAC][DUAL][PT-BR]",
    pub: fresh,
    expect: "verified",
  },
  {
    name: "SubsPlease-style TYBW single, fresh",
    release: "[SubsPlease] Bleach: Sennen Kessen-hen - 45 (1080p) [04B19DE3]",
    pub: fresh,
    expect: "verified",
  },
  // Rule B — renumbered-series S/E tag, fresh upload
  {
    name: "VARYG DSNP S01E45, fresh",
    release: "BLEACH Thousand Year Blood War S01E45 DEFEND YOU 1080p DSNP WEB-DL MULTi AAC2.0 H.264-VARYG",
    pub: fresh,
    expect: "verified",
  },
  {
    name: "ToonsHub TYBW S01E45, fresh",
    release: "[ToonsHub] BLEACH Thousand-Year Blood War S01E45 1080p DSNP WEB-DL DUAL AAC2.0 H.264",
    pub: fresh,
    expect: "verified",
  },
  // negative — stale uploads must never verify via rel rules
  {
    name: "original-series single (no subtitle), any date",
    release: "[HorribleSubs] Bleach - 45 [480p]",
    pub: fresh,
    expect: null,
  },
  {
    name: "Bleach Kai re-seed of original ep 45, fresh",
    release: "[TSS] BLEACH Kai - 45 [1080p]",
    pub: fresh,
    expect: null,
  },
  {
    name: "VARYG re-seed years later",
    release: "BLEACH Thousand Year Blood War S01E45 DEFEND YOU 1080p DSNP WEB-DL MULTi AAC2.0 H.264-VARYG",
    pub: old,
    expect: null,
  },
  {
    name: "romaji single without upload date",
    release: "[WF] BLEACH: Sennen Kessen-hen - 45 [WEB-DL CR 1080p x264 AAC][DUAL][PT-BR]",
    pub: null,
    expect: null,
  },
  // different show with the same number — title mismatch
  {
    name: "other anime same number, fresh",
    release: "[SubsPlease] Blue Box - 45 (1080p)",
    pub: fresh,
    expect: null,
  },
  // batch guards (composite: batchRange + subtitleWords, as providerNyaa applies them)
  {
    name: "TYBW subtitled batch containing ep 45 → pack",
    release: "BLEACH Thousand Year Blood War (S01E01-E52) Batch 1080p DSNP WEB-DL",
    pub: fresh,
    expect: "pack",
  },
  {
    name: "base-show 001~366 batch must NOT answer S02E45",
    release: "[Erai-raws] Bleach - 001 ~ 366 [1080p DSNP WEB-DL AVC AAC][MultiSub] [BATCH]",
    pub: fresh,
    expect: null,
  },
  {
    name: "Kai 1~366 batch must NOT answer S02E45",
    release: "[TSS] BLEACH Kai - 001 ~ 366 [1080p] BATCH",
    pub: fresh,
    expect: null,
  },
  // original-series (S01) requests keep working via plain SxxEyy / abs numbers
  {
    name: "S01E01 SHAHID single (regression)",
    release: "Bleach.S01E01.1080p.SHAHID.WEB-DL.DUAL.AAC2.0.H.264-ToonsHub.mkv",
    pub: old,
    expect: "verified",
  },
];

let fail = 0;
for (const c of cases) {
  const p = parseRelease(c.release);
  // requested: season 2 episode 45 (TYBW) — except the regression case (S01E01)
  const isS1 = c.name.includes("S01E01");
  let got: "verified" | "pack" | null;
  if (c.expect === "pack") {
    // providerNyaa composite: batch range hit + sequel-subtitle strength
    const br = batchRange(c.release);
    const inRel = br ? 45 >= br[0] && 45 <= br[1] : false;
    const subtitled = subtitleWords(p, ["Bleach", "BLEACH"]).length >= 2;
    got = br && inRel && subtitled ? "pack" : null;
  } else {
    got = matchTv(
      p,
      isS1 ? 1 : 2,
      isS1 ? 1 : 45,
      "Bleach",
      "BLEACH",
      {
        airDate: isS1 ? "2004-10-20" : AIR,
        absEpisode: isS1 ? 1 : 366 + 45,
        relEpisode: isS1 ? null : 45,
        pubDate: c.pub,
      }
    );
  }
  const ok = got === c.expect;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  →  ${got} (want ${c.expect})`);
}
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
