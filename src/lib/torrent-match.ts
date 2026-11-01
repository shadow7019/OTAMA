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
  /** language/version tag in the name (tamil, telugu, hindi…) — Indian shows */
  language: string | null;
  /** calendar date in the name — Indian daily shows label episodes by date */
  date: { day: number; month: number; year: number | null } | null;
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

/** language/version tags used on Indian releases — qualify the show, not retitle it */
export const LANGUAGE_WORDS: Record<string, string> = {
  tamil: "tamil",
  telugu: "telugu",
  hindi: "hindi",
  malayalam: "malayalam",
  kannada: "kannada",
  marathi: "marathi",
  bengali: "bengali",
  bangla: "bengali",
  punjabi: "punjabi",
};

const MONTHS = new Set([
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
]);
const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Words that show up inside dated daily-episode names ("Bigg Boss — Season 4 —
 * Episode 29 — 31 October 2010") without meaning a different show.
 * Month words are date noise, never a show title; "video" is filler used by
 * archive.org episode uploads ("… Video Episode 55 …").
 */
const DATED_EXTRA_OK = new Set([
  ...Object.keys(LANGUAGE_WORDS),
  "day", "days", "premiere", "premier", "finale", "grand", "season", "episode",
  "ep", "telecast", "version", "full", "show", "ceremony", "ceremonial",
  "launch", "lauch", "opening", "video",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
]);

export function releaseTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[''’]/g, "")
    // ordinal day forms ("30th October 2026") → plain numbers so "30th" can
    // never leak into the title area as an unmatched word
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
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

export function parseRelease(input: string): ParsedRelease {
  // Indian release groups prefix the site name to every upload
  // ("www.1TamilBlasters.bz - Bigg Boss (2026) S09E101 …") — drop it so its
  // tokens are not mistaken for title words. Two safe forms only:
  //   1. an explicit "www." host + dash separator (any spacing, long gTLDs ok:
  //      .company / .homes / .rocks …)
  //   2. a bare host with a proper " - " separator (spaces required, so the
  //      "-GROUP" tag of a normal release name can never be eaten)
  // anime fansub convention prefixes a bracketed group tag to every upload
  // ("[SubsPlease] Jujutsu Kaisen - 05 …") — drop it so it is not mistaken
  // for title words, but keep titles that ARE bracketed ("[REC] 2007": what
  // follows must still contain a letter for the strip to be safe)
  const name = input
    .replace(/^\s*\[[^\]]{1,48}\]\s*/, (m0) =>
      // keep "[REC] 2007 …" (real bracketed title) but strip "[SubsPlease] …"
      /^\d/.test(input.slice(m0.length)) ? m0 : ""
    )
    .replace(
      /^\s*www\.[a-z0-9][a-z0-9.\-]{1,48}\.[a-z]{2,12}\s*[-–—]\s*/i,
      ""
    )
    .replace(/^\s*[a-z0-9][a-z0-9.\-]{1,48}\.[a-z]{2,12}\s+-\s+/i, "");
  const tks = releaseTokens(name);
  const raw = name.toLowerCase();

  let year: number | null = null;
  let season: number | null = null;
  let episode: number | null = null;
  let seasonRange: [number, number] | null = null;
  let isSeasonPack = false;
  let country: string | null = null;
  let language: string | null = null;
  let date: { day: number; month: number; year: number | null } | null = null;
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
    if (m && episode === null && (season === null || isSeasonPack)) {
      episode = Number(m[1]);
      // "S10 EP21" (Indian daily-show naming) is an episode of that season,
      // not a season pack — only a bare "S10" stays a pack
      if (season !== null) isSeasonPack = false;
      cut = Math.min(cut, i);
      continue;
    }
    // separated marker: "EP.34" / "Episode 29" / "S14.EP.34" → tokens ep,34
    if ((t === "ep" || t === "episode") && /^\d{1,3}$/.test(tks[i + 1] ?? "") && episode === null) {
      episode = Number(tks[i + 1]);
      if (season !== null) isSeasonPack = false; // "S14.EP.34" is an episode, not a pack
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
  // "Season 1-6 Complete" is a multi-season pack — but "Bigg Boss Season 6
  // -22 Dec 2012" is a DATED DAILY EPISODE: the second number there is a
  // calendar day, not a season bound. Never build a season range from a name
  // that carries a month word (daily shows always label episodes by date),
  // and never from a descending pair.
  let m: RegExpMatchArray | null;
  const hasMonthWord = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(raw);
  if (!hasMonthWord) {
    m = raw.match(/season\s*[._\s-]*(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\b/);
    if (m && Number(m[2]) >= Number(m[1])) {
      seasonRange = [Number(m[1]), Number(m[2])];
      isSeasonPack = true;
    }
  }
  m = raw.match(/season\s*[._\s]*(\d{1,2})\s*(?:episode|ep)\s*[._\s]*(\d{1,3})\b/);
  if (m && episode === null) {
    season ??= Number(m[1]);
    episode = Number(m[2]);
    if (season !== null) isSeasonPack = false;
  }
  if (/\bcomplete[._\s]*series\b|\ball[._\s]*seasons\b/.test(raw)) isSeasonPack = true;

  // dated episodes: "31 October 2010", "2nd Oct 2011", "1st Oct" — Indian daily
  // shows are labelled by broadcast date; the year alone is parsed separately
  m = raw.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s*[._\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[._\s-]*((?:19|20)\d{2})?\b/i
  );
  if (m) {
    const month = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    const day = Number(m[1]);
    if (month !== undefined && day >= 1 && day <= 31) {
      date = { day, month, year: m[3] ? Number(m[3]) : null };
      // keep date words out of the title area when nothing else cut earlier
      const dayIdx = tks.findIndex(
        (tk, i) =>
          Number(tk.replace(/(st|nd|rd|th)$/i, "")) === day &&
          /^\d{1,2}$/.test(tk.replace(/(st|nd|rd|th)$/i, "")) &&
          MONTHS.has((tks[i + 1] ?? "").slice(0, 3))
      );
      if (dayIdx >= 0) cut = Math.min(cut, dayIdx);
    }
  }

  // language/version tag anywhere in the name ("Bigg Boss (2019) Telugu …")
  for (const tk of tks) {
    const lw = LANGUAGE_WORDS[tk];
    if (lw) {
      language = lw;
      break;
    }
  }

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

  return { year, season, episode, seasonRange, isSeasonPack, country, language, date, titleTokens: tks.slice(0, cut) };
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

/** Context that lets the TV matcher verify dated Indian daily-show releases. */
export interface TvMatchCtx {
  /** TMDB air date of the requested episode (YYYY-MM-DD), when known */
  airDate?: string | null;
  /** language of the requested show (tamil, telugu, hindi…) — release tags must agree */
  showLang?: string | null;
  /** broadcast-order episode number (anime): "One Piece - 1085" answers
   *  a TMDB request for a season-21 episode */
  absEpisode?: number | null;
  /** fansub-relative episode for merged sequel seasons: TMDB folds
   *  "Thousand-Year Blood War" into "Bleach" as S02, but fansubs index it as
   *  its own series numbered from 1 ("Sennen Kessen-hen - 45", "TYBW S01E45") */
  relEpisode?: number | null;
  /** torrent upload date (epoch ms) — a sequel episode's fansub is uploaded
   *  within weeks of broadcast, while the base show's old episodes are years
   *  old; the gap is what keeps renumbered releases from mixing */
  pubDate?: number | null;
}

/** A sequel episode's fansub upload lands within weeks of broadcast; the
 *  base show's renumbered episodes surface as re-seeds years later. 45 days
 *  absorbs pre-air fansub leaks and batch re-uploads without opening the
 *  door to old base-show episodes. */
const REL_FRESH_DAYS = 45;

function uploadNearAir(
  pubDate: number | null | undefined,
  air: { y: number; m: number; d: number } | null
): boolean {
  if (!pubDate || !air) return false;
  const airMs = Date.UTC(air.y, air.m - 1, air.d);
  return Math.abs(pubDate - airMs) <= REL_FRESH_DAYS * 86400000;
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

/** day-difference between a release date and the episode's air date.
 *  A year-less date can't be offset — returns Infinity so callers must
 *  treat day+month-only matches explicitly. */
function dayOffset(
  a: { day: number; month: number; year: number | null },
  b: { y: number; m: number; d: number }
): number {
  if (a.year == null) return Number.POSITIVE_INFINITY;
  return Math.abs(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000
  );
}

/**
 * True when a release's broadcast date identifies the requested episode:
 * day+month must equal the air date and a present year must agree within
 * one day (upload/timezone slack). Missing year = day+month only.
 */
function dateMatches(
  a: { day: number; month: number; year: number | null },
  b: { y: number; m: number; d: number }
): boolean {
  if (a.day !== b.d || a.month !== b.m) return false;
  return a.year == null || dayOffset(a, b) <= 1;
}

/**
 * "Bigg Boss 11 — Episode 24" carries the season inside the title: the last
 * title token is the requested season number. Guards same-name numerals
 * ("9-1-1") by requiring a real title word before the numeral.
 */
function titleCarriesSeason(p: ParsedRelease, season: number): boolean {
  const tks = p.titleTokens;
  return (
    tks.length >= 2 &&
    tks[tks.length - 1] === String(season) &&
    /[a-z]/.test(tks[tks.length - 2])
  );
}

/**
 * Title-area tokens of a release that the expected titles did not consume —
 * sequel subtitles ("Sennen Kessen-hen", "Thousand Year Blood War") and
 * remaster tags ("Kai") surface here. Exported for the anime provider's
 * batch-range guard.
 */
export function unmatchedExtras(p: ParsedRelease, titles: (string | undefined)[]): string[] {
  return bestTitleMatch(p, titles.filter(Boolean) as string[]).unmatched;
}

/** release-tag words that trail a title without making it a sequel subtitle */
const RELEASE_TAG_WORDS = new Set([
  "dual", "multi", "dub", "dubs", "dubbed", "dublado", "dublada", "legendado", "leg",
  "sub", "subs", "subbed", "raw", "uncen", "censored",
  "pt", "br", "es", "lat", "en", "eng", "ja", "jp", "jpn", "ita", "ger", "fre", "fr",
  "rus", "esp", "por", "chi", "zho", "kor", "ara", "hin", "tam", "tel", "kan",
  "batch", "complete", "vol", "eps", "episodes", "ep",
  "dl", "cr", "hd", "sd", "mkv", "mp4", "avi", "ogg", "opus", "tv",
]);

/**
 * Sequel-subtitle strength — unmatched title-area words that are neither
 * numerals, tech tokens, nor release tags: "Sennen Kessen-hen" scores 3,
 * the remaster tag "Kai" scores 1, "WEB-DL"/"PT-BR"/the episode number
 * itself score 0. The anime merged-sequel rules require >= 2 so a re-seeded
 * original-series episode can never pose as a sequel episode.
 */
export function subtitleWords(p: ParsedRelease, titles: (string | undefined)[]): string[] {
  return unmatchedExtras(p, titles).filter(
    (w) => !/^\d+$/.test(w) && !TECH_TOKEN.test(w) && !RELEASE_TAG_WORDS.has(w)
  );
}

/**
 * Classify a TV release for a specific season/episode.
 *  - "verified": name carries the exact SxxEyy requested (or an unambiguous
 *                dated episode / episode-with-title-season equivalent)
 *  - "pack": season pack / complete series that contains the episode
 *            (the stream route then picks the right file inside the pack)
 *  - null: a different episode/season/language version — reject
 */
export function matchTv(
  p: ParsedRelease,
  season: number,
  episode: number,
  title: string,
  originalTitle: string | undefined,
  ctx: TvMatchCtx = {}
): MatchClass | null {
  const { ratio, unmatched } = bestTitleMatch(p, [title, originalTitle].filter(Boolean) as string[]);
  if (ratio < 0.75) return null;
  // a release tagged with a different language is a different version of the
  // show ("Bigg Boss Telugu" must never answer for "Bigg Boss" Tamil)
  if (p.language && ctx.showLang && p.language !== ctx.showLang) return null;

  const air = ctx.airDate ? parseYmd(ctx.airDate) : null;

  // A year token far from the episode's air year marks a reboot, remake or a
  // different production sharing the title ("ONE PIECE 2023" — the Netflix
  // live-action — must never answer the 1999 anime's S01E01). Long-running
  // shows are unaffected: their releases either carry no year token or the
  // season's own year, which equals the air year.
  if (p.year !== null && air && Math.abs(p.year - air.y) > 3) return null;

  // ANIME MERGED-SEQUEL RULES — TMDB folds a sequel season into the base show
  // ("Bleach" S02 = Thousand-Year Blood War) while fansubs index the sequel
  // as its own series numbered from 1. Only two names identify the episode,
  // and both may verify ONLY when the upload is fresh (within weeks of the
  // broadcast) and the name is subtitled (>= 2 unconsumed title words): a
  // re-seeded "Bleach - 45" or "BLEACH Kai S01E45" of the ORIGINAL series is
  // years old or carries no sequel subtitle, so it can never slip through.
  if (ctx.relEpisode != null) {
    const fresh = uploadNearAir(ctx.pubDate, air);
    if (fresh && subtitleWords(p, [title, originalTitle]).length >= 2) {
      // "BLEACH: Sennen Kessen-hen - 45 [1080p]" — bare episode number
      if (
        p.season === null &&
        !p.isSeasonPack &&
        p.titleTokens.includes(String(ctx.relEpisode))
      ) {
        return "verified";
      }
      // "BLEACH Thousand Year Blood War S01E45 …" — renumbered-series S/E tag
      if (p.season === 1 && p.episode === ctx.relEpisode) {
        return "verified";
      }
    }
  }

  // extra title words beyond country/part/date noise mean a different show
  // ("Office Incubation" is not "The Office", but "The Office US" is)
  if (!unmatched.every((w) => TV_EXTRA_OK.has(w) || DATED_EXTRA_OK.has(w) || /^\d+$/.test(w))) {
    return null;
  }

  if (p.season !== null && p.episode !== null) {
    if (p.season !== season || p.episode !== episode) return null;
    // episode-level releases that also carry a full broadcast date must agree
    // with the episode's air date (±1 day) — date labels are how Indian daily
    // shows disambiguate, so a wrong date means wrong content
    if (!p.isSeasonPack && p.date && air && p.date.year != null && dayOffset(p.date, air) > 1) {
      return null;
    }
    return "verified";
  }
  if (p.episode !== null) {
    // anime absolute numbering: "One Piece - 1085" is TMDB S21E158 — the
    // broadcast-order number identifies the episode uniquely for long-runners
    if (ctx.absEpisode != null && p.season === null && p.episode === ctx.absEpisode) {
      return "verified";
    }
    // any other claimed episode number that differs from the request is a
    // different episode — even when the title carries the right season
    if (p.episode !== episode) return null;
    // episode number matches — trust it when the requested season is 1, when
    // the title itself carries the season ("Bigg Boss 11 — Episode 24"), or
    // when the release's broadcast date matches the episode's air date.
    // Anime context is excluded from the season-1 shortcut: fansubs number by
    // broadcast order there, so only the exact absolute episode may verify.
    if (season === 1 && ctx.absEpisode == null) return "verified";
    if (titleCarriesSeason(p, season)) return "verified";
    if (p.date && air && dateMatches(p.date, air)) return "verified";
    return null;
  }
  // anime fansub style puts the absolute episode as a bare trailing number:
  // "One Piece - 1085 [1080p]" — too ambiguous for a general rule, but safe
  // when the exact broadcast-order number is known
  if (
    ctx.absEpisode != null &&
    p.season === null &&
    p.titleTokens.length > 0 &&
    p.titleTokens[p.titleTokens.length - 1] === String(ctx.absEpisode)
  ) {
    return "verified";
  }
  if (p.isSeasonPack) {
    if (p.seasonRange) {
      if (season < p.seasonRange[0] || season > p.seasonRange[1]) return null;
    } else if (p.season !== null && p.season !== season) return null;
    // a dated "pack" is really a single dated episode of that season
    // ("Bigg Boss Season 20 - 29th October 2026") — the broadcast date must
    // equal the episode's air date; an exact-date hit is a verified episode,
    // any other date is a different day's episode — never play it
    if (p.date && air) {
      return dateMatches(p.date, air) ? "verified" : null;
    }
    return "pack";
  }
  // no season/episode markers at all — dated daily episodes ("… Premier 1st Oct")
  // are exact when the calendar date equals the episode's air date
  if (p.date && air) {
    return dateMatches(p.date, air) ? "verified" : null;
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
