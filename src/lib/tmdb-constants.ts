// Client-safe TMDB constants and image helpers (no secrets in this file).

export type MediaType = "movie" | "tv";

export const TMDB_IMG = "https://image.tmdb.org/t/p";

export function img(
  path: string | null | undefined,
  size: "w92" | "w154" | "w185" | "w300" | "w342" | "w500" | "w780" | "w1280" | "original"
): string {
  if (!path) return "";
  return `${TMDB_IMG}/${size}${path}`;
}

/** Normalized media item used across the UI. */
export type MediaItem = {
  id: number;
  type: MediaType;
  name: string;
  year: number | null;
  rating: number;
  poster: string; // w342 url or ""
  backdrop: string; // w780 url or ""
  overview: string;
  /** present for public-domain titles that stream in full */
  full?: boolean;
};

export const TMDB_MOVIE_GENRES: { id: number; name: string }[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

export const TMDB_TV_GENRES: { id: number; name: string }[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
];

export function genresFor(kind: MediaType) {
  return kind === "movie" ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES;
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "bn", name: "Bengali" },
];

export const SORTS = [
  { value: "popularity.desc", label: "Trending" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "primary_release_date.desc", label: "Newest" },
  { value: "primary_release_date.asc", label: "Oldest" },
  { value: "revenue.desc", label: "Box Office" },
] as const;

export const DECADES = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s", "1950s"];

export function decadeRange(d: string): { from: number; to: number } {
  const start = Number(d.slice(0, 4));
  return { from: start, to: start + 9 };
}

export function runtimeFmt(mins?: number | null): string {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function mediaId(type: MediaType, id: number | string): string {
  return `${type}-${id}`;
}
