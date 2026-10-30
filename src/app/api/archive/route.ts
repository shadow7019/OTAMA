import { NextRequest, NextResponse } from "next/server";

/**
 * CineX Direct — public-domain direct-stream finder.
 *
 * Looks a title up on the Internet Archive and returns a DIRECT video file URL
 * (mp4 over HTTPS) so the player can use a native HTML5 <video> element with
 * zero third-party embeds and zero ads.
 *
 * Legality gate (strict, on purpose): an item is only eligible when it carries
 * an explicit public-domain / Creative-Commons license URL, or it was published
 * before 1931 (unambiguously US public domain). Everything else is rejected.
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
}

/* ---------- tiny TTL cache so repeat opens are instant ---------- */

const cache = new Map<string, { at: number; value: ArchiveMatch | null }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h
const MAX_CACHE = 200;

function cacheGet(key: string): ArchiveMatch | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key: string, value: ArchiveMatch | null) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
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

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "CineX/1.0 (public-domain lookup)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`archive ${res.status}`);
  return (await res.json()) as T;
}

/* ---------- route ---------- */

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim();
  const yearRaw = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  const year = Number.isFinite(yearRaw) && yearRaw > 1800 ? yearRaw : null;

  if (title.length < 2) {
    return NextResponse.json({ match: null, reason: "title too short" });
  }

  const key = `${title.toLowerCase()}|${year ?? "-"}`;
  const cached = cacheGet(key);
  if (cached !== undefined) {
    return NextResponse.json(
      { match: cached },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  }

  try {
    const words = keywords(title);
    const q = `title:("${title.replace(/"/g, "")}") AND mediatype:(movies)`;
    const searchUrl =
      "https://archive.org/advancedsearch.php?q=" +
      encodeURIComponent(q) +
      "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=licenseurl&fl%5B%5D=downloads" +
      "&sort%5B%5D=downloads+desc&rows=25&page=1&output=json";

    const data = await fetchJson<{ response?: { docs?: ArchiveDoc[] } }>(searchUrl);
    const docs = (data.response?.docs ?? [])
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
        const match: ArchiveMatch = {
          identifier: doc.identifier,
          title: asString(doc.title) || title,
          year: parseInt(asString(doc.year), 10) || null,
          creator: cleanHtml(asString(meta.metadata?.creator ?? "")),
          description: cleanHtml(asString(meta.metadata?.description ?? "")).slice(0, 220),
          license: asString(doc.licenseurl) || "Public domain (pre-1931 publication)",
          fileUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(video.name)}`,
          fileSize: video.size,
        };
        cacheSet(key, match);
        return NextResponse.json(
          { match },
          { headers: { "Cache-Control": "public, max-age=600" } }
        );
      } catch {
        continue; // metadata fetch failed — try the next candidate
      }
    }

    cacheSet(key, null);
    return NextResponse.json(
      { match: null },
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
