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
  if (item.media_type) return item.media_type;
  // Unstamped catalog items (discover rows, /similar & /recommendation
  // lists): TMDB marks TV entries with name/original_name + first_air_date
  // and movies with title + release_date. Inferring from that shape keeps a
  // TV series from being queried as a movie (movie/30984 → 404 → unplayable).
  if (item.name && !item.title) return "tv";
  if (item.first_air_date && !item.release_date) return "tv";
  return "movie";
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
 *  - Otama Direct: public-domain direct streams (archive.org) as fallback.
 *  - Web embed servers (Ads group): third-party players, ad-supported
 *    by the providers themselves. Used by hand from the amber Ads chips,
 *    and opened automatically when every ad-free server fails.
 */

/**
 * Web embed servers — restored by user request. These third-party players
 * are ad-supported (pop-ups / redirects are THEIR pages, inside their
 * iframe), so they sit AFTER the torrent sources in the server row. They are
 * picked per click, and the first healthy one also takes over automatically
 * when every ad-free server fails. They cost nothing to run, carry virtually
 * every title, and give the player a working source when torrent swarms die.
 */
export interface WebSource {
  id: string;
  name: string;
  movie: (tmdbId: number) => string;
  tv: (tmdbId: number, season: number, episode: number) => string;
}

export const WEB_SOURCES: WebSource[] = [
  {
    id: "vidlink",
    name: "VidLink",
    movie: (id) => `https://vidlink.org/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidlink.org/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidfast",
    name: "VidFast",
    movie: (id) => `https://vidfast.pro/movie/${id}?autoPlay=true`,
    tv: (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true`,
  },
  // verified live (movie+tv endpoints answer 200): ranked right after the
  // two most reliable so the auto-fallback opens something that works
  {
    id: "vidsrc-to",
    name: "VidSrc.to",
    movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc-su",
    name: "VidSrc.su",
    movie: (id) => `https://vidsrc.su/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.su/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "111movies",
    name: "111Movies",
    movie: (id) => `https://111movies.com/movie/${id}`,
    tv: (id, s, e) => `https://111movies.com/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidjoy",
    name: "VidJoy",
    movie: (id) => `https://vidjoy.pro/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidjoy.pro/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc-xyz",
    name: "VidSrc",
    movie: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "videasy",
    name: "Videasy",
    movie: (id) => `https://player.videasy.net/movie/${id}`,
    tv: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    movie: (id) => `https://autoembed.cc/embed/movie/${id}`,
    tv: (id, s, e) => `https://autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "embed-su",
    name: "Embed.su",
    movie: (id) => `https://embed.su/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://embed.su/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: "vidora",
    name: "Vidora",
    movie: (id) => `https://vidora.su/movie/${id}`,
    tv: (id, s, e) => `https://vidora.su/tv/${id}/${s}/${e}`,
  },
  {
    id: "moviesapi",
    name: "MoviesAPI",
    movie: (id) => `https://moviesapi.club/movie/${id}`,
    tv: (id, s, e) => `https://moviesapi.club/tv/${id}/${s}/${e}`,
  },
  {
    id: "spencerdevs",
    name: "Spencer",
    movie: (id) => `https://spencerdevs.xyz/movie/${id}`,
    tv: (id, s, e) => `https://spencerdevs.xyz/tv/${id}/${s}/${e}`,
  },
  {
    id: "2embed",
    name: "2Embed",
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: "multiembed",
    name: "MultiEmbed",
    movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    id: "vidsrc-vip",
    name: "VidSrc VIP",
    movie: (id) => `https://vidsrc.vip/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.vip/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  // verified live from the app host (movie + tv endpoints answer 200, no
  // X-Frame-Options) — added for the user's "more ads server choices" ask
  {
    id: "vidsrc-pm",
    name: "VidSrc.pm",
    movie: (id) => `https://vidsrc.pm/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.pm/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "uembed",
    name: "UEmbed",
    movie: (id) => `https://uembed.site/embed/movie/${id}`,
    tv: (id, s, e) => `https://uembed.site/embed/tv/${id}/${s}/${e}`,
  },
];
