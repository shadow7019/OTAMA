/**
 * Multi-provider torrent search with strict content matching.
 *
 * Providers are tried in parallel and merged — if one is unreachable
 * (Cloudflare, DNS block, rate limit) it is simply skipped and the others
 * still answer. Every result is normalized to a common shape, validated
 * against the requested title/year/season/episode (so same-named movies and
 * series episodes never get mixed) and scored so the player can pick the
 * best server automatically.
 */
import { getAbsoluteEpisode, getImdbId, getTitleMeta, tmdbServer } from "./tmdb-server";
import {
  bestTitleMatch,
  countryPenalty,
  matchMovie,
  matchTv,
  parseRelease,
  subtitleWords,
  type MatchClass,
  type ParsedRelease,
} from "./torrent-match";

export interface TorrentSource {
  /** BitTorrent info hash (40 hex chars) — doubles as the server id */
  id: string;
  releaseName: string;
  seeders: number;
  peers: number;
  sizeBytes: number;
  provider: string;
  quality: string;
  /** provider-hinted video file index (used by multi-file episode packs) */
  fileIdx: number | null;
  /** how tightly the release name matches the requested content */
  match: MatchClass;
  /** negative when the release is tagged with a country the show isn't from */
  countryPenalty?: number;
  /** audio/language tags parsed from the release name — drives the player's
   *  server-language filter ("sub", "eng", "hindi", "dual"…). Filled in
   *  centrally after the scan (see searchTorrentSources). */
  audioTags?: string[];
  score: number;
}

/**
 * Audio-language / dub tags parsed from a release name. These power the
 * player's server categorisation so users can pick Subbed / English / Hindi /
 * Tamil… servers instead of digging through release names.
 */
const AUDIO_TAG_PATTERNS: [string, RegExp][] = [
  ["dual", /\bdual[\s._-]*(?:audio|aac|ac3)?\b|\bdualaudio\b|\bdual-audio\b/],
  ["multi", /\bmulti(?:ple)?[\s._-]*(?:audio|subs?|dubs?)?\b(?!.*\bsingle\b)/],
  ["hindi", /\bhindi\b|\bhin\b/],
  ["tamil", /\btamil\b|\btam\b/],
  ["telugu", /\btelugu\b|\btel\b/],
  ["malayalam", /\bmalayalam\b|\bmal\b/],
  ["kannada", /\bkannada\b|\bkan\b/],
  ["bengali", /\bbengali\b|\bbangla\b|\bben\b/],
  ["marathi", /\bmarathi\b/],
  ["punjabi", /\bpunjabi\b|\bpa\b/],
  ["chi", /\bmandarin\b|\bcantonese\b|\bchinese\b|\bchi\b|\bzho\b/],
  ["kor", /\bkorean\b|\bkor\b/],
  ["rus", /\brus(sian)?\b|lostfilm|hdrezka/],
  ["ukr", /\bukr(ainian)?\b/],
  ["ita", /\bita(lian)?\b|\bitaliano\b/],
  ["fre", /\bfrench\b|\btruefrench\b|\bfre\b/],
  ["ger", /\bgerman\b|\bdeutsch\b|\bger[\s._-]*dub\b/],
  ["eng", /\b(?:eng|english)[\s._-]*(?:dub|audio|aac|ac3|eac3|ddp?5?|2\.0|5\.1)\b|\bdubbed\b(?!.*\bjapanese?\b)|\bfandub\b|\beng?\b(?=.*\bdubs?\b)/],
  ["eng", /\bdublado\b|\benglish[\s._-]*dubs?\b/],
  ["spa", /\b(?:latino|espanol|spanish|castellano)\b/],
  ["por", /\b(?:portugues|portuguesa|pt[\s._-]*br)\b/],
  ["jap", /\bjapanese?\b|\bjpn?\b(?![^.]*\bsub)/],
  ["raw", /\braw\b/],
];

/** real language tags (everything except track-layout tags) */
const LANG_TAGS = [
  "eng", "jap", "chi", "kor", "rus", "ukr", "ita", "fre", "ger", "spa", "por",
  "hindi", "tamil", "telugu", "malayalam", "kannada", "bengali", "marathi", "punjabi",
];

/** languages whose "… Dubbed" uploads mean THAT language, not English */
const INDIAN_REGION_TAGS = [
  "hindi", "tamil", "telugu", "malayalam", "kannada", "bengali", "marathi", "punjabi",
  "spa", "por", "chi", "kor", "rus", "ukr", "ita", "fre", "ger",
];

/**
 * Tags for one release. Japanese-audio-with-subs (the default anime shape:
 * fansub groups, "Eng-Subs", "MultiSub") lands on "sub"; anything with a
 * dub/audio tag lands on its language; "dual"/"multi" are additive so a
 * "Dual-Audio Eng/Jap" release matches both language filters.
 */
export function detectAudioTags(releaseName: string, isAnime: boolean): string[] {
  const n = releaseName.toLowerCase();
  const tags = new Set<string>();
  for (const [tag, re] of AUDIO_TAG_PATTERNS) {
    if (re.test(n)) tags.add(tag);
  }
  // "Eng-Subs" / "MultiSub" mean subtitles, not a dub — remove the dub tag
  // the generic \beng\b pattern may have picked up from them
  const subsOnly = /\b(?:eng|english)[\s._-]*subs?\b|\bmultisubs?\b|\bvost(?:fr|en)?\b|\bsub ?(?:eng|es|indo)?\b/.test(n);
  if (subsOnly && !/\b(?:dub|dubbed|dublado|dual)\b/.test(n)) tags.delete("eng");
  // "Hindi Dubbed" dubs INTO Hindi — the generic \bdubbed\b tag must not add
  // English unless the name actually mentions it
  const indianTag = INDIAN_REGION_TAGS.find((t) => tags.has(t));
  if (tags.has("eng") && indianTag && !/\b(?:eng|english)\b/.test(n)) tags.delete("eng");
  if (tags.has("dual") || tags.has("multi")) {
    // a dual/multi-audio release carries both the original and a dub
    if (isAnime) tags.add("jap");
    if (/\b(?:eng|english)\b/.test(n) || tags.has("eng")) tags.add("eng");
  }
  // "[Multi-Dub]" on anime = several dubs, English always among them
  if (isAnime && /\bmulti[\s._-]*dubs?\b/.test(n)) tags.add("eng");
  if (tags.size === 0) {
    // anime fansub defaults to subbed japanese; western releases unknown
    if (isAnime) return ["sub", "jap"];
    return ["unknown"];
  }
  // anime fansub default = subbed japanese — but only when the name carries
  // NO real language at all ("rus.LostFilm" is a Russian dub, not a sub)
  const hasLangTag = LANG_TAGS.some((t) => tags.has(t));
  if (isAnime && !hasLangTag && !tags.has("dual") && !tags.has("multi") && !tags.has("raw")) {
    tags.add("sub"); // japanese audio + subs is the anime default
    tags.add("jap");
  }
  return [...tags];
}

/**
 * Search phrase a dub in this language is tagged with on indexers. When the
 * user picks an audio language in the player, providers run one extra
 * dub-targeted query so English/Hindi/Tamil… servers actually get found
 * instead of only filtering whatever the default scan returned.
 */
const DUB_QUERY: Record<string, string> = {
  eng: "english dub",
  hindi: "hindi dubbed",
  tamil: "tamil dubbed",
  telugu: "telugu dubbed",
  malayalam: "malayalam dubbed",
  kannada: "kannada dubbed",
  bengali: "bengali dubbed",
  marathi: "marathi dubbed",
  punjabi: "punjabi dubbed",
  spa: "spanish",
  por: "dublado",
  chi: "chinese dub",
  jap: "japanese",
  kor: "korean",
  rus: "russian",
  ukr: "ukrainian",
  ita: "italian",
  fre: "french",
  ger: "german",
};

/* ---------- parsing helpers ---------- */

function parseCount(raw: string | undefined | null): number {
  if (!raw) return 0;
  const m = raw.replace(/,/g, "").trim().match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2]?.toUpperCase() === "K" ? 1e3 : m[2]?.toUpperCase() === "M" ? 1e6 : 1;
  return Math.round((isFinite(n) ? n : 0) * mult);
}

function parseSizeBytes(raw: string | undefined | null): number {
  if (!raw) return 0;
  const m = raw.replace(/,/g, "").match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mult = unit === "TB" ? 1e12 : unit === "GB" ? 1e9 : unit === "MB" ? 1e6 : unit === "KB" ? 1e3 : 1;
  return Math.round((isFinite(n) ? n : 0) * mult);
}

function detectQuality(name: string): string {
  const n = name.toLowerCase();
  if (/\b(2160p|4k)\b/.test(n)) return "2160p";
  if (/\b1080p\b/.test(n)) return "1080p";
  if (/\b720p\b/.test(n)) return "720p";
  if (/\b480p\b|\bdvdrip\b|\bdvd\b/.test(n)) return "480p";
  if (/\b(360p|sd)\b/.test(n)) return "SD";
  return "unknown";
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------- strict validation ---------- */

/**
 * Name-based sanity check applied even to IMDb-keyed providers: indexers
 * sometimes attach wrong IMDb ids to uploads, so a release whose own name
 * contradicts the request (wrong year / wrong episode) is dropped no matter
 * which provider supplied it.
 */
function sanityOk(
  p: ParsedRelease,
  type: "movie" | "tv",
  year: string,
  season: number,
  episode: number
): boolean {
  if (type === "movie") {
    if (p.year !== null && year && Math.abs(p.year - Number(year)) > 1) return false;
    return true;
  }
  if (p.season !== null && p.season !== season) return false;
  if (p.episode !== null && p.episode !== episode) return false;
  return true;
}

/* ---------- providers ---------- */

interface TorrentioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: { filename?: string };
}

/** IMDb-keyed — but indexers mislabel ids, so names are still cross-checked. */
async function providerTorrentio(
  type: "movie" | "tv",
  imdbId: string,
  ctx: BayContext,
  year: string,
  airDate: string | null
): Promise<TorrentSource[]> {
  const season = ctx.season;
  const episode = ctx.episode;
  // Stremio addon stream ids are single segments: `tt…:season:episode`.
  // (slash-separated paths 404 since the 2026 addon API tightening)
  const path =
    type === "movie"
      ? `stream/movie/${imdbId}.json`
      : `stream/series/${imdbId}:${season}:${episode}.json`;
  const data = await fetchJson<{ streams?: TorrentioStream[] }>(
    `https://torrentio.strem.fun/${path}`
  );
  const streams = data?.streams ?? [];
  const out: TorrentSource[] = [];
  for (const s of streams) {
    if (!s.infoHash || !/^[0-9a-f]{40}$/i.test(s.infoHash)) continue;
    const titleLines = (s.title ?? "").split("\n");
    const releaseName = (titleLines[0] || s.behaviorHints?.filename || "Torrent").trim();
    // indexers occasionally attach a wrong IMDb id — cross-check the name
    const parsed = parseRelease(releaseName);
    if (!sanityOk(parsed, type, year, season, episode)) continue;
    // full name-level validation: same title, right episode, plausible air
    // year — "ONE PIECE 2023" (the live action) must never answer for the anime
    const match =
      type === "tv"
        ? matchTv(parsed, season, episode, ctx.title, ctx.originalTitle, {
            airDate,
            showLang: ctx.showLang ?? null,
            absEpisode: ctx.absEpisode ?? null,
            relEpisode: ctx.relEpisode ?? null,
          })
        : matchMovie(parsed, ctx.title, ctx.originalTitle, ctx.year);
    if (!match) continue;
    const metaLine = titleLines.find((l) => l.includes("👤")) ?? "";
    const seeders = parseCount(metaLine.match(/👤\s*([\d.,]+\s*[KM]?)/)?.[1]);
    const sizeBytes = parseSizeBytes(metaLine.match(/💾\s*([\d.,]+\s*[KMGTB]+)/i)?.[1]);
    const provider = metaLine.match(/⚙️\s*([^\n]+)/)?.[1]?.trim() || "Torrentio";
    const hintName = s.name ?? "";
    const quality =
      /4k/i.test(hintName) && !/1080p/.test(releaseName)
        ? "2160p"
        : detectQuality(releaseName);
    out.push({
      id: s.infoHash.toLowerCase(),
      releaseName,
      seeders,
      peers: 0,
      sizeBytes,
      provider,
      quality,
      fileIdx: typeof s.fileIdx === "number" ? s.fileIdx : null,
      match,
      score: 0,
    });
  }
  return out;
}

interface ApibayResult {
  name?: string;
  info_hash?: string;
  leechers?: string;
  seeders?: string;
  size?: string;
}

/** TMDB original_language code → the word Indian releases use for it */
export const LANG_WORD: Record<string, string> = {
  ta: "tamil",
  te: "telugu",
  hi: "hindi",
  ml: "malayalam",
  kn: "kannada",
  mr: "marathi",
  bn: "bengali",
  pa: "punjabi",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Air date (YYYY-MM-DD) of one episode — short TTL so brand-new daily-show
 *  episodes (Bigg Boss S20E55…) get their date as soon as TMDB publishes it. */
const seasonCache = new Map<string, { dates: Map<number, string | null>; ts: number }>();
const SEASON_TTL = 30 * 60 * 1000;

export async function getEpisodeAirDate(
  tmdbId: number,
  season: number,
  episode: number
): Promise<string | null> {
  const key = `tv:${tmdbId}:${season}`;
  let hit = seasonCache.get(key);
  if (!hit || Date.now() - hit.ts > SEASON_TTL) {
    try {
      const data = await tmdbServer<{
        episodes?: { episode_number: number; air_date: string | null }[];
      }>(`tv/${tmdbId}/season/${season}`);
      const dates = new Map<number, string | null>();
      for (const e of data.episodes ?? []) dates.set(e.episode_number, e.air_date ?? null);
      hit = { dates, ts: Date.now() };
      seasonCache.set(key, hit);
    } catch {
      return null;
    }
  }
  return hit.dates.get(episode) ?? null;
}

interface BayContext {
  title: string;
  originalTitle?: string;
  year?: string;
  countries: string[];
  season: number;
  episode: number;
  airDate?: string | null;
  showLang?: string | null;
  /** broadcast-order episode number (anime) */
  absEpisode?: number | null;
  /** fansub-relative episode for merged sequel seasons (anime: TMDB
   *  "Bleach" S02 = Thousand-Year Blood War, fansubs number it from 1) */
  relEpisode?: number | null;
  /** Japanese-language title → fansub indexers (Nyaa) get queried too */
  isAnime?: boolean;
  /** user's audio-language pick ("eng", "hindi"…) — adds a dub-targeted query */
  audioLang?: string | null;
}

/**
 * Keyword provider — answers on title words alone, so every result is
 * strictly validated here against the requested year (movies) or
 * season/episode (TV) before it may enter the candidate list.
 */
async function providerPirateBay(
  type: "movie" | "tv",
  ctx: BayContext
): Promise<TorrentSource[]> {
  const { title, originalTitle, year, season, episode } = ctx;
  const queries =
    type === "movie"
      ? [`${title} ${year ?? ""}`.trim(), title]
      : [
          `${title} s${pad(season)}e${pad(episode)}`,
          // language variant — Indian versions ("Bigg Boss Telugu") overflow the
          // bare-title result window on trackers
          ...(ctx.showLang ? [`${title} ${ctx.showLang}`] : []),
          `${title} ${season}x${pad(episode)}`,
          title, // dated daily-show names carry no SxxExx — match by name + air date
        ];
  // language picked in the player → also scan for dubs of that language
  const dub = ctx.audioLang ? DUB_QUERY[ctx.audioLang] : undefined;
  if (dub) queries.push(`${title} ${dub}`);

  const seen = new Map<string, TorrentSource>();
  const collect = (rows: ApibayResult[]) => {
    for (const r of rows) {
      if (!r.info_hash || !/^[0-9a-f]{40}$/i.test(r.info_hash)) continue;
      const name = (r.name ?? "Torrent").trim();
      if (name === "No results") continue;
      const p = parseRelease(name);
      const match =
        type === "movie"
          ? matchMovie(p, title, originalTitle, year)
          : matchTv(p, season, episode, title, originalTitle, {
              airDate: ctx.airDate,
              showLang: ctx.showLang,
              absEpisode: ctx.absEpisode,
            });
      if (!match) continue; // same name, different film/episode — reject
      const cPen = type === "tv" ? countryPenalty(p, ctx.countries) : 0;
      // an explicit country tag that contradicts the show ("The.Office.US"
      // when the TMDB show is GB) is a different show — hard reject
      if (cPen < 0) continue;
      const key = r.info_hash.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        id: key,
        releaseName: name,
        seeders: parseCount(r.seeders),
        peers: parseCount(r.leechers),
        sizeBytes: parseSizeBytes(r.size),
        provider: "ThePirateBay",
        quality: detectQuality(name),
        fileIdx: null,
        match,
        countryPenalty: cPen,
        score: 0,
      });
    }
  };

  // apibay answers tiny JSON quickly; sequential keeps request count low
  for (const q of queries) {
    if (seen.size >= 5) break;
    const rows = await fetchJson<ApibayResult[]>(
      `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=`,
      7000
    );
    if (rows && Array.isArray(rows)) collect(rows);
  }

  // episode-level search came up empty → try season packs for TV
  if (type === "tv" && seen.size === 0) {
    const packQueries = [`${title} s${pad(season)}`, `${title} season ${season}`];
    for (const q of packQueries) {
      const rows = await fetchJson<ApibayResult[]>(
        `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=`,
        7000
      );
      if (rows && Array.isArray(rows)) collect(rows);
      if (seen.size > 0) break;
    }
  }
  return [...seen.values()];
}

interface BitsearchCard {
  hash: string;
  name: string;
  seeders: number;
  peers: number;
  sizeBytes: number;
}

/**
 * BitSearch (bitsearch.eu) — HTML search, the last live indexer when the
 * JSON APIs are down or blocked. It indexes Indian release groups
 * (1TamilBlasters, TamilMV, 3MovieRulz…) that upload daily-show episodes
 * ("Bigg Boss (2026) S09E101 …") hours after broadcast. Every row is
 * validated with the same strict matcher as the keyword providers.
 */
async function providerBitSearch(type: "movie" | "tv", ctx: BayContext): Promise<TorrentSource[]> {
  const { title, originalTitle, year, season, episode } = ctx;
  const queries =
    type === "movie"
      ? [`${title} ${year ?? ""}`.trim(), title]
      : [
          `${title} s${pad(season)}e${pad(episode)}`,
          `${title} season ${season}`, // dated daily shows + season packs
        ];
  // language picked in the player → also scan for dubs of that language
  const dub = ctx.audioLang ? DUB_QUERY[ctx.audioLang] : undefined;
  if (dub) queries.push(`${title} ${dub}`);

  const cards = new Map<string, BitsearchCard>();
  const scrape = async (q: string) => {
    try {
      const res = await fetch(`https://bitsearch.eu/search?q=${encodeURIComponent(q)}`, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(9000),
        redirect: "follow",
      });
      if (!res.ok) return;
      const html = (await res.text()).replace(/\s+/g, " ");
      const re = /\/download\/torrent\/([0-9a-fA-F]{40})\?title=([^">]+)/g;
      for (const m of html.matchAll(re)) {
        const hash = m[1].toLowerCase();
        if (cards.has(hash)) continue;
        let name = m[2];
        try { name = decodeURIComponent(name); } catch { /* raw text fallback */ }
        name = name
          .replace(/&amp;/g, "&")
          .replace(/&#x3D;|&#61;/gi, "=")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/g, "'")
          .trim();
        const win = html.slice(Math.max(0, m.index - 2200), m.index);
        const seeders = Number(win.match(/font-medium">(\d+)<\/span>\s*<span>\s*seeders/)?.[1] ?? 0);
        const peers = Number(win.match(/font-medium">(\d+)<\/span>\s*<span>\s*leechers/)?.[1] ?? 0);
        const sizeBytes = parseSizeBytes(
          win.match(/fa-download"><\/i>\s*<span>\s*([\d.]+\s*[KMGT]?B)</i)?.[1] ?? null
        );
        cards.set(hash, { hash, name, seeders, peers, sizeBytes });
      }
    } catch {
      // blocked / timed out — the other providers still answer
    }
  };

  await Promise.all(queries.map(scrape));

  const out: TorrentSource[] = [];
  for (const c of cards.values()) {
    const p = parseRelease(c.name);
    const match =
      type === "movie"
        ? matchMovie(p, title, originalTitle, year)
        : matchTv(p, season, episode, title, originalTitle, {
            airDate: ctx.airDate,
            showLang: ctx.showLang,
            absEpisode: ctx.absEpisode,
          });
    if (!match) continue; // same name, wrong season/episode/year — reject
    if (type === "tv" && countryPenalty(p, ctx.countries) < 0) continue;
    out.push({
      id: c.hash,
      releaseName: c.name,
      seeders: c.seeders,
      peers: c.peers,
      sizeBytes: c.sizeBytes,
      provider: "BitSearch",
      quality: detectQuality(c.name),
      fileIdx: null,
      match,
      score: 0,
    });
  }
  return out;
}

interface TorrentsCsvRow {
  infohash?: string;
  name?: string;
  size_bytes?: number;
  seeders?: number;
  leechers?: number;
}

/**
 * torrents-csv.com — open torrent database with a JSON API. It indexes the
 * Indian release groups (TamilMV / TamilBlasters / 5MovieRulz …) that publish
 * daily-show episodes hours after broadcast ("BIGG BOSS (Telugu) S10 EP21 …"),
 * which the western trackers are slow to pick up. Every row is validated with
 * the same strict matcher as the other keyword providers.
 */
async function providerTorrentsCsv(type: "movie" | "tv", ctx: BayContext): Promise<TorrentSource[]> {
  const { title, originalTitle, year, season, episode } = ctx;
  const queries =
    type === "movie"
      ? [`${title} ${year ?? ""}`.trim(), title]
      : [
          `${title} ${ctx.showLang ?? ""}`.trim(), // "Bigg Boss Telugu" — current-season uploads
          `${title} s${pad(season)}e${pad(episode)}`,
          `${title} season ${season}`,
          title,
        ];
  // language picked in the player → also scan for dubs of that language
  const dub = ctx.audioLang ? DUB_QUERY[ctx.audioLang] : undefined;
  if (dub) queries.push(`${title} ${dub}`);

  const seen = new Map<string, TorrentSource>();
  for (const q of queries) {
    if (seen.size >= 5) break;
    const data = await fetchJson<{ torrents?: TorrentsCsvRow[] }>(
      `https://torrents-csv.com/service/search?q=${encodeURIComponent(q)}&size=100`,
      8000
    );
    for (const r of data?.torrents ?? []) {
      if (!r.infohash || !/^[0-9a-f]{40}$/i.test(r.infohash)) continue;
      const name = (r.name ?? "Torrent").trim();
      const p = parseRelease(name);
      const match =
        type === "movie"
          ? matchMovie(p, title, originalTitle, year)
          : matchTv(p, season, episode, title, originalTitle, {
              airDate: ctx.airDate,
              showLang: ctx.showLang,
              absEpisode: ctx.absEpisode,
            });
      if (!match) continue; // same name, different film/episode/language — reject
      if (type === "tv" && countryPenalty(p, ctx.countries) < 0) continue;
      const key = r.infohash.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        id: key,
        releaseName: name,
        seeders: r.seeders ?? 0,
        peers: r.leechers ?? 0,
        sizeBytes: r.size_bytes ?? 0,
        provider: "TorrentsCSV",
        quality: detectQuality(name),
        fileIdx: null,
        match,
        score: 0,
      });
    }
  }
  return [...seen.values()];
}

interface SolidTorrentsRow {
  infohash?: string;
  title?: string;
  size?: number;
  /** older API responses carried a swarm object; newer ones may omit it */
  swarm?: { seeders?: number; leechers?: number } | null;
  seeders?: number;
  leechers?: number;
}

/**
 * SolidTorrents — JSON API index (solidtorrents.eu; the .to domain redirects
 * and answers the same shape). Infohash-keyed so results stream directly from
 * the engine. Seed counts are often absent — unknown-seeder rows rank low in
 * merge() but still give the player a working backup pipe when the big
 * indexers are walled. Verified reachable 2026-11-01.
 */
const SOLID_HOSTS = ["solidtorrents.eu", "solidtorrents.to"];

async function providerSolidTorrents(
  type: "movie" | "tv",
  ctx: BayContext
): Promise<TorrentSource[]> {
  const { title, originalTitle, year, season, episode } = ctx;
  const queries =
    type === "movie"
      ? [`${title} ${year ?? ""}`.trim(), title]
      : [
          `${title} s${pad(season)}e${pad(episode)}`,
          `${title} ${ctx.showLang ?? ""}`.trim(),
          title,
        ];
  const dub = ctx.audioLang ? DUB_QUERY[ctx.audioLang] : undefined;
  if (dub) queries.push(`${title} ${dub}`);

  const seen = new Map<string, TorrentSource>();
  for (const q of queries) {
    if (seen.size >= 5) break;
    let data: { results?: SolidTorrentsRow[] } | null = null;
    for (const host of SOLID_HOSTS) {
      data = await fetchJson<{ results?: SolidTorrentsRow[] }>(
        `https://${host}/api/v1/search?q=${encodeURIComponent(q)}`,
        8000
      );
      if (data) break; // any well-formed answer ends the chain
    }
    for (const r of data?.results ?? []) {
      if (!r.infohash || !/^[0-9a-f]{40}$/i.test(r.infohash)) continue;
      const name = (r.title ?? "Torrent").trim();
      const p = parseRelease(name);
      const match =
        type === "movie"
          ? matchMovie(p, title, originalTitle, year)
          : matchTv(p, season, episode, title, originalTitle, {
              airDate: ctx.airDate,
              showLang: ctx.showLang,
              absEpisode: ctx.absEpisode,
            });
      if (!match) continue;
      if (type === "tv" && countryPenalty(p, ctx.countries) < 0) continue;
      const key = r.infohash.toLowerCase();
      if (seen.has(key)) continue;
      seen.set(key, {
        id: key,
        releaseName: name,
        seeders: r.swarm?.seeders ?? r.seeders ?? 0,
        peers: r.swarm?.leechers ?? r.leechers ?? 0,
        sizeBytes: r.size ?? 0,
        provider: "SolidTorrents",
        quality: detectQuality(name),
        fileIdx: null,
        match,
        score: 0,
      });
    }
  }
  return [...seen.values()];
}

interface YtsTorrent {  hash?: string;
  quality?: string;
  type?: string;
  size?: string;
  size_bytes?: number;
  seeds?: number;
  peers?: number;
}

interface YtsMovie {
  title?: string;
  year?: number;
  imdb_code?: string;
  torrents?: YtsTorrent[];
}

interface YtsResponse {
  data?: { movies?: YtsMovie[] | null; movie_count?: number };
}

/**
 * YTS — the clean-encode movie tracker (1080p/2160p x264, universally
 * browser-playable). The official yts.mx is unreachable from this deployment
 * and several mirror domains are CF-walled, but yts.rs mirrors the same
 * api-v2 shape and answers fine (verified 2026-11-01). Keyword search is
 * mirrored but IMDb search is not, so we query by title and pin the movie
 * down by its imdb_code; every release name is still passed through the
 * strict movie matcher like any keyword provider.
 */
const YTS_HOSTS = ["yts.rs", "yts.mx", "yts.bz"];

async function ytsMovies(query: string): Promise<YtsMovie[]> {
  for (const host of YTS_HOSTS) {
    const data = await fetchJson<YtsResponse>(
      `https://${host}/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=50&sort_by=seeders&order_by=desc`,
      8000
    );
    if (data) return data.data?.movies ?? []; // any well-formed answer ends the chain
  }
  return [];
}

async function providerYts(
  type: "movie" | "tv",
  imdbId: string,
  ctx: BayContext
): Promise<TorrentSource[]> {
  if (type !== "movie") return []; // YTS carries movies only
  const { title, originalTitle, year } = ctx;
  const out: TorrentSource[] = [];
  for (const q of [title, ...(originalTitle && originalTitle !== title ? [originalTitle] : [])]) {
    const movies = await ytsMovies(q);
    for (const m of movies) {
      if (!m.imdb_code || m.imdb_code.toLowerCase() !== imdbId.toLowerCase()) continue;
      const movieYear = m.year ? String(m.year) : year || "";
      for (const t of m.torrents ?? []) {
        if (!t.hash || !/^[0-9a-f]{40}$/i.test(t.hash)) continue;
        // reconstruct a scene-style release name (YTS API exposes quality but
        // not the scene name) so parseRelease/matchMovie can validate it
        const releaseName = [
          m.title ?? title,
          movieYear,
          t.quality ?? "",
          t.type === "web" ? "WEB" : "BluRay",
          "x264",
          "YIFY",
        ]
          .filter(Boolean)
          .join(".")
          .replace(/[:']/g, "")
          .replace(/\s+/g, ".");
        const parsed = parseRelease(releaseName);
        if (!sanityOk(parsed, "movie", year || movieYear, 1, 1)) continue;
        const match = matchMovie(parsed, title, originalTitle, year || movieYear);
        if (!match) continue; // mislabeled imdb_code — same-name different film
        out.push({
          id: t.hash.toLowerCase(),
          releaseName,
          seeders: t.seeds ?? 0,
          peers: t.peers ?? 0,
          sizeBytes: t.size_bytes ?? parseSizeBytes(t.size),
          provider: "YTS",
          quality: t.quality ?? detectQuality(releaseName),
          fileIdx: null,
          match,
          score: 0,
        });
      }
    }
    if (out.length > 0) break; // first query that identifies the movie wins
  }
  return out;
}

interface EztvTorrent {
  hash?: string;
  filename?: string;
  size_bytes?: number;
  seeds?: number;
  peers?: number;
  season?: number;
  episode?: number;
}

/** EZTV rotates domains; the first mirror that answers wins. */
const EZTV_HOSTS = ["eztvx.to", "eztv.wf", "eztv.tf"];

async function eztvPage(
  numericId: string,
  page: number
): Promise<{ torrents?: EztvTorrent[] } | null> {
  for (const host of EZTV_HOSTS) {
    const data = await fetchJson<{ torrents?: EztvTorrent[] }>(
      `https://${host}/api/get-torrents?imdb_id=${numericId}&limit=100&page=${page}`,
      7000
    );
    if (data) return data; // any well-formed answer — even empty — ends the chain
  }
  return null;
}

/**
 * IMDb-keyed per episode. The API rows carry season/episode metadata and
 * ignore the season/episode query params, so we scan a couple of recency
 * pages; the filename is cross-checked so a mislabeled row can't leak wrong
 * episodes into same-named shows.
 */
async function providerEztv(
  imdbId: string,
  ctx: BayContext,
  airDate: string | null
): Promise<TorrentSource[]> {
  const season = ctx.season;
  const episode = ctx.episode;
  const out: TorrentSource[] = [];
  const numericId = imdbId.replace(/^tt/i, "");
  for (let page = 1; page <= 2 && out.length < 8; page++) {
    const data = await eztvPage(numericId, page);
    const rows = data?.torrents ?? [];
    for (const r of rows) {
      if (!r.hash || !/^[0-9a-f]{40}$/i.test(r.hash)) continue;
      if (r.season && season && r.season !== season) continue;
      if (r.episode && episode && r.episode !== episode) continue;
      const filename = (r.filename ?? "Episode").trim();
      const p = parseRelease(filename);
      // full name-level validation against the requested show/episode
      const match = matchTv(p, season, episode, ctx.title, ctx.originalTitle, {
        airDate,
        showLang: ctx.showLang ?? null,
        absEpisode: ctx.absEpisode ?? null,
        relEpisode: ctx.relEpisode ?? null,
      });
      if (!match) continue;
      out.push({
        id: r.hash.toLowerCase(),
        releaseName: filename,
        seeders: r.seeds ?? 0,
        peers: r.peers ?? 0,
        sizeBytes: r.size_bytes ?? 0,
        provider: "EZTV",
        quality: detectQuality(filename),
        fileIdx: null,
        match,
        score: 0,
      });
      if (out.length >= 8) break;
    }
    if (rows.length < 100) break; // no more pages for this show
  }
  return out;
}

/* ---------- anime: nyaa.si (fansub indexers) ---------- */

interface NyaaItem {
  title: string;
  infoHash: string;
  seeders: number;
  leechers: number;
  sizeBytes: number;
  /** upload date (epoch ms) — identifies fresh sequel-episode fansubs */
  pubDate: number | null;
}

/** RSS search on nyaa.si — the primary public index for fansubbed anime. */
async function nyaaSearch(query: string): Promise<NyaaItem[]> {
  try {
    const res = await fetch(
      `https://nyaa.si/?page=rss&f=0&c=0_0&q=${encodeURIComponent(query)}`,
      {
        headers: {
          accept: "application/rss+xml",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0",
        },
        signal: AbortSignal.timeout(9000),
      }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NyaaItem[] = [];
    for (const chunk of xml.split("<item>").slice(1)) {
      const pick = (re: RegExp) => chunk.match(re)?.[1]?.trim() ?? "";
      const title = pick(/<title>([\s\S]*?)<\/title>/);
      const infoHash = pick(/<nyaa:infoHash>([0-9a-fA-F]{40})<\/nyaa:infoHash>/).toLowerCase();
      if (!title || !infoHash) continue;
      // "1.4 GiB" → "1.4 GB" so the shared size parser understands it
      const sizeRaw = pick(/<nyaa:size>([\d.]+\s*[KMGTP]i?B)<\/nyaa:size>/).replace(/i/g, "");
      const pubRaw = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const pubMs = pubRaw ? new Date(pubRaw).getTime() : NaN;
      items.push({
        title,
        infoHash,
        seeders: parseInt(pick(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/), 10) || 0,
        leechers: parseInt(pick(/<nyaa:leechers>(\d+)<\/nyaa:leechers>/), 10) || 0,
        sizeBytes: parseSizeBytes(sizeRaw),
        pubDate: Number.isFinite(pubMs) ? pubMs : null,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** "892-1085" / "1078.5-1085" / "E01-E52" batch range inside a fansub
 *  release name. */
export function batchRange(name: string): [number, number] | null {
  const m = name.match(/(\d{1,4})(?:\.\d)?\s*(?:[-–—~]|to)\s*E?(\d{1,4})\b/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b > a && b - a <= 400 ? [a, b] : null;
}

/**
 * Nyaa — fansubbed anime releases. Names use broadcast-order episode numbers
 * ("One Piece - 1085"), season/episode tags ("S02E05") or batch ranges
 * ("Season 20 (892-1085) Batch"), all handled via the strict matcher plus an
 * explicit absolute-episode check. Only enabled for Japanese titles.
 */
async function providerNyaa(type: "movie" | "tv", ctx: BayContext): Promise<TorrentSource[]> {
  const { title, originalTitle, season, episode, absEpisode, relEpisode, isAnime } = ctx;
  if (type !== "movie" && !isAnime && !title) return [];
  const wanted = absEpisode ?? episode;
  const relWanted = relEpisode ?? null;
  const queries =
    type === "movie"
      ? [`${title} ${ctx.year ?? ""}`.trim(), title, ...(originalTitle ? [originalTitle] : [])]
      : isAnime
        ? [
            `${title} ${wanted}`,
            // merged sequel seasons are fansub-numbered from 1 ("Sennen
            // Kessen-hen - 45"), which differs from the broadcast-order number
            ...(relWanted != null && relWanted !== wanted ? [`${title} ${relWanted}`] : []),
            ...(originalTitle ? [`${originalTitle} ${wanted}`] : []),
            `${title} s${pad(season)}e${pad(episode)}`,
          ]
        : // western shows on Nyaa use standard SxxEyy naming — bare episode
          // numbers ("Friends 8") would just return noise
          [`${title} s${pad(season)}e${pad(episode)}`, title];
  // "english dub" etc — Nyaa carries tagged dub uploads for popular anime
  const dub = ctx.audioLang ? DUB_QUERY[ctx.audioLang] : undefined;
  if (dub) queries.push(`${title} ${dub}`);

  const seen = new Map<string, TorrentSource>();
  for (const q of queries) {
    if (seen.size >= 6) break;
    const rows = await nyaaSearch(q);
    for (const r of rows) {
      if (seen.has(r.infoHash)) continue;
      const p = parseRelease(r.title);
      let match: MatchClass | null;
      if (type === "movie") {
        match = matchMovie(p, title, originalTitle, ctx.year);
      } else {
        match = matchTv(p, season, episode, title, originalTitle, {
          airDate: ctx.airDate,
          absEpisode,
          relEpisode: relWanted,
          pubDate: r.pubDate,
        });
        if (!match) {
          // multi-episode batch: keep it as a pack — the stream route picks
          // the right file inside the torrent by episode number. The release
          // must actually carry the show's title (Nyaa results for one anime
          // routinely contain other shows' batches — "名探偵コナン 第01-105巻"
          // must never answer a Bleach query just because 1-105 spans the
          // wanted episode). The relative number is only accepted inside a
          // SUBTITLED release (>= 2 unconsumed title words — "Sennen
          // Kessen-hen 1-52 Batch"), so the base show's batches ("Bleach
          // 001~366", "BLEACH Kai 1~366") can never answer a sequel-season
          // request.
          const br = batchRange(r.title);
          if (br) {
            const tm = bestTitleMatch(p, [title, originalTitle].filter(Boolean) as string[]);
            // cleanExtras: everything the title match left over is a numeral
            // or a release/tech tag — a sequel subtitle ("Thousand Year Blood
            // War", "Sennen Kessen-hen") marks DIFFERENT content, which must
            // only answer a sequel-season request via its relative number
            const cleanExtras = subtitleWords(p, [title, originalTitle]).length === 0;
            if (tm.ratio >= 0.5) {
              const inAbs = wanted >= br[0] && wanted <= br[1];
              const inRel =
                relWanted != null && relWanted >= br[0] && relWanted <= br[1];
              if (
                (inAbs && cleanExtras) ||
                (inRel && subtitleWords(p, [title, originalTitle]).length >= 2)
              ) {
                match = "pack";
              }
            }
          }
        }
      }
      if (!match) continue;
      seen.set(r.infoHash, {
        id: r.infoHash,
        releaseName: r.title,
        seeders: r.seeders,
        peers: r.leechers,
        sizeBytes: r.sizeBytes,
        provider: "Nyaa",
        quality: detectQuality(r.title),
        fileIdx: null,
        match,
        score: 0,
      });
    }
  }
  return [...seen.values()];
}

/* ---------- scoring ---------- */

export function scoreTorrent(t: TorrentSource): number {
  let s = Math.min(Math.log10(t.seeders + 1) * 4, 13);
  if (t.quality === "1080p") s += 5;
  else if (t.quality === "720p") s += 4;
  else if (t.quality === "2160p") s += 2;
  else if (t.quality === "480p") s += 1;
  const n = t.releaseName.toLowerCase();
  // Browser codec reality gates the whole list: 10-bit H.264 (Hi10P — the
  // anime-scene default re-encode) has NO browser software decoder and HEVC
  // only plays where hardware support exists, so a heavily 10bit/HEVC top of
  // the strip means every "server" errors out instantly. Sink them far below
  // any playable release; they only surface when nothing playable was found.
  if (/x265|h\.?265|hevc/.test(n)) s -= 10;
  if (/10[\s._-]?bit|hi10\w*/.test(n)) s -= 20;
  if (/av1/.test(n)) s += 1;
  if (/x264|h\.?264|xvid/.test(n) && !/10[\s._-]?bit|hi10/.test(n)) s += 2;
  if (/\b(cam|ts|telesync|screener|dvdscr|hdts|\btc\b)\b/.test(n)) s -= 12;
  if (/\b3d\b/.test(n)) s -= 6;
  if (/\.mp4\b/.test(n) || /yts/i.test(t.releaseName)) s += 1.5;
  if (t.sizeBytes > 0 && t.sizeBytes < 120 * 1024 * 1024) s -= 2;
  if (t.sizeBytes > 25 * 1024 * 1024 * 1024) s -= 3;
  return Math.round(s * 10) / 10;
}

/** Bonus/penalty applied for how tightly a release matches the request. */
const MATCH_RANK: Record<MatchClass, number> = {
  verified: 8,
  pack: 2.5,
  weak: -6,
};

/** Trust adjustment per indexer, added on top of the content score. Measured
 * on 2026-11-01: BitSearch's top "167 seeders" hit for Bleach S02E01 failed
 * to resolve metadata at all (stale scrape counts), while Nyaa's 67-seeder
 * result streamed at 1.2 MB/s — curated/indexed sources rank above scrapers.
 * Unknown providers get 0 (neutral). */
const PROVIDER_TRUST: Record<string, number> = {
  Nyaa: 4,
  // Torrentio rows carry their upstream tracker's name in `provider`
  // (parsed from its "⚙️ <tracker>" meta line) — Nyaa-fed rows arrive as
  // "NyaaSi" and must get the same trust as direct Nyaa results
  NyaaSi: 4,
  Torrentio: 3,
  EZTV: 2,
  YTS: 2,
  SolidTorrents: 1,
  ThePirateBay: 0,
  TorrentsCSV: 0,
  BitSearch: -3,
};

function merge(sources: TorrentSource[], audioLang?: string | null): TorrentSource[] {
  const best = new Map<string, TorrentSource>();
  for (const t of sources) {
    const prev = best.get(t.id);
    if (!prev || t.seeders > prev.seeders) best.set(t.id, t);
  }
  const list = [...best.values()];
  for (const t of list) {
    let s =
      scoreTorrent(t) + MATCH_RANK[t.match] + (t.countryPenalty ?? 0) + (PROVIDER_TRUST[t.provider] ?? 0);
    // an explicitly picked audio language ranks matching releases up, so the
    // player's auto-pick starts with a server that speaks the chosen language.
    // dual/multi releases may carry it (their track lists aren't in the name)
    // — they stay neutral instead of being sunk.
    if (audioLang) {
      const tags = t.audioTags ?? [];
      if (tags.includes(audioLang)) s += 5;
      else if (tags.includes("dual") || tags.includes("multi")) s += 0;
      else s -= 3;
    }
    t.score = Math.round(s * 10) / 10;
  }
  // only fall back to unverified (no-year) releases when nothing better exists
  const confident = list.filter((t) => t.match !== "weak");
  const final = confident.length ? confident : list;
  return final.sort((a, b) => b.score - a.score || b.seeders - a.seeders).slice(0, 14);
}

/* ---------- public API ---------- */

export interface SearchArgs {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  year: string;
  season: number;
  episode: number;
  /** user's audio-language pick ("eng", "hindi"…) — providers run extra
   *  dub-targeted queries for it; layout tags ("sub"/"dual") are ignored */
  audioLang?: string | null;
}

export async function searchTorrentSources(args: SearchArgs): Promise<TorrentSource[]> {
  const { type, tmdbId, title, season, episode } = args;
  const [imdbId, meta] = await Promise.all([getImdbId(type, tmdbId), getTitleMeta(type, tmdbId)]);
  // TMDB's own year is canonical (guards against stale/rounded client data)
  const year = meta.year || args.year || "";
  // Indian daily shows (Bigg Boss…) name episodes by broadcast date and tag
  // language versions — both are needed to match them without mixing content
  const airDate = type === "tv" ? await getEpisodeAirDate(tmdbId, season, episode) : null;
  const showLang = meta.originalLanguage ? LANG_WORD[meta.originalLanguage] ?? null : null;
  // "Bigg Boss Tamil" uploads are named "Bigg Boss (2026) S09E101 [Tamil …]":
  // the language moves into the tag area, so match against the base title and
  // let the release's language tag pick the right version (mismatch = reject)
  const matchTitle =
    type === "tv" && showLang
      ? title.replace(new RegExp(`\\s+${showLang}$`, "i"), "").trim() || title
      : title;

  // Japanese titles are anime: fansub indexers (Nyaa) get queried and the
  // broadcast-order episode number is offered to the matchers. Sequel seasons
  // folded into the base show ("Bleach" S02 = TYBW) additionally carry the
  // fansub-relative episode number.
  const isAnime = (meta.originalLanguage ?? "") === "ja";
  const absEpisode = type === "tv" && isAnime ? await getAbsoluteEpisode(tmdbId, season, episode) : null;
  const relEpisode = type === "tv" && isAnime && season >= 2 ? episode : null;
  // only real languages get dub queries — "sub"/"dual"/"multi" are track
  // layouts, not languages to search for
  const audioLang = args.audioLang && DUB_QUERY[args.audioLang] ? args.audioLang : null;

  const jobs: { name: string; run: () => Promise<TorrentSource[]> }[] = [];
  const bayCtx: BayContext = {
    title: matchTitle || title,
    originalTitle: meta.originalTitle ?? undefined,
    year: year || undefined,
    countries: meta.countries,
    season,
    episode,
    airDate,
    showLang,
    absEpisode,
    relEpisode,
    isAnime,
    audioLang,
  };
  if (matchTitle) {
    jobs.push({ name: "ThePirateBay", run: () => providerPirateBay(type, bayCtx) });
    jobs.push({ name: "BitSearch", run: () => providerBitSearch(type, bayCtx) });
    jobs.push({ name: "TorrentsCSV", run: () => providerTorrentsCsv(type, bayCtx) });
    jobs.push({ name: "SolidTorrents", run: () => providerSolidTorrents(type, bayCtx) });
    // Nyaa carries more than Japanese anime — western animation and
    // fansub-adjacent shows live there too. One or two cheap RSS calls;
    // the strict matcher rejects everything that isn't this show.
    if (type === "tv") jobs.push({ name: "Nyaa", run: () => providerNyaa(type, bayCtx) });
  }
  if (imdbId) {
    jobs.push({
      name: "Torrentio",
      run: () => providerTorrentio(type, imdbId, bayCtx, year, airDate),
    });
    jobs.push({ name: "YTS", run: () => providerYts(type, imdbId, bayCtx) });
    if (type === "tv") jobs.push({ name: "EZTV", run: () => providerEztv(imdbId, bayCtx, airDate) });
  }

  // every provider is independent: one being down (CF wall, DNS block, rate
  // limit) never fails the scan. The telemetry tells the UI / operator WHICH
  // sources answered when results look thin.
  const settled = await Promise.allSettled(
    jobs.map(async (j) => {
      const t0 = Date.now();
      try {
        const rows = await j.run();
        return { rows, provider: { name: j.name, count: rows.length, ms: Date.now() - t0, ok: true } };
      } catch (err) {
        return {
          rows: [] as TorrentSource[],
          provider: {
            name: j.name,
            count: 0,
            ms: Date.now() - t0,
            ok: false,
            error: String(err instanceof Error ? err.message : err).slice(0, 100),
          },
        };
      }
    })
  );
  const all: TorrentSource[] = [];
  const providers: ProviderStat[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      all.push(...r.value.rows);
      providers.push(r.value.provider);
    }
  }
  // audio/language tags are parsed once, centrally, for every provider result
  for (const t of all) t.audioTags = detectAudioTags(t.releaseName, isAnime);
  const merged = merge(all, audioLang);
  // remember which providers actually fed this result set
  lastProviderStats = providers.sort((a, b) => a.name.localeCompare(b.name));
  return merged;
}

export interface ProviderStat {
  name: string;
  count: number;
  ms: number;
  ok: boolean;
  error?: string;
}

/** Stats of the most recent scan (module-level: the route reads them right
 *  after awaiting searchTorrentSources — safe per-request in Node runtime). */
let lastProviderStats: ProviderStat[] = [];

export function takeProviderStats(): ProviderStat[] {
  const s = lastProviderStats;
  lastProviderStats = [];
  return s;
}

/** Cheap availability probe for the auto-content pipeline (Torrentio only). */
const availCache = new Map<string, { n: number; ts: number }>();
const AVAIL_TTL = 30 * 60 * 1000;

export async function quickAvailability(
  type: "movie" | "tv",
  imdbId: string,
  season: number,
  episode: number
): Promise<number> {
  const key = `${type}:${imdbId}:${season}:${episode}`;
  const hit = availCache.get(key);
  if (hit && Date.now() - hit.ts < AVAIL_TTL) return hit.n;
  const data = await fetchJson<{ streams?: TorrentioStream[] }>(
    type === "movie"
      ? `https://torrentio.strem.fun/stream/movie/${imdbId}.json`
      : `https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`,
    8000
  );
  const n = (data?.streams ?? []).length;
  availCache.set(key, { n, ts: Date.now() });
  return n;
}
