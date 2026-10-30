/**
 * Release-name parsing and strict content matching.
 *
 * Fixes "content mixing" between different movies / series that share a name:
 *  - "The Office US S02E04" must never answer a request for the UK series
 *  - "It Chapter Two 2019" must never answer a request for "It" (2017)
 *  - "Us And Them" must never answer a request for "Us" (2019)
 *  - a season pack must never play episode 5 when episode 2 was requested
 *
 * Torrent names follow loose scene conventions:
 *   Title.Country.Year.SOURCE.Resolution.Codec-Group   (movies)
 *   Title.S01E04.Title.SOURCE.Resolution-Group          (episodes)
 *   Title.S02.Complete.720p                             (season packs)
 */

export type MatchClass = "verified" | "pack" | "weak";

export interface ParsedRelease {
  /** release year found in the name, if any */
  year: number | null;
  /** season number found in the name (S02E04, 2x04, S02, "Season 2") */
  season: number | null;
  /** episode number found in the name */
  episode: number | null;
  /** "Season 1-6" style multi-season pack */
  seasonRange: [number, number] | null;
  /** season/complete-series pack with no explicit episode */
  isSeasonPack: boolean;
  /** explicit country tag in the title area (US / UK) */
  country: string | null;
  /** leading tokens of the name that belong to the title */
  titleTokens: string[];
}

const STOPWORDS = new Set([
  "the", "and", "of", "a", "an", "in", "on", "at", "to", "for", "with",
  "its", "is",
]);

/** tokens that may legitimately trail a title inside a release name */
const TITLE_EXTRA_OK = new Set([
  "part", "chapter", "episode", "ep", "ova", "special", "premiere", "finale",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii",
]);

/** words that mark the end of the title section of a release name */
const TECH_TOKEN =
  /^(480p|480i|576p|720p|720i|1080p|1080i|2160p|4k|uhd|web|webdl|webrip|web[-.]?dl|nf|amzn|dsnp|hulu|atvp|bluray|blu[-.]?ray|bd|bdrip|brrip|hddvd|dvd|dvdrip|dvdscr|hdrip|hdtv|pdtv|cam|camrip|ts|telesync|screener|hdts|xvid|x264|h264|h\.264|h265|h\.265|x265|hevc|av1|aac|ac3|eac3|ddp|dd5|dts|dtshd|truehd|atmos|flac|mp3|10bit|8bit|hdr|hdr10|dolby|vision|dv|dovi|remux|hybrid|proper|repack|extended|remastered|unrated|uncut|internal|limited|dual|multi|subs|hc|gain|sync|cour|yify|yts|rarbg|ettv|eztv|fgt|galaxytv|byte|psa|rift|sva|avigation)$/i;

export function releaseTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[''’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const YEAR_RE = /^(19|20)\d{2}$/;
const SE_TOKEN = /^s(\d{1,2})e(\d{1,3})$/i;
const SX_TOKEN = /^(\d{1,2})x(\d{1,3})$/i;
const S_ONLY_TOKEN = /^s(\d{1,2})$/i;
const EP_ONLY_TOKEN = /^e(?:p)?(\d{1,3})$/i;
const PACK_WORD = /^(season|complete)$/;

/** a token that belongs to the technical tail of a release name */
function isTechy(t: string): boolean {
  return (
    TECH_TOKEN.test(t) ||
    YEAR_RE.test(t) ||
    SE_TOKEN.test(t) ||
    SX_TOKEN.test(t) ||
    S_ONLY_TOKEN.test(t) ||
    PACK_WORD.test(t)
  );
}

export function parseRelease(name: string): ParsedRelease {
  const tks = releaseTokens(name);
  const raw = name.toLowerCase();

  let year: number | null = null;
  let season: number | null = null;
  let episode: number | null = null;
  let seasonRange: [number, number] | null = null;
  let isSeasonPack = false;
  let country: string | null = null;
  let cut = tks.length;

  // release year = the LAST year-like token, unless a year-like word opens the
  // name (movies literally called "1917" / "2012")
  const yearIdxs = tks.reduce<number[]>((acc, t, i) => {
    if (YEAR_RE.test(t)) acc.push(i);
    return acc;
  }, []);
  if (yearIdxs.length) {
    year = Number(tks[yearIdxs[yearIdxs.length - 1]]);
    cut = Math.min(cut, yearIdxs[yearIdxs.length - 1]);
    // a leading year-like token followed by another year is the title itself
    if (yearIdxs.length > 1 && yearIdxs[0] === 0) cut = Math.min(cut, yearIdxs[1]);
  }

  for (let i = 0; i < tks.length; i++) {
    const t = tks[i];
    let m = t.match(SE_TOKEN);
    if (m) {
      season ??= Number(m[1]);
      episode ??= Number(m[2]);
      cut = Math.min(cut, i);
      continue;
    }
    m = t.match(SX_TOKEN);
    if (m) {
      season ??= Number(m[1]);
      episode ??= Number(m[2]);
      cut = Math.min(cut, i);
      continue;
    }
    m = t.match(S_ONLY_TOKEN);
    if (m) {
      isSeasonPack = true;
      season ??= Number(m[1]);
      cut = Math.min(cut, i);
      continue;
    }
    m = t.match(EP_ONLY_TOKEN);
    if (m && season === null && episode === null) {
      episode = Number(m[1]);
      cut = Math.min(cut, i);
      continue;
    }
    if (PACK_WORD.test(t)) {
      const next = tks[i + 1] ?? "";
      // "Season 2" needs the number right after; "Complete" needs a technical
      // tail — otherwise they are title words ("A Complete Unknown")
      if (t === "season" && /^\d{1,2}$/.test(next)) {
        isSeasonPack = true;
        season ??= Number(next);
        cut = Math.min(cut, i);
        continue;
      }
      if (t === "complete" && (i === tks.length - 1 || isTechy(next) || next === "series")) {
        isSeasonPack = true;
        cut = Math.min(cut, i);
        continue;
      }
    }
    // only treat a tech word as the tail when the next token is technical
    // too — "Web.Of.Lies" and "Dvd" titles must keep their name
    if (TECH_TOKEN.test(t) && (i === tks.length - 1 || isTechy(tks[i + 1]))) {
      cut = Math.min(cut, i);
      continue;
    }
  }

  // multi-token patterns on the raw name
  let m = raw.match(/season\s*[._\s-]*(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\b/);
  if (m) {
    seasonRange = [Number(m[1]), Number(m[2])];
    isSeasonPack = true;
  }
  m = raw.match(/season\s*[._\s]*(\d{1,2})\s*(?:episode|ep)\s*[._\s]*(\d{1,3})\b/);
  if (m && season === null) {
    season = Number(m[1]);
    episode = Number(m[2]);
  }
  if (/\bcomplete[._\s]*series\b|\ball[._\s]*seasons\b/.test(raw)) isSeasonPack = true;

  // explicit country tag near the title ("The.Office.US", "Peep.Show.UK")
  for (const tk of tks.slice(0, cut)) {
    if (tk === "us" || tk === "usa") { country = "US"; break; }
    if (tk === "uk" || tk === "gb") { country = "GB"; break; }
  }

  // bare episode number with no season at all ("Show.EP02.720p")
  if (episode === null && season === null) {
    m = raw.match(/\b(?:ep|episode)[._\s]*(\d{1,3})\b/);
    if (m) episode = Number(m[1]);
  }

  return { year, season, episode, seasonRange, isSeasonPack, country, titleTokens: tks.slice(0, cut) };
}

/* ---------------- title comparison ---------------- */

function significantTitleTokens(title: string): string[] {
  return releaseTokens(title).filter(
    (w) => (w.length > 1 || /^\d$/.test(w)) && !STOPWORDS.has(w)
  );
}

/**
 * In-order subsequence match of the expected title inside the release's title
 * tokens. Returns the ratio of matched title words and the indexes consumed.
 */
function titleSubsequence(
  needles: string[],
  haystack: string[]
): { ratio: number; matchedIdx: Set<number> } {
  if (!needles.length) return { ratio: 1, matchedIdx: new Set() };
  const matchedIdx = new Set<number>();
  let idx = -1;
  let hits = 0;
  for (const w of needles) {
    const found = haystack.indexOf(w, idx + 1);
    if (found >= 0) {
      hits += 1;
      idx = found;
      matchedIdx.add(found);
    }
  }
  return { ratio: hits / needles.length, matchedIdx };
}

function bestTitleMatch(p: ParsedRelease, titles: string[]): { ratio: number; unmatched: string[] } {
  let best: { ratio: number; unmatched: string[] } | null = null;
  for (const t of titles) {
    const needles = significantTitleTokens(t);
    // compare against the title area only, stopwords dropped
    const haystack = p.titleTokens.filter((w) => !STOPWORDS.has(w));
    const { ratio, matchedIdx } = titleSubsequence(needles, haystack);
    const unmatched = haystack.filter((_, i) => !matchedIdx.has(i));
    if (!best || ratio > best.ratio || (ratio === best.ratio && unmatched.length < best.unmatched.length)) {
      best = { ratio, unmatched };
    }
    if (ratio === 1 && unmatched.length === 0) break;
  }
  return best ?? { ratio: 0, unmatched: [] };
}

/** unmatched tokens are fine when they are numerals / part markers */
function extrasAllowed(unmatched: string[]): boolean {
  return unmatched.every((w) => TITLE_EXTRA_OK.has(w) || /^\d+$/.test(w));
}

/** TV titles may carry a country tag ("The.Office.US") or part markers */
const TV_EXTRA_OK = new Set(["us", "usa", "uk", "gb", ...TITLE_EXTRA_OK]);

function tvExtrasAllowed(unmatched: string[]): boolean {
  return unmatched.every((w) => TV_EXTRA_OK.has(w) || /^\d+$/.test(w));
}

/**
 * Classify a movie release. Returns null when the release is definitely a
 * different title (wrong year, wrong words) — never playable.
 *  - "verified": title matches and the year matches (±1)
 *  - "weak": title matches exactly but no year to confirm
 */
export function matchMovie(
  p: ParsedRelease,
  title: string,
  originalTitle: string | undefined,
  year: string | undefined
): MatchClass | null {
  const { ratio, unmatched } = bestTitleMatch(p, [title, originalTitle].filter(Boolean) as string[]);
  if (ratio < 0.75) return null;
  const want = year ? Number(year) : null;
  if (p.year !== null && want !== null) {
    if (Math.abs(p.year - want) > 1) return null; // same name, different film
    return extrasAllowed(unmatched) ? "verified" : null;
  }
  if (p.year !== null) return "weak"; // release has a year, TMDB year unknown
  // no year in the name: accept only a clean title with no trailing words
  return ratio >= 0.99 && unmatched.length === 0 ? "weak" : null;
}

/**
 * Classify a TV release for a specific season/episode.
 *  - "verified": name carries the exact SxxEyy requested
 *  - "pack": season pack / complete series that contains the episode
 *            (the stream route then picks the right file inside the pack)
 *  - null: a different episode/season of the same-named show — reject
 */
export function matchTv(
  p: ParsedRelease,
  season: number,
  episode: number,
  title: string,
  originalTitle: string | undefined
): MatchClass | null {
  const { ratio, unmatched } = bestTitleMatch(p, [title, originalTitle].filter(Boolean) as string[]);
  if (ratio < 0.75) return null;
  // extra title words beyond a country/part tag mean a different show
  // ("Office Incubation" is not "The Office", but "The Office US" is)
  if (!tvExtrasAllowed(unmatched)) return null;

  if (p.season !== null && p.episode !== null) {
    return p.season === season && p.episode === episode ? "verified" : null;
  }
  if (p.episode !== null) {
    // episode number without a season — only trust it for season 1
    return season === 1 && p.episode === episode ? "verified" : null;
  }
  if (p.isSeasonPack) {
    if (p.seasonRange) {
      return season >= p.seasonRange[0] && season <= p.seasonRange[1] ? "pack" : null;
    }
    if (p.season !== null && p.season !== season) return null;
    return "pack";
  }
  return null;
}

/** Penalty for TV releases tagged with a country the show isn't from. */
export function countryPenalty(p: ParsedRelease, originCountries: string[]): number {
  if (!p.country || !originCountries.length) return 0;
  const has = originCountries.some((c) => {
    const cc = c.toUpperCase();
    if (p.country === "US") return cc === "US";
    if (p.country === "GB") return cc === "GB" || cc === "UK";
    return cc === p.country;
  });
  return has ? 0 : -8;
}
