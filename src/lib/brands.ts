/**
 * Curated movie studios and streaming services / TV networks, mirroring the
 * discovery tabs on cinex.lol. Every id and logo path below was verified
 * against the TMDB API (GET /company/{id}, GET /network/{id}).
 *
 * Logos are white-on-transparent PNGs served by TMDB:
 *   https://image.tmdb.org/t/p/w300{logo}
 */

export type BrandKind = "movie" | "tv";

export interface Brand {
  id: number;
  name: string;
  /** TMDB logo path (null → render the name instead) */
  logo: string | null;
  kind: BrandKind;
  param: "with_companies" | "with_networks";
}

export const STUDIOS: Brand[] = [
  { id: 174, name: "Warner Bros. Pictures", logo: "/zhD3hhtKB5qyv7ZeL4uLpNxgMVU.png", kind: "movie", param: "with_companies" },
  { id: 33, name: "Universal Pictures", logo: "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png", kind: "movie", param: "with_companies" },
  { id: 4, name: "Paramount Pictures", logo: "/jay6WcMgagAklUt7i9Euwj1pzTF.png", kind: "movie", param: "with_companies" },
  { id: 2, name: "Walt Disney Pictures", logo: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png", kind: "movie", param: "with_companies" },
  { id: 5, name: "Columbia Pictures", logo: "/71BqEFAF4V3qjjMPCpLuyJFB9A.png", kind: "movie", param: "with_companies" },
  { id: 127928, name: "20th Century Studios", logo: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png", kind: "movie", param: "with_companies" },
  { id: 420, name: "Marvel Studios", logo: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", kind: "movie", param: "with_companies" },
  { id: 3, name: "Pixar", logo: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png", kind: "movie", param: "with_companies" },
  { id: 521, name: "DreamWorks Animation", logo: "/3BPX5VGBov8SDqTV7wC1L1xShAS.png", kind: "movie", param: "with_companies" },
  { id: 923, name: "Legendary Pictures", logo: "/5UQsZrfbfG2dYJbx8DxfoTr2Bvu.png", kind: "movie", param: "with_companies" },
  { id: 41077, name: "A24", logo: "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png", kind: "movie", param: "with_companies" },
  { id: 10342, name: "Studio Ghibli", logo: "/uFuxPEZRUcBTEiYIxjHJq62Vr77.png", kind: "movie", param: "with_companies" },
  { id: 12, name: "New Line Cinema", logo: "/2ycs64eqV5rqKYHyQK0GVoKGvfX.png", kind: "movie", param: "with_companies" },
  { id: 21, name: "Metro-Goldwyn-Mayer", logo: "/usUnaYV6hQnlVAXP6r4HwrlLFPG.png", kind: "movie", param: "with_companies" },
  { id: 1632, name: "Lionsgate", logo: "/cisLn1YAUuptXVBa0xjq7ST9cH0.png", kind: "movie", param: "with_companies" },
];

export const NETWORKS: Brand[] = [
  { id: 213, name: "Netflix", logo: "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png", kind: "tv", param: "with_networks" },
  { id: 49, name: "HBO", logo: "/tuomPhY2UtuPTqqFnKMVHvSb724.png", kind: "tv", param: "with_networks" },
  { id: 3186, name: "HBO Max", logo: "/nmU0UMDJB3dRRQSTUqawzF2Od1a.png", kind: "tv", param: "with_networks" },
  { id: 2739, name: "Disney+", logo: "/1edZOYAfoyZyZ3rklNSiUpXX30Q.png", kind: "tv", param: "with_networks" },
  { id: 8036, name: "JioHotstar", logo: "/f4UwAB8E6DEQfFhyKEH4NEvwYRt.png", kind: "tv", param: "with_networks" },
  { id: 2552, name: "Apple TV+", logo: "/bngHRFi794mnMq34gfVcm9nDxN1.png", kind: "tv", param: "with_networks" },
  { id: 1024, name: "Prime Video", logo: "/w7HfLNm9CWwRmAMU58udl2L7We7.png", kind: "tv", param: "with_networks" },
  { id: 453, name: "Hulu", logo: "/pqUTCleNUiTLAVlelGxUgWn1ELh.png", kind: "tv", param: "with_networks" },
  { id: 4330, name: "Paramount+", logo: "/fi83B1oztoS47xxcemFdPMhIzK.png", kind: "tv", param: "with_networks" },
  { id: 3353, name: "Peacock", logo: "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png", kind: "tv", param: "with_networks" },
  { id: 88, name: "FX", logo: "/aexGjtcs42DgRtZh7zOxayiry4J.png", kind: "tv", param: "with_networks" },
  { id: 33, name: "MTV", logo: "/w4qtv7xBkSVsbOQdSzjUjlyOuSr.png", kind: "tv", param: "with_networks" },
  { id: 6, name: "NBC", logo: "/cm111bsDVlYaC1foL0itvEI4yLG.png", kind: "tv", param: "with_networks" },
  { id: 2, name: "ABC", logo: "/2uy2ZWcplrSObIyt4x0Y9rkG6qO.png", kind: "tv", param: "with_networks" },
  { id: 16, name: "CBS", logo: "/wju8KhOUsR5y4bH9p3Jc50hhaLO.png", kind: "tv", param: "with_networks" },
  { id: 19, name: "FOX", logo: "/1DSpHrWyOORkL9N2QHX7Adt31mQ.png", kind: "tv", param: "with_networks" },
  { id: 67, name: "Showtime", logo: "/Allse9kbjiP6ExaQrnSpIhkurEi.png", kind: "tv", param: "with_networks" },
  { id: 318, name: "Starz", logo: "/qx3Y9LCaK4mq1ykFuDIfjshlo3U.png", kind: "tv", param: "with_networks" },
  { id: 4, name: "BBC One", logo: "/uJjcCg3O4DMEjM0xtno9OWFciRP.png", kind: "tv", param: "with_networks" },
  { id: 71, name: "The CW", logo: "/hEpcdJ4O6eitG9ADSnDXNUrlovS.png", kind: "tv", param: "with_networks" },
];

export function brandLogoUrl(b: Brand, size: "w300" | "w500" = "w300"): string | null {
  return b.logo ? `https://image.tmdb.org/t/p/${size}${b.logo}` : null;
}
