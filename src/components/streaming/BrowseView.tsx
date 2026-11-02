"use client";

import { useCallback, useEffect, useState } from "react";
import { Film, Tv, SlidersHorizontal, X, Loader2, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  DECADES,
  LANGUAGES,
  SORTS,
  decadeRange,
  genresFor,
  type MediaItem,
  type MediaType,
} from "@/lib/tmdb-constants";

import { MediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";

const SORTS_BY_KIND: Record<MediaType, readonly { value: string; label: string }[]> = {
  movie: SORTS,
  tv: SORTS.filter((s) => s.value !== "revenue.desc"),
};

type Props = {
  kind: MediaType;
  genre?: number;
  language?: string;
  year?: string;
};

const HEADINGS: Record<MediaType, { title: string; sub: string; icon: React.ElementType }> = {
  movie: { title: "Movies", sub: "Every film on TMDB — from blockbusters to hidden gems", icon: Film },
  tv: { title: "TV Shows", sub: "Series from around the world, updated daily", icon: Tv },
};

export function BrowseView({ kind, genre, language, year }: Props) {
  const [genreSel, setGenreSel] = useState<number | undefined>(genre);
  const [langSel, setLangSel] = useState<string | undefined>(language);
  const [decade, setDecade] = useState<string | undefined>(year);
  const [sort, setSort] = useState<string>("popularity.desc");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<MediaItem[] | null>(null); // null = loading
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const loading = items === null;

  // Sync filter selections when navigation props change
  const [prevNav, setPrevNav] = useState({ genre, language, year, kind });
  if (
    prevNav.genre !== genre ||
    prevNav.language !== language ||
    prevNav.year !== year ||
    prevNav.kind !== kind
  ) {
    setPrevNav({ genre, language, year, kind });
    setGenreSel(genre);
    setLangSel(language);
    setDecade(year);
    setPage(1);
    setItems(null); // show loading for the new filter set
  }

  const buildUrl = useCallback(
    (p: number) => {
      const qs = new URLSearchParams();
      qs.set("page", String(p));
      qs.set("sort_by", sort);
      if (genreSel) qs.set("with_genres", String(genreSel));
      if (langSel) qs.set("with_original_language", langSel);
      if (decade) {
        const { from, to } = decadeRange(decade);
        if (kind === "movie") {
          qs.set("primary_release_date.gte", `${from}-01-01`);
          qs.set("primary_release_date.lte", `${to}-12-31`);
        } else {
          qs.set("first_air_date.gte", `${from}-01-01`);
          qs.set("first_air_date.lte", `${to}-12-31`);
        }
      }
      if (sort === "vote_average.desc") qs.set("vote_count_gte", "300");
      return `/api/tmdb/discover/${kind}?${qs.toString()}`;
    },
    [kind, genreSel, langSel, decade, sort]
  );

  // Reset and fetch first page when filters change
  useEffect(() => {
    let cancelled = false;
    fetch(buildUrl(1), { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: { results?: MediaItem[]; total_results?: number; total_pages?: number }) => {
        if (cancelled) return;
        setItems(d.results || []);
        setTotalResults(d.total_results || 0);
        setTotalPages(Math.min(d.total_pages || 1, 500));
        setPage(1);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [buildUrl, retryKey]);

  const loadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    fetch(buildUrl(page + 1), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { results?: MediaItem[] }) => {
        setItems((prev) => {
          const base = prev || [];
          const seen = new Set(base.map((i) => `${i.type}-${i.id}`));
          return [...base, ...(d.results || []).filter((i) => !seen.has(`${i.type}-${i.id}`))];
        });
        setPage((p) => p + 1);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingMore(false));
  };

  const navigate = useStore((s) => s.navigate);
  const heading = HEADINGS[kind];
  const genres = genresFor(kind);
  const activeFilters = [genreSel, langSel, decade].filter(Boolean).length;

  const clearAll = () => {
    setGenreSel(undefined);
    setLangSel(undefined);
    setDecade(undefined);
    setSort("popularity.desc");
    navigate({ name: "browse", kind });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-14 pt-24 md:px-8 md:pt-28">
      {/* Heading */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <heading.icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">{heading.title}</h1>
          <p className="text-xs text-muted-foreground md:text-sm">{heading.sub}</p>
        </div>
        <div className="flex-1" />
        {!loading ? (
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-muted-foreground">
            {totalResults.toLocaleString()} title{totalResults === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {/* Filter bar */}
      <div className="sticky top-16 z-30 -mx-4 mt-5 border-y border-white/5 bg-background/90 px-4 py-3 backdrop-blur-lg md:top-[68px] md:-mx-8 md:px-8">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
              filtersOpen || activeFilters
                ? "bg-primary text-white"
                : "bg-white/5 text-foreground/80 hover:bg-white/10"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilters ? (
              <span className="ml-0.5 rounded-full bg-white/25 px-1.5 text-[10px]">
                {activeFilters}
              </span>
            ) : null}
          </button>

          <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden />

          {SORTS_BY_KIND[kind].map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
                sort === s.value
                  ? "bg-white/15 text-foreground"
                  : "text-foreground/60 hover:bg-white/5 hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}

          {activeFilters ? (
            <button
              onClick={clearAll}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-primary"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          ) : null}
        </div>

        {filtersOpen ? (
          <div className="mt-3 grid gap-4 pb-1 md:grid-cols-3">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Genre
              </p>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
                <button
                  onClick={() => setGenreSel(undefined)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                    !genreSel ? "bg-primary text-white" : "bg-white/5 text-foreground/70 hover:bg-white/10"
                  )}
                >
                  All
                </button>
                {genres.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGenreSel(g.id === genreSel ? undefined : g.id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                      g.id === genreSel
                        ? "bg-primary text-white"
                        : "bg-white/5 text-foreground/70 hover:bg-white/10"
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Language
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setLangSel(undefined)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                    !langSel ? "bg-primary text-white" : "bg-white/5 text-foreground/70 hover:bg-white/10"
                  )}
                >
                  All
                </button>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLangSel(l.code === langSel ? undefined : l.code)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                      l.code === langSel
                        ? "bg-primary text-white"
                        : "bg-white/5 text-foreground/70 hover:bg-white/10"
                    )}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Decade
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setDecade(undefined)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                    !decade ? "bg-primary text-white" : "bg-white/5 text-foreground/70 hover:bg-white/10"
                  )}
                >
                  All
                </button>
                {DECADES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDecade(d === decade ? undefined : d)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
                      d === decade
                        ? "bg-primary text-white"
                        : "bg-white/5 text-foreground/70 hover:bg-white/10"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading titles…
        </div>
      ) : failed ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-bold">Couldn&apos;t load titles</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            TMDB didn&apos;t respond. Check your connection and try again.
          </p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : items.length ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((t) => (
              <MediaCard key={`${t.type}-${t.id}`} item={t} />
            ))}
          </div>
          {page < totalPages ? (
            <div className="mt-10 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-8 text-sm font-bold text-foreground transition hover:bg-primary hover:text-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" /> Load More
                  </>
                )}
              </button>
            </div>
          ) : (
            <p className="mt-10 text-center text-xs text-muted-foreground">
              You&apos;ve reached the end — {items.length.toLocaleString()} titles shown.
            </p>
          )}
        </>
      ) : (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <heading.icon className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-lg font-bold">No titles match these filters</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Try removing a filter — or roll the dice for something unexpected.
          </p>
          <button
            onClick={clearAll}
            className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            Show All {heading.title}
          </button>
        </div>
      )}
    </div>
  );
}
