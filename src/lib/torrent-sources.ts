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
import { getImdbId, getTitleMeta, tmdbServer } from "./tmdb-server";
import {
  countryPenalty,
  matchMovie,
  matchTv,
  parseRelease,
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
  score: number;
}

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
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) CineX/1.0" },
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
  season: number,
  episode: number,
  year: string
): Promise<TorrentSource[]> {
  const path =
    type === "movie"
      ? `stream/movie/${imdbId}.json`
      : `stream/series/${imdbId}/${season}/${episode}.json`;
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
      match: "verified",
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
const LANG_WORD: Record<string, string> = {
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

async function getEpisodeAirDate(
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

interface YtsMovie {
  imdb_code?: string;
  title?: string;
  year?: number;
  torrents?: { hash?: string; quality?: string; size?: string; seeds?: number; peers?: number }[];
}

/** IMDb-keyed, but the endpoint fuzzy-matches — pin to the exact IMDb code. */
async function providerYts(imdbId: string, year: string, timeoutMs = 7000): Promise<TorrentSource[]> {
  const data = await fetchJson<{ data?: { movies?: YtsMovie[] } }>(
    `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(imdbId)}&limit=5`,
    timeoutMs
  );
  const movies = (data?.data?.movies ?? []).filter(
    (mv) => (mv.imdb_code ?? "").toLowerCase() === imdbId.toLowerCase()
  );
  const out: TorrentSource[] = [];
  for (const mv of movies) {
    // sanity: YTS metadata year must agree with TMDB (±1)
    if (year && mv.year && Math.abs(mv.year - Number(year)) > 1) continue;
    for (const t of mv.torrents ?? []) {
      if (!t.hash || !/^[0-9a-f]{40}$/i.test(t.hash)) continue;
      out.push({
        id: t.hash.toLowerCase(),
        releaseName: `${mv.title ?? "Movie"} ${mv.year ?? ""} ${t.quality ?? ""} YTS`.replace(/\s+/g, " ").trim(),
        seeders: t.seeds ?? 0,
        peers: t.peers ?? 0,
        sizeBytes: parseSizeBytes(t.size),
        provider: "YTS",
        quality: t.quality ?? detectQuality(`${t.size}`),
        fileIdx: null,
        match: "verified",
        score: 0,
      });
    }
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

/**
 * IMDb-keyed per episode. The API rows carry season/episode metadata and
 * ignore the season/episode query params, so we scan a couple of recency
 * pages; the filename is cross-checked so a mislabeled row can't leak wrong
 * episodes into same-named shows.
 */
async function providerEztv(
  imdbId: string,
  season: number,
  episode: number
): Promise<TorrentSource[]> {
  const out: TorrentSource[] = [];
  const numericId = imdbId.replace(/^tt/i, "");
  for (let page = 1; page <= 2 && out.length < 8; page++) {
    const data = await fetchJson<{ torrents?: EztvTorrent[] }>(
      `https://eztvx.to/api/get-torrents?imdb_id=${numericId}&limit=100&page=${page}`,
      7000
    );
    const rows = data?.torrents ?? [];
    for (const r of rows) {
      if (!r.hash || !/^[0-9a-f]{40}$/i.test(r.hash)) continue;
      if (r.season && season && r.season !== season) continue;
      if (r.episode && episode && r.episode !== episode) continue;
      const filename = (r.filename ?? "Episode").trim();
      const p = parseRelease(filename);
      const wrongEpisode =
        (p.season !== null && p.season !== season) ||
        (p.episode !== null && p.episode !== episode);
      if (wrongEpisode) continue;
      out.push({
        id: r.hash.toLowerCase(),
        releaseName: filename,
        seeders: r.seeds ?? 0,
        peers: r.peers ?? 0,
        sizeBytes: r.size_bytes ?? 0,
        provider: "EZTV",
        quality: detectQuality(filename),
        fileIdx: null,
        match: "verified",
        score: 0,
      });
      if (out.length >= 8) break;
    }
    if (rows.length < 100) break; // no more pages for this show
  }
  return out;
}

/* ---------- scoring ---------- */

export function scoreTorrent(t: TorrentSource): number {
  let s = Math.min(Math.log10(t.seeders + 1) * 4, 13);
  if (t.quality === "1080p") s += 5;
  else if (t.quality === "720p") s += 4;
  else if (t.quality === "2160p") s += 2;
  else if (t.quality === "480p") s += 1;
  const n = t.releaseName.toLowerCase();
  if (/x265|h\.?265|hevc/.test(n)) s -= 4; // HEVC support is spotty in browsers
  if (/av1/.test(n)) s += 1;
  if (/x264|h\.?264|xvid/.test(n)) s += 2;
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

function merge(sources: TorrentSource[]): TorrentSource[] {
  const best = new Map<string, TorrentSource>();
  for (const t of sources) {
    const prev = best.get(t.id);
    if (!prev || t.seeders > prev.seeders) best.set(t.id, t);
  }
  const list = [...best.values()];
  for (const t of list) {
    t.score =
      Math.round((scoreTorrent(t) + MATCH_RANK[t.match] + (t.countryPenalty ?? 0)) * 10) / 10;
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

  const jobs: Promise<TorrentSource[]>[] = [];
  if (matchTitle) {
    const bayCtx: BayContext = {
      title: matchTitle,
      originalTitle: meta.originalTitle ?? undefined,
      year: year || undefined,
      countries: meta.countries,
      season,
      episode,
      airDate,
      showLang,
    };
    jobs.push(providerPirateBay(type, bayCtx));
    jobs.push(providerBitSearch(type, bayCtx));
  }
  if (imdbId) {
    jobs.push(providerTorrentio(type, imdbId, season, episode, year));
    if (type === "movie") jobs.push(providerYts(imdbId, year));
    else jobs.push(providerEztv(imdbId, season, episode));
  }

  const settled = await Promise.allSettled(jobs);
  const all: TorrentSource[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);
  return merge(all);
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
      : `https://torrentio.strem.fun/stream/series/${imdbId}/${season}/${episode}.json`,
    8000
  );
  const n = (data?.streams ?? []).length;
  availCache.set(key, { n, ts: Date.now() });
  return n;
}
