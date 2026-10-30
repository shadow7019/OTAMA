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
