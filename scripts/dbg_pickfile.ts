import { pickVideoFile } from "../src/lib/torrent-engine";

const mk = (names: string[]) =>
  names.map((name, i) => ({ name, path: name, length: 400_000_000 + i, offset: i * 4e8 }));

const lgh = mk([
  "[LGH] Bleach S17E14 [BD Remux 1080p].mkv",
  "[LGH] Bleach S17E15 [BD Remux 1080p].mkv",
  "[LGH] Bleach S17E26 [BD Remux 1080p].mkv",
]);

const kiyoshii = mk([
  "[KiyoshiiSubs] Bleach Thousand-Year Blood War - 14 [BD 1080p].mkv",
  "[KiyoshiiSubs] Bleach Thousand-Year Blood War - 15 [BD 1080p].mkv",
]);

const subsplease = mk([
  "[SubsPlease] Bleach: Sennen Kessen-hen - 01 (1080p) [04B2C].mkv",
  "[SubsPlease] Bleach: Sennen Kessen-hen - 02 (1080p) [A11].mkv",
]);

const zigzag = mk(["[ZigZag] BLEACH: Thousand-Year Blood War S02E01 [1080p WEB-DL].mkv"]);

const wrong = mk(["Bleach S02E13.mkv", "Bleach S02E12.mkv"]);

const name = (r: { file: { name: string } }) => r.file.name;

console.log("1 LGH pack, abs=14 →", name(pickVideoFile({ files: lgh } as never, null, { season: 2, episode: 1, abs: 14 }, null)));
console.log("2 LGH pack, no abs (old behavior) →", name(pickVideoFile({ files: lgh } as never, null, { season: 2, episode: 1 }, null)));
console.log("3 KiyoshiiSubs -14, abs=14 →", name(pickVideoFile({ files: kiyoshii } as never, null, { season: 2, episode: 1, abs: 14 }, null)));
console.log("4 SubsPlease -01 (per-cour), abs=14 →", name(pickVideoFile({ files: subsplease } as never, null, { season: 2, episode: 1, abs: 14 }, null)));
console.log("5 ZigZag S02E01 single →", name(pickVideoFile({ files: zigzag } as never, null, { season: 2, episode: 1, abs: 14 }, null)));
console.log("6 wrong S02E13 files, abs=14 →", name(pickVideoFile({ files: wrong } as never, null, { season: 2, episode: 1, abs: 14 }, null)));
