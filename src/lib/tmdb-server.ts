/**
 * Server-side TMDB helpers (never imported from client components).
 * Uses the v4 Bearer token directly — the key never reaches the browser.
 */
const BEARER =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiM2UxZjE4OTNjNTcwYjVkMDcyYmJiMThlNGMyN2MzMiIsIm5iZiI6MTc3OTA0Njk4NS4zNDcwMDAxLCJzdWIiOiI2YTBhMWE0OWE4YmJiZDViNzA2ZGE0NjMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.tteACAyP_yobcSh4Z6sG4ePbP14kIzzEaRdGC8z3n8U";
const BASE = "https://api.themoviedb.org/3";

export async function tmdbServer<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 12000
): Promise<T> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${BASE}/${path}${suffix}`, {
    headers: { Authorization: `Bearer ${BEARER}`, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const imdbCache = new Map<string, { id: string | null; ts: number }>();
const IMDB_TTL = 24 * 60 * 60 * 1000;

/** Resolve the IMDB id for a TMDB title (cached for a day). */
export async function getImdbId(
  type: "movie" | "tv",
  tmdbId: number
): Promise<string | null> {
  const key = `${type}:${tmdbId}`;
  const hit = imdbCache.get(key);
  if (hit && Date.now() - hit.ts < IMDB_TTL) return hit.id;
  try {
    const data = await tmdbServer<{ imdb_id: string | null }>(
      `${type}/${tmdbId}/external_ids`
    );
    imdbCache.set(key, { id: data.imdb_id ?? null, ts: Date.now() });
    return data.imdb_id ?? null;
  } catch {
    imdbCache.set(key, { id: null, ts: Date.now() });
    return null;
  }
}

/* ---------- title metadata for torrent disambiguation ---------- */

export interface TitleMeta {
  /** alternative title to accept in release names (original language) */
  originalTitle: string | null;
  /** first-air / release year from TMDB */
  year: string | null;
  /** TV only — countries of origin, used to tell "The Office US" from UK */
  countries: string[];
}

const metaCache = new Map<string, { meta: TitleMeta; ts: number }>();
const META_TTL = 24 * 60 * 60 * 1000;

/**
 * Extra metadata that lets the torrent matcher tell same-named titles apart
 * (original title, canonical year, country of origin). Cached for a day.
 */
export async function getTitleMeta(
  type: "movie" | "tv",
  tmdbId: number
): Promise<TitleMeta> {
  const key = `${type}:${tmdbId}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.ts < META_TTL) return hit.meta;
  const fallback: TitleMeta = { originalTitle: null, year: null, countries: [] };
  try {
    const data = await tmdbServer<{
      original_title?: string;
      original_name?: string;
      release_date?: string;
      first_air_date?: string;
      origin_country?: string[];
    }>(`${type}/${tmdbId}`);
    const meta: TitleMeta = {
      originalTitle: data.original_title ?? data.original_name ?? null,
      year: (data.release_date ?? data.first_air_date ?? "").slice(0, 4) || null,
      countries: data.origin_country ?? [],
    };
    metaCache.set(key, { meta, ts: Date.now() });
    return meta;
  } catch {
    metaCache.set(key, { meta: fallback, ts: Date.now() });
    return fallback;
  }
}
