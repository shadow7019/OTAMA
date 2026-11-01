/**
 * Curated movie studios and streaming services / TV networks, mirroring the
 * per-brand discovery tabs of the original reference site. Every id and logo
 * path below was verified against the TMDB API (GET /company/{id}, GET /network/{id}).
 *
 * Logos are white-on-transparent PNGs served by TMDB:
 *   https://image.tmdb.org/t/p/w300{logo}
 *
 * Each brand powers a page with SEPARATE Series / Movies catalogs:
 *  - Series catalog: discover/tv?with_networks={id} (networks) or
 *                    discover/tv?with_companies={id} (movie studios).
 *  - Movies catalog: discover/movie?with_companies={id} (studios) or, for
 *                    streaming services, discover/movie?with_watch_providers
 *                    (verified watch-provider ids below, flatrate tier).
 */

export type BrandKind = "movie" | "tv";

export interface Brand {
  /**
   * TMDB company/network id. A pipe-separated string ("a|b|c") means ANY of —
   * TMDB keeps duplicate company entries for some brands (e.g. Crunchyroll
   * exists three times), and discover accepts the combined form directly.
   */
  id: number | string;
  name: string;
  /** TMDB logo path (null → render the name instead) */
  logo: string | null;
  kind: BrandKind;
  param: "with_companies" | "with_networks";
  /**
   * TMDB watch-provider id(s), "a|b" = any of. Builds the separate MOVIES
   * catalog for streaming services (their network id only covers series).
   */
  watchProvider?: string;
  /** Watch region for the provider query (defaults to "US"). */
  watchRegion?: string;
  /** Short line shown under the brand name on its catalog page. */
  tagline?: string;
}

export const STUDIOS: Brand[] = [
  { id: 174, name: "Warner Bros. Pictures", logo: "/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png", kind: "movie", param: "with_companies", tagline: "The WB library — from Looney Tunes to Dune and the DC universe" },
  { id: 33, name: "Universal Pictures", logo: "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png", kind: "movie", param: "with_companies", tagline: "A century of blockbusters, horror classics and animation" },
  { id: 4, name: "Paramount Pictures", logo: "/jay6WcMgagAklUt7i9Euwj1pzTF.png", kind: "movie", param: "with_companies", tagline: "From The Godfather to Mission: Impossible" },
  { id: 2, name: "Walt Disney Pictures", logo: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", kind: "movie", param: "with_companies", tagline: "Animated classics, live-action retellings and family epics" },
  { id: 5, name: "Columbia Pictures", logo: "/71BqEFAF4V3qjjMPCpLuyJFB9A.png", kind: "movie", param: "with_companies", tagline: "Sony's flagship studio — Spider-Man, Jumanji and beyond" },
  { id: 127928, name: "20th Century Studios", logo: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", kind: "movie", param: "with_companies", tagline: "The Fox library — sci-fi sagas, Avatar and The Simpsons movie era" },
  { id: 420, name: "Marvel Studios", logo: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", kind: "movie", param: "with_companies", tagline: "The MCU — every phase on film and on Disney+" },
  { id: 3, name: "Pixar", logo: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", kind: "movie", param: "with_companies", tagline: "Story-first animation from Emeryville" },
  { id: 521, name: "DreamWorks Animation", logo: "/3BPX5VGBov8SDqTV7wC1L1xShAS.png", kind: "movie", param: "with_companies", tagline: "Shrek, dragons and ogre-sized comedy" },
  { id: 923, name: "Legendary Pictures", logo: "/5UQsZrfbfG2dYJbx8DxfoTr2Bvu.png", kind: "movie", param: "with_companies", tagline: "Monsterverse, Dune and kaiju-scale epics" },
  { id: 41077, name: "A24", logo: "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png", kind: "movie", param: "with_companies", tagline: "The indie studio behind Moonlight and Everything Everywhere" },
  { id: 10342, name: "Studio Ghibli", logo: "/uFuxPEZRUcBTEiYIxjHJq62Vr77.png", kind: "movie", param: "with_companies", tagline: "Miyazaki, Takahata and the art of hand-drawn wonder" },
  { id: 12, name: "New Line Cinema", logo: "/2ycs64eqV5rqKYHyQK0GVoKGvfX.png", kind: "movie", param: "with_companies", tagline: "The House that Freddy Built — and Middle-earth" },
  { id: 21, name: "Metro-Goldwyn-Mayer", logo: "/usUnaYV6hQnlVAXP6r4HwrlLFPG.png", kind: "movie", param: "with_companies", tagline: "Leo the Lion — Bond, Rocky and Hollywood royalty" },
  { id: 1632, name: "Lionsgate", logo: "/cisLn1YAUuptXVBa0xjq7ST9cH0.png", kind: "movie", param: "with_companies", tagline: "Hunger Games, John Wick and premium genre fare" },
];

export const NETWORKS: Brand[] = [
  { id: 213, name: "Netflix", logo: "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", kind: "tv", param: "with_networks", watchProvider: "8", watchRegion: "US", tagline: "Originals and everything streaming — series and films in one place" },
  { id: 49, name: "HBO", logo: "/tuomPhY2UtuPTqqFnKMVHvSb724.png", kind: "tv", param: "with_networks", watchProvider: "1899", watchRegion: "US", tagline: "Prestige TV — films stream on Max" },
  { id: 3186, name: "HBO Max", logo: "/nmU0UMDJB3dRRQSTUqawzF2Od1a.png", kind: "tv", param: "with_networks", watchProvider: "1899", watchRegion: "US", tagline: "Streaming home of HBO originals and Warner films" },
  { id: 2739, name: "Disney+", logo: "/1edZOYAfoyZyZ3rklNSiUpXX30Q.png", kind: "tv", param: "with_networks", watchProvider: "337", watchRegion: "US", tagline: "Disney, Pixar, Marvel, Star Wars and National Geographic" },
  { id: 8036, name: "JioHotstar", logo: "/f4UwAB8E6DEQfFhyKEH4NEvwYRt.png", kind: "tv", param: "with_networks", watchProvider: "2336", watchRegion: "IN", tagline: "India's biggest streamer — Indian originals, HBO and Hollywood hits" },
  { id: 2552, name: "Apple TV+", logo: "/bngHRFi794mnMq34gfVcm9nDxN1.png", kind: "tv", param: "with_networks", watchProvider: "350", watchRegion: "US", tagline: "Small catalog, awards focus — originals only" },
  { id: 1024, name: "Prime Video", logo: "/w7HfLNm9CWwRmAMU58udl2L7We7.png", kind: "tv", param: "with_networks", watchProvider: "9", watchRegion: "US", tagline: "Amazon's included-with-Prime series and films" },
  { id: 453, name: "Hulu", logo: "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", kind: "tv", param: "with_networks", watchProvider: "15", watchRegion: "US", tagline: "Next-day TV, FX originals and streaming films" },
  { id: 4330, name: "Paramount+", logo: "/fi83B1oztoS47xxcemFdPMhIzK.png", kind: "tv", param: "with_networks", watchProvider: "2303|2616", watchRegion: "US", tagline: "Star Trek, CBS shows and the Paramount film vault" },
  { id: 3353, name: "Peacock", logo: "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png", kind: "tv", param: "with_networks", watchProvider: "386|387", watchRegion: "US", tagline: "NBCUniversal originals, Bravo and Premier League" },
  // TMDB splits Crunchyroll across three duplicate company entries — the
  // combined form (verified: 164 series, incl. Solo Leveling / BLUE LOCK)
  // powers the Series catalog; its watch provider id 283 powers Movies.
  { id: "198847|98553|201119", name: "Crunchyroll", logo: "/qqyXcZlJQKlRmAD1TCKV7mGLQlt.png", kind: "tv", param: "with_companies", watchProvider: "283", watchRegion: "US", tagline: "The world's largest anime library — simulcasts straight from Japan" },
  { id: 88, name: "FX", logo: "/aexGjtcs42DgRtZh7zOxayiry4J.png", kind: "tv", param: "with_networks", tagline: "Prestige originals from FX" },
  { id: 33, name: "MTV", logo: "/w4qtv7xBkSVsbOQdSzjUjlyOuSr.png", kind: "tv", param: "with_networks", tagline: "Reality, music and unscripted classics" },
  { id: 6, name: "NBC", logo: "/cm111bsDVlYaC1foL0itvEI4yLG.png", kind: "tv", param: "with_networks", tagline: "Must-see TV since the beginning" },
  { id: 2, name: "ABC", logo: "/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png", kind: "tv", param: "with_networks", tagline: "The network of Grey's Anatomy and TGIF" },
  { id: 16, name: "CBS", logo: "/wju8KhOUsR5y4bH9p3Jc50hhaLO.png", kind: "tv", param: "with_networks", tagline: "Procedurals, sitcoms and Sunday football" },
  { id: 19, name: "FOX", logo: "/1DSpHrWyOORkL9N2QHX7Adt31mQ.png", kind: "tv", param: "with_networks", tagline: "Animation domination and event series" },
  { id: 67, name: "Showtime", logo: "/Allse9kbjiP6ExaQrnSpIhkurEi.png", kind: "tv", param: "with_networks", tagline: "Prestige originals — now on Paramount+" },
  { id: 318, name: "Starz", logo: "/qx3Y9LCaK4mq1ykFuDIfjshlo3U.png", kind: "tv", param: "with_networks", watchProvider: "43", watchRegion: "US", tagline: "Premium originals like Outlander and Power" },
  { id: 4, name: "BBC One", logo: "/uJjcCg3O4DMEjM0xtno9OWFciRP.png", kind: "tv", param: "with_networks", tagline: "Doctor Who, Sherlock and British institution TV" },
  { id: 71, name: "The CW", logo: "/hEpcdJ4O6eitG9ADSnDXNUrlovS.png", kind: "tv", param: "with_networks", tagline: "Arrowverse, teen dramas and network favorites" },
];

export function brandLogoUrl(b: Brand, size: "w300" | "w500" = "w300"): string | null {
  return b.logo ? `https://image.tmdb.org/t/p/${size}${b.logo}` : null;
}
