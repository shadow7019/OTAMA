export type MediaType = "movie" | "tv";

export interface MediaItem {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  popularity?: number;
  adult?: boolean;
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
  order?: number;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  published_at?: string;
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date?: string | null;
  poster_path?: string | null;
  overview?: string;
}

export interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date?: string | null;
  still_path?: string | null;
  overview?: string;
  runtime?: number | null;
}

export interface PagedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface MediaDetails extends MediaItem {
  tagline?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  genres?: Genre[];
  status?: string;
  homepage?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  credits?: { cast: CastMember[]; crew: unknown[] };
  videos?: { results: Video[] };
  similar?: { results: MediaItem[] };
  recommendations?: { results: MediaItem[] };
  seasons?: Season[];
  production_companies?: { id: number; name: string; logo_path: string | null }[];
}

export interface ListEntry {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  season?: number;
  episode?: number;
  addedAt: number;
}

/* ---------- helpers ---------- */

export function getTitle(item: MediaItem): string {
  return item.title || item.name || item.original_title || item.original_name || "Untitled";
}

export function getYear(item: MediaItem): string {
  const d = item.release_date || item.first_air_date;
  return d ? d.slice(0, 4) : "";
}

export function getDate(item: MediaItem): string {
  return item.release_date || item.first_air_date || "";
}

export function getMediaType(item: MediaItem): MediaType {
  return item.media_type === "tv" ? "tv" : "movie";
}

export function img(
  path?: string | null,
  size: "w200" | "w300" | "w500" | "w780" | "w1280" | "original" = "w500"
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function ratingColor(vote?: number): string {
  if (!vote) return "text-zinc-400";
  if (vote >= 7.5) return "text-emerald-400";
  if (vote >= 6) return "text-amber-400";
  return "text-red-400";
}

export function formatRuntime(min?: number | null): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatDate(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

/* ---------- fetch helper (goes through our cached proxy) ---------- */

export class TmdbError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function tmdb<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  signal?: AbortSignal
): Promise<T> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`/api/tmdb/${path}${suffix}`, { signal });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new TmdbError(detail, res.status);
  }
  return (await res.json()) as T;
}

export function trailerOf(details: MediaDetails): Video | null {
  const vids = details.videos?.results?.filter((v) => v.site === "YouTube") ?? [];
  return (
    vids.find((v) => v.type === "Trailer" && v.official) ??
    vids.find((v) => v.type === "Trailer") ??
    vids.find((v) => v.type === "Teaser") ??
    vids[0] ??
    null
  );
}

export function toListEntry(item: MediaItem, s?: number, e?: number): ListEntry {
  return {
    id: item.id,
    media_type: getMediaType(item),
    title: getTitle(item),
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    vote_average: item.vote_average ?? 0,
    release_date: getDate(item),
    season: s,
    episode: e,
    addedAt: Date.now(),
  };
}

/**
 * Streaming architecture (ad-free by design):
 *  - Torrent servers: the app searches public torrent indexes server-side
 *    (ThePirateBay / Torrentio / YTS / EZTV), downloads on our own Node
 *    backend via webtorrent and streams to the native <video> element with
 *    HTTP Range requests. No third-party iframe is ever embedded, so no
 *    pop-ups, tab redirects or injected ad scripts.
 *  - CineX Direct: public-domain direct streams (archive.org) as fallback.
 */
