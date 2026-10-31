"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Sparkles, Tv } from "lucide-react";
import { MediaItem, PagedResponse, tmdb } from "@/lib/tmdb";
import { MediaActions } from "./types";
import { MediaRow } from "./MediaRow";
import { BrowseGrid } from "./BrowseGrid";

/**
 * Dedicated Anime section — the anime counterpart of the Movies / TV Shows
 * tabs. Japanese-animation catalogs (with_genres=16 + with_original_language
 * =ja) for series and films, each with curated rows (currently-airing, new
 * episodes, all-time greats) plus the full filterable grid. Rows re-pull with
 * a cache-busting `_fresh` hint on focus / every few minutes so brand-new
 * episodes and seasonal premieres appear without any manual refresh.
 */

type CatalogId = "series" | "movies";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const daysAhead = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

const TV_PARAMS = { with_genres: 16, with_original_language: "ja" };
const MOVIE_PARAMS = { with_genres: 16, with_original_language: "ja" };

interface RowConfig {
  key: string;
  title: string;
  /** discover query params (kind-specific, anime-pinned) */
  params: Record<string, string | number | boolean>;
  kind: "tv" | "movie";
}

const SERIES_ROWS: RowConfig[] = [
  {
    key: "airing",
    title: "Airing Now",
    kind: "tv",
    // episode air-date window — anime broadcasting this very week
    params: { ...TV_PARAMS, "air_date.gte": daysAgo(7), "air_date.lte": daysAhead(2), sort_by: "popularity.desc" },
  },
  {
    key: "trending",
    title: "Trending Anime",
    kind: "tv",
    params: { ...TV_PARAMS, sort_by: "popularity.desc" },
  },
  {
    key: "new-series",
    title: "New This Season",
    kind: "tv",
    params: { ...TV_PARAMS, sort_by: "first_air_date.desc", "first_air_date.gte": daysAgo(80), "vote_count.gte": 3 },
  },
  {
    key: "greats",
    title: "All-Time Greats",
    kind: "tv",
    params: { ...TV_PARAMS, sort_by: "vote_average.desc", "vote_count.gte": 400 },
  },
];

const MOVIE_ROWS: RowConfig[] = [
  {
    key: "pop-movies",
    title: "Popular Anime Films",
    kind: "movie",
    params: { ...MOVIE_PARAMS, sort_by: "popularity.desc" },
  },
  {
    key: "new-movies",
    title: "New Releases",
    kind: "movie",
    params: {
      ...MOVIE_PARAMS,
      sort_by: "primary_release_date.desc",
      "primary_release_date.gte": daysAgo(120),
      "vote_count.gte": 10,
    },
  },
  {
    key: "top-movies",
    title: "Top Rated Anime Films",
    kind: "movie",
    params: { ...MOVIE_PARAMS, sort_by: "vote_average.desc", "vote_count.gte": 300 },
  },
];

function AnimeRow({ config, actions }: { config: RowConfig; actions: MediaActions }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const ref = useRef<HTMLDivElement>(null);
  const lastLoadRef = useRef(0);

  const load = useCallback(
    (refresh = false) => {
      if (!refresh) setState("loading"); // silent refetch on auto-update
      tmdb<PagedResponse<MediaItem>>(
        `discover/${config.kind}`,
        refresh ? { ...config.params, _fresh: 1 } : config.params
      )
        .then((res) => {
          // discover rows carry no media_type — stamp the catalog kind so the
          // detail modal / player query the right endpoint ("Bleach" must open
          // as tv/30984, not movie/30984)
          const media = res.results.filter(
            (r) => !r.adult && r.poster_path && (r.media_type === undefined || r.media_type === config.kind)
          );
          setItems(media.slice(0, 20).map((r) => ({ ...r, media_type: config.kind })));
          setState("done");
        })
        .catch(() => setState("error"));
    },
    [config.kind, config.params]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state === "idle") load();
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [state, load]);

  // auto-update: new episodes / premieres flow in while the tab stays open
  useEffect(() => {
    if (state !== "done") return;
    const bump = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadRef.current < 5 * 60_000) return; // throttle
      lastLoadRef.current = Date.now();
      load(true);
    };
    const iv = setInterval(bump, 5 * 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", bump);
    };
  }, [state, load]);

  return (
    <div ref={ref}>
      {state === "done" && items.length > 0 ? (
        <MediaRow title={config.title} items={items} actions={actions} icon={<Sparkles className="h-5 w-5" />} />
      ) : state !== "error" ? (
        <section className="py-3" aria-label={`${config.title} (loading)`}>
          <div className="mb-1 flex items-center gap-2 px-4 md:px-8">
            <span className="text-red-500">
              <Sparkles className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight text-zinc-100 md:text-xl">{config.title}</h2>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-hidden px-4 py-2 md:gap-4 md:px-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="w-[136px] shrink-0 sm:w-[152px] md:w-[168px]">
                <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-zinc-800/50" />
                <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-zinc-800/40" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function AnimeView({ actions }: { actions: MediaActions }) {
  const [tab, setTab] = useState<CatalogId>("series");

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="px-4 pt-24 md:px-8 md:pt-28">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-800 shadow-lg shadow-red-600/30 md:h-14 md:w-14">
            <Sparkles className="h-6 w-6 text-white md:h-7 md:w-7" />
          </span>
          <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">Anime</h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Every anime series and film — subbed and dubbed, from this season&apos;s
          premieres to the all-time classics. Episodes stream through the built-in
          ad-free player, and new episodes appear on their own as they broadcast.
          Series and movies live in their own tabs below.
        </p>
      </div>

      {/* Sticky tabs */}
      <div
        className="sticky top-14 z-30 mt-6 border-b border-white/5 bg-[#0b0b10]/95 backdrop-blur-md md:top-16"
        role="tablist"
        aria-label="Anime catalogs"
      >
        <div className="flex gap-1 px-4 md:px-8">
          {(
            [
              { id: "series" as CatalogId, label: "Series", icon: <Tv className="h-4 w-4" /> },
              { id: "movies" as CatalogId, label: "Movies", icon: <Film className="h-4 w-4" /> },
            ]
          ).map((c) => {
            const active = tab === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`tab-${c.id}`}
                onClick={() => setTab(c.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {c.icon}
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Catalogs — both mounted so tab switches are instant */}
      <div
        role="tabpanel"
        aria-label="Anime — Series"
        className={tab === "series" ? "block" : "hidden"}
      >
        {SERIES_ROWS.map((r) => (
          <AnimeRow key={r.key} config={r} actions={actions} />
        ))}
        <BrowseGrid
          kind="tv"
          title="All Anime Series"
          actions={actions}
          bare
          showGenreChips
          discoverParams={TV_PARAMS}
          note="Everything classified as anime on TMDB — sorted by popularity, filters below apply on top."
        />
      </div>
      <div
        role="tabpanel"
        aria-label="Anime — Movies"
        className={tab === "movies" ? "block" : "hidden"}
      >
        {MOVIE_ROWS.map((r) => (
          <AnimeRow key={r.key} config={r} actions={actions} />
        ))}
        <BrowseGrid
          kind="movie"
          title="All Anime Movies"
          actions={actions}
          bare
          showGenreChips
          discoverParams={MOVIE_PARAMS}
          note="Feature-length anime — from theatrical hits to direct-to-video classics."
        />
      </div>
    </div>
  );
}
