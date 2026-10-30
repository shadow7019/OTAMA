/**
 * Multi-provider torrent search.
 *
 * Providers are tried in parallel and merged — if one is unreachable
 * (Cloudflare, DNS block, rate limit) it is simply skipped and the others
 * still answer. Every result is normalized to a common shape and scored so
 * the player can pick the best server automatically.
 */
import { getImdbId } from "./tmdb-server";

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

/* ---------- providers ---------- */

/**
 * Loose IN-ORDER title match for keyword-based providers (ThePirateBay).
 * "The Bad Guys Breaking In" must NOT match "Breaking Bad" (words appear in
 * the wrong order), while "Breaking.Bad.S01E01" must.
 */
function titleMatches(releaseName: string, title: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = norm(title)
    .split(" ")
    .filter((w) => w.length > 1 && !["the", "and", "of", "a", "an", "in", "on", "at", "to"].includes(w));
  if (!words.length) return true;
  const rn = norm(releaseName);
  let idx = -1;
  let hits = 0;
  for (const w of words) {
    const found = rn.indexOf(w, idx + 1);
    if (found >= 0) {
      hits += 1;
      idx = found;
    }
  }
  return hits / words.length >= 0.6;
}

interface TorrentioStream {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: { filename?: string };
}

async function providerTorrentio(
  type: "movie" | "tv",
  imdbId: string,
  season: number,
  episode: number
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

async function providerPirateBay(
  type: "movie" | "tv",
  title: string,
  year: string,
  season: number,
  episode: number
): Promise<TorrentSource[]> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const queries =
    type === "movie"
      ? [`${title} ${year}`.trim(), title]
      : [`"${title}" s${pad(season)}e${pad(episode)}`, `${title} s${pad(season)}e${pad(episode)}`, `${title} ${season}x${pad(episode)}`];
  const seen = new Map<string, TorrentSource>();
  // apibay answers tiny JSON quickly; sequential keeps request count low
  for (const q of queries) {
    const rows = await fetchJson<ApibayResult[]>(
      `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=`,
      7000
    );
    if (rows && Array.isArray(rows) && rows.length && !("name" in rows[0] && (rows[0] as ApibayResult).name === "No results")) {
      for (const r of rows) {
        if (!r.info_hash || !/^[0-9a-f]{40}$/i.test(r.info_hash)) continue;
        if (!titleMatches(r.name ?? "", title)) continue;
        const key = r.info_hash.toLowerCase();
        if (seen.has(key)) continue;
        seen.set(key, {
          id: key,
          releaseName: (r.name ?? "Torrent").trim(),
          seeders: parseCount(r.seeders),
          peers: parseCount(r.leechers),
          sizeBytes: parseSizeBytes(r.size),
          provider: "ThePirateBay",
          quality: detectQuality(r.name ?? ""),
          fileIdx: null,
          score: 0,
        });
      }
    }
    if (seen.size >= 5) break;
  }
  return [...seen.values()];
}

interface YtsMovie {
  title?: string;
  year?: number;
  torrents?: { hash?: string; quality?: string; size?: string; seeds?: number; peers?: number }[];
}

async function providerYts(imdbId: string, timeoutMs = 7000): Promise<TorrentSource[]> {
  const data = await fetchJson<{ data?: { movies?: YtsMovie[] } }>(
    `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(imdbId)}&limit=5`,
    timeoutMs
  );
  const movies = data?.data?.movies ?? [];
  const out: TorrentSource[] = [];
  for (const mv of movies) {
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

async function providerEztv(
  imdbId: string,
  season: number,
  episode: number
): Promise<TorrentSource[]> {
  const data = await fetchJson<{ torrents?: EztvTorrent[] }>(
    `https://eztvx.to/api/get-torrents?imdb_id=${imdbId.replace(/^tt/i, "")}&limit=25&page=1`,
    7000
  );
  const rows = data?.torrents ?? [];
  const out: TorrentSource[] = [];
  for (const r of rows) {
    if (!r.hash || !/^[0-9a-f]{40}$/i.test(r.hash)) continue;
    if (r.season && season && r.season !== season) continue;
    if (r.episode && episode && r.episode !== episode) continue;
    out.push({
      id: r.hash.toLowerCase(),
      releaseName: (r.filename ?? "Episode").trim(),
      seeders: r.seeds ?? 0,
      peers: r.peers ?? 0,
      sizeBytes: r.size_bytes ?? 0,
      provider: "EZTV",
      quality: detectQuality(r.filename ?? ""),
      fileIdx: null,
      score: 0,
    });
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

function merge(sources: TorrentSource[]): TorrentSource[] {
  const best = new Map<string, TorrentSource>();
  for (const t of sources) {
    const prev = best.get(t.id);
    if (!prev || t.seeders > prev.seeders) best.set(t.id, t);
  }
  const list = [...best.values()];
  for (const t of list) t.score = scoreTorrent(t);
  return list.sort((a, b) => b.score - a.score || b.seeders - a.seeders).slice(0, 14);
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
  const { type, tmdbId, title, year, season, episode } = args;
  const imdbId = await getImdbId(type, tmdbId);

  const jobs: Promise<TorrentSource[]>[] = [providerPirateBay(type, title, year, season, episode)];
  if (imdbId) {
    jobs.push(providerTorrentio(type, imdbId, season, episode));
    if (type === "movie") jobs.push(providerYts(imdbId));
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
