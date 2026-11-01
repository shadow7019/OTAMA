/**
 * Subtitle backend — fetches community subtitles from the keyless Stremio
 * OpenSubtitles v3 addon (https://opensubtitles-v3.strem.io) and serves them
 * to the native <video> element as WebVTT tracks.
 *
 * The addon answers `GET /subtitles/{movie|series}/{tt-id}[:{s}:{e}].json`
 * with entries whose download URLs serve SubRip (.srt, UTF-8) content. Browsers
 * only render VTT, so the file proxy converts SRT → VTT on the way through.
 */

const ADDON = "https://opensubtitles-v3.strem.io";

/** one downloadable subtitle track, already pointed at our VTT proxy */
export interface SubtitleEntry {
  id: string;
  /** ISO-639-2/3 code from the addon ("eng", "por", "jpn"…) */
  lang: string;
  /** display name ("English", "Portuguese (Brazil)"…) */
  langName: string;
  /** our /api/subtitles/file proxy URL — same-origin VTT for <track src> */
  src: string;
  /** original file/release name, useful for debugging sync */
  fileName: string;
}

interface AddonSubtitle {
  id?: string | number;
  url?: string;
  lang?: string;
  subtitleFileName?: string;
  movieReleaseName?: string;
}

/** codes Intl.DisplayNames doesn't resolve — human labels instead */
const LANG_FALLBACK: Record<string, string> = {
  pob: "Portuguese (Brazil)",
  pb: "Portuguese (Brazil)",
  cmn: "Mandarin Chinese",
  zhe: "Chinese",
  yue: "Cantonese",
  zht: "Chinese (Traditional)",
  zhs: "Chinese (Simplified)",
  ptbr: "Portuguese (Brazil)",
  es419: "Spanish (Latin America)",
  fre: "French",
  ger: "German",
  per: "Persian",
  bur: "Burmese",
  may: "Malay",
  ces: "Czech",
  cze: "Czech",
  rum: "Romanian",
  slo: "Slovak",
  srp: "Serbian",
  hrv: "Croatian",
  alb: "Albanian",
  arm: "Armenian",
  geo: "Georgian",
  mac: "Macedonian",
};

let displayNames: Intl.DisplayNames | null = null;
function langLabel(code: string): string {
  const known = LANG_FALLBACK[code.toLowerCase()];
  if (known) return known;
  try {
    displayNames ??= new Intl.DisplayNames(["en"], { type: "language" });
    return displayNames.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** only proxy downloads from the addon's own hosts — never an open proxy */
function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /\.strem\.io$/.test(u.hostname);
  } catch {
    return false;
  }
}

const listCache = new Map<string, { entries: SubtitleEntry[]; ts: number; ttl: number }>();
const LIST_TTL = 6 * 60 * 60 * 1000;
/** empty answers expire fast — subtitle coverage grows, and a transient
 *  addon failure must not stick for hours */
const EMPTY_TTL = 10 * 60 * 1000;
const MAX_CACHE = 400;

/**
 * Subtitles for one title/episode, one best entry per language, English
 * first. Empty array when the title has no subtitles (or no IMDb id).
 */
export async function getSubtitles(
  type: "movie" | "tv",
  imdbId: string,
  season: number,
  episode: number
): Promise<SubtitleEntry[]> {
  const key = `${type}:${imdbId}:${type === "tv" ? `${season}:${episode}` : "m"}`;
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.ts < hit.ttl) return hit.entries;

  const path =
    type === "movie"
      ? `subtitles/movie/${imdbId}.json`
      : `subtitles/series/${imdbId}:${season}:${episode}.json`;
  let rows: AddonSubtitle[] = [];
  try {
    const res = await fetch(`${ADDON}/${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = (await res.json()) as { subtitles?: AddonSubtitle[] };
      rows = Array.isArray(data.subtitles) ? data.subtitles : [];
    }
  } catch {
    /* addon down — empty list, the player just shows no subtitle options */
  }

  const best = new Map<string, SubtitleEntry>();
  for (const r of rows) {
    if (!r.url || !r.lang || !isAllowedUrl(r.url)) continue;
    const lang = r.lang.toLowerCase();
    if (best.has(lang)) continue; // first hit per language is enough
    best.set(lang, {
      id: String(r.id ?? `${lang}-${best.size}`),
      lang,
      langName: langLabel(lang),
      src: `/api/subtitles/file?u=${encodeURIComponent(r.url)}`,
      fileName: r.subtitleFileName ?? r.movieReleaseName ?? "",
    });
  }
  // English first, then alphabetical — matches where users expect to look
  const entries = [...best.values()].sort((a, b) => {
    if (a.lang === "eng") return -1;
    if (b.lang === "eng") return 1;
    return a.langName.localeCompare(b.langName);
  });

  if (listCache.size > MAX_CACHE) {
    const oldest = listCache.keys().next().value;
    if (oldest) listCache.delete(oldest);
  }
  listCache.set(key, { entries, ts: Date.now(), ttl: entries.length ? LIST_TTL : EMPTY_TTL });
  return entries;
}

/**
 * SRT → WebVTT. Handles the common quirks: BOM, CRLF, ordinal cue numbers,
 * legacy ASS override tags ({\an8}), <font> wrappers. Content already in
 * VTT is passed through untouched.
 */
export function srtToVtt(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (/^WEBVTT/.test(text)) return text;
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        // drop SRT ordinal cue numbers ("1", "2"…) — VTT doesn't need them
        .filter((line, i) => !(i === 0 && /^\d+$/.test(line.trim()) && !line.includes("-->")))
        .join("\n")
        // "00:00:20,000 --> 00:00:24,400" → "00:00:20.000 --> 00:00:24.400"
        .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, "$1.$2")
        .replace(/\{\\[^}]*\}/g, "") // ASS overrides
        .replace(/<\/?font[^>]*>/gi, "")
        .trim()
    )
    .filter(Boolean);
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}
