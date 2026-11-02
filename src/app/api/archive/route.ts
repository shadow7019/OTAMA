import { NextRequest, NextResponse } from "next/server";
import { matchTv, parseRelease } from "@/lib/torrent-match";
import { getEpisodeAirDate, LANG_WORD } from "@/lib/torrent-sources";
import { getTitleMeta } from "@/lib/tmdb-server";

/**
 * Popcorn Direct — direct-stream finder on archive.org.
 *
 * Two modes:
 *
 * 1. Movies (?title=&year=) — public-domain / Creative-Commons copies only
 *    (strict legality gate on purpose). Returns a DIRECT video file URL
 *    (mp4 over HTTPS) so the player can use a native HTML5 <video> element
 *    with zero third-party embeds and zero ads.
 *
 * 2. TV episodes (?type=tv&id=&season=&episode=&title=) — episode lookup on
 *    the public archive.org index, the same class of public search as the
 *    torrent providers. Indian daily shows (Bigg Boss…) are uploaded there
 *    within hours of broadcast with the episode number / broadcast date in
 *    the item title, while public torrent trackers stay empty for them.
 *    Every candidate title is validated with the SAME strict matcher as the
 *    torrent pipeline (season/episode/air-date + language), so wrong
 *    episodes or other language versions can never slip through.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "in", "on", "at", "to", "for", "le", "la", "les",
]);

interface ArchiveDoc {
  identifier: string;
  title?: string | string[];
  year?: string | number;
  licenseurl?: string | string[];
  downloads?: number;
}

interface ArchiveFile {
  name: string;
  format?: string;
  size?: string;
}

interface ArchiveMetadata {
  metadata?: Record<string, unknown>;
  files?: ArchiveFile[];
}

export interface ArchiveMatch {
  identifier: string;
  title: string;
  year: number | null;
  creator: string;
  description: string;
  license: string;
  fileUrl: string;
  fileSize: number;
  /** which lookup produced this match (drives the player badge text) */
  kind: "movie" | "tv";
}

/* ---------- tiny TTL cache so repeat opens are instant ---------- */

interface CacheValue {
  at: number;
  value: ArchiveMatch | null;
  /** movies are stable; episodes must re-check so brand-new uploads appear */
  ttl: number;
}

const cache = new Map<string, CacheValue>();
const MOVIE_TTL = 60 * 60 * 1000; // 1h
const EPISODE_TTL = 30 * 60 * 1000; // 30 min — new episodes upload daily
const EPISODE_NULL_TTL = 10 * 60 * 1000; // retry misses quickly
const MAX_CACHE = 300;

function cacheGet(key: string): ArchiveMatch | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: ArchiveMatch | null, ttl: number) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value, ttl });
}

/* ---------- helpers ---------- */

const asString = (v: unknown): string =>
  Array.isArray(v) ? String(v[0] ?? "") : v == null ? "" : String(v);

function cleanHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function licenseOk(doc: ArchiveDoc): boolean {
  const lic = asString(doc.licenseurl).toLowerCase();
  if (lic.includes("publicdomain") || lic.includes("creativecommons")) return true;
  const year = parseInt(asString(doc.year), 10);
  return Number.isFinite(year) && year > 0 && year < 1931;
}

function titleMatches(doc: ArchiveDoc, query: string, words: string[]): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(asString(doc.title));
  const q = norm(query);
  if (!t || !q) return false;
  const tWords = t.split(" ").length;
  const qWords = q.split(" ").length;
  // the item title must not be wildly longer than the query —
  // blocks "Fraud in the Inception, Who Killed…" matching a query for "Inception"
  if (tWords > qWords + 4) return false;
  // strong: the full title appears as a phrase inside the item title
  // (covers "Night of the Living Dead (1968)" etc.)
  if (t.includes(q)) return true;
  // weak: every significant word present
  return words.length > 0 && words.every((w) => t.includes(w));
}

function pickVideoFile(files: ArchiveFile[]): { name: string; size: number } | null {
  const vids = files.filter(
    (f) => /\.mp4$/i.test(f.name) || (f.format ?? "").toLowerCase().includes("h.264")
  );
  if (!vids.length) return null;
  const score = (f: ArchiveFile) => {
    const fmt = (f.format ?? "").toLowerCase();
    const size = parseInt(f.size ?? "0", 10) || 0;
    let s = 0;
    if (fmt.includes("h.264")) s += 2; // browser-friendly derivative preferred
    if (size > 40 * 1024 * 1024) s += 1; // avoid tiny thumbnails/slideshows
    if (size > 3 * 1024 * 1024 * 1024) s -= 2; // avoid giant remuxes
    return s * 1e12 + size; // format tier first, then quality
  };
  const best = vids.sort((a, b) => score(b) - score(a))[0];
  return { name: best.name, size: parseInt(best.size ?? "0", 10) || 0 };
}

/** Episode uploads also come as mkv/avi — playable, ranked below mp4. */
function pickEpisodeFile(files: ArchiveFile[]): { name: string; size: number } | null {
  const tiers = [/\.mp4$/i, /\.m4v$/i, /\.mkv$/i, /\.avi$/i];
  for (const re of tiers) {
    const vids = files.filter((f) => re.test(f.name));
    if (!vids.length) continue;
    const best = vids.sort(
      (a, b) => (parseInt(b.size ?? "0", 10) || 0) - (parseInt(a.size ?? "0", 10) || 0)
    )[0];
    const size = parseInt(best.size ?? "0", 10) || 0;
    if (size > 15 * 1024 * 1024) return { name: best.name, size }; // skip previews
  }
  return null;
}

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "PopcornTime/1.0 (public-domain lookup)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`archive ${res.status}`);
  return (await res.json()) as T;
}

async function searchArchive(q: string, rows: number): Promise<ArchiveDoc[]> {
  const searchUrl =
    "https://archive.org/advancedsearch.php?q=" +
    encodeURIComponent(q) +
    "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=licenseurl&fl%5B%5D=downloads" +
    `&sort%5B%5D=downloads+desc&rows=${rows}&page=1&output=json`;
  try {
    const data = await fetchJson<{ response?: { docs?: ArchiveDoc[] } }>(searchUrl);
    return data.response?.docs ?? [];
  } catch {
    return [];
  }
}

function buildMatch(
  doc: ArchiveDoc,
  video: { name: string; size: number },
  meta: ArchiveMetadata,
  kind: "movie" | "tv",
  fallbackTitle: string
): ArchiveMatch {
  return {
    identifier: doc.identifier,
    title: asString(doc.title) || fallbackTitle,
    year: parseInt(asString(doc.year), 10) || null,
    creator: cleanHtml(asString(meta.metadata?.creator ?? "")),
    description: cleanHtml(asString(meta.metadata?.description ?? "")).slice(0, 220),
    license:
      asString(doc.licenseurl) ||
      (kind === "tv" ? "Direct stream (archive.org)" : "Public domain (pre-1931 publication)"),
    fileUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(video.name)}`,
    fileSize: video.size,
    kind,
  };
}

const MONTHS_FULL = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 10] ?? "th"}`;
}

/* ---------- TV episode lookup ---------- */

async function findEpisode(
  id: number,
  season: number,
  episode: number,
  clientTitle: string
): Promise<ArchiveMatch | null> {
  const key = `tv|${id}|${season}|${episode}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const [meta, airDate] = await Promise.all([
    getTitleMeta("tv", id),
    getEpisodeAirDate(id, season, episode),
  ]);
  const title = clientTitle || "Untitled";
  const showLang = meta.originalLanguage ? LANG_WORD[meta.originalLanguage] ?? null : null;
  // match against the base title — the language word moves into release tags
  const baseTitle =
    showLang && new RegExp(`\\s+${showLang}$`, "i").test(title)
      ? title.replace(new RegExp(`\\s+${showLang}$`, "i"), "").trim()
      : title;

  // candidate item-title queries, most specific first (run in parallel —
  // archive.org answers in 1-3 s each):
  //   "Bigg Boss" "episode 55"
  //   "Bigg Boss 20" "episode 55"   (title carries the season, Bigg-Boss style)
  //   "Bigg Boss" "30th october 2026" / "30 october 2026"  (dated daily shows)
  const ymd = airDate ? airDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const datePhrases: string[] = [];
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    const month = MONTHS_FULL[mo - 1];
    if (month) {
      datePhrases.push(`title:("${baseTitle}" "${ordinal(d)} ${month} ${y}")`);
      datePhrases.push(`title:("${baseTitle}" "${d} ${month} ${y}")`);
    }
  }
  const queries = [
    `title:("${baseTitle}" "episode ${episode}")`,
    `title:("${baseTitle} ${season}" "episode ${episode}")`,
    ...datePhrases,
  ];

  const settled = await Promise.all(queries.map((q) => searchArchive(q, 15)));
  const byId = new Map<string, ArchiveDoc>();
  for (const docs of settled) {
    for (const d of docs) {
      if (!byId.has(d.identifier)) byId.set(d.identifier, d);
    }
  }

  // strict validation — same matcher as the torrent pipeline
  const ranked: { doc: ArchiveDoc; rank: number }[] = [];
  for (const doc of byId.values()) {
    const rawTitle = asString(doc.title);
    if (!rawTitle) continue;
    const p = parseRelease(rawTitle);
    const match = matchTv(p, season, episode, baseTitle, meta.originalTitle ?? undefined, {
      airDate,
      showLang,
    });
    if (!match) continue;
    ranked.push({ doc, rank: match === "verified" ? (p.date ? 2 : 1) : 0 });
  }
  ranked.sort(
    (a, b) => b.rank - a.rank || (b.doc.downloads ?? 0) - (a.doc.downloads ?? 0)
  );

  for (const { doc } of ranked.slice(0, 4)) {
    try {
      const itemMeta = await fetchJson<ArchiveMetadata>(
        `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`
      );
      const video = pickEpisodeFile(itemMeta.files ?? []);
      if (!video) continue;
      const match = buildMatch(doc, video, itemMeta, "tv", title);
      cacheSet(key, match, EPISODE_TTL);
      return match;
    } catch {
      continue; // metadata fetch failed — try the next candidate
    }
  }

  cacheSet(key, null, EPISODE_NULL_TTL);
  return null;
}

/* ---------- movie lookup (public-domain gate, unchanged) ---------- */

async function findMovie(title: string, year: number | null): Promise<ArchiveMatch | null> {
  const key = `mv|${title.toLowerCase()}|${year ?? "-"}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const words = keywords(title);
  const q = `title:("${title.replace(/"/g, "")}") AND mediatype:(movies)`;
  const docs = (await searchArchive(q, 25))
    .filter((d) => licenseOk(d) && titleMatches(d, title, words))
    .sort((a, b) => {
      // prefer releases closest to the TMDB year, then popularity
      const ya = parseInt(asString(a.year), 10) || 0;
      const yb = parseInt(asString(b.year), 10) || 0;
      if (year) {
        const da = ya ? Math.abs(ya - year) : 99;
        const db = yb ? Math.abs(yb - year) : 99;
        if (da !== db) return da - db;
      }
      return (b.downloads ?? 0) - (a.downloads ?? 0);
    })
    .slice(0, 4);

  for (const doc of docs) {
    try {
      const meta = await fetchJson<ArchiveMetadata>(
        `https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`
      );
      const files = meta.files ?? [];
      const video = pickVideoFile(files);
      if (!video) continue;
      const match = buildMatch(doc, video, meta, "movie", title);
      cacheSet(key, match, MOVIE_TTL);
      return match;
    } catch {
      continue; // metadata fetch failed — try the next candidate
    }
  }

  cacheSet(key, null, MOVIE_TTL);
  return null;
}

/* ---------- route ---------- */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // TV episode mode
  if (sp.get("type") === "tv") {
    const id = Number(sp.get("id"));
    const season = Number(sp.get("season"));
    const episode = Number(sp.get("episode"));
    if (!id || !Number.isFinite(id) || !season || !episode) {
      return NextResponse.json({ match: null, reason: "missing id/season/episode" });
    }
    try {
      const match = await findEpisode(id, season, episode, (sp.get("title") ?? "").trim());
      return NextResponse.json(
        { match },
        { headers: { "Cache-Control": match ? "public, max-age=600" : "no-store" } }
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "archive lookup failed";
      return NextResponse.json(
        { match: null, reason: detail },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // movie mode
  const title = (sp.get("title") ?? "").trim();
  const yearRaw = parseInt(sp.get("year") ?? "", 10);
  const year = Number.isFinite(yearRaw) && yearRaw > 1800 ? yearRaw : null;

  if (title.length < 2) {
    return NextResponse.json({ match: null, reason: "title too short" });
  }

  try {
    const match = await findMovie(title, year);
    return NextResponse.json(
      { match },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "archive lookup failed";
    return NextResponse.json(
      { match: null, reason: detail },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
