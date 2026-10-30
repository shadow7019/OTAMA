"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, SearchX, BookmarkX, Loader2, Clapperboard } from "lucide-react";
import {
  MediaItem,
  Genre,
  PagedResponse,
  tmdb,
  getMediaType,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";
import { MediaCard } from "./MediaCard";

export type BrowseKind = "movie" | "tv" | "search" | "mylist";

interface BrowseGridProps {
  kind: BrowseKind;
  query?: string;
  actions: MediaActions;
  title: string;
  /** Extra discover params pinned for this grid, e.g. { with_networks: 213 }
   *  or { with_watch_providers: "8", watch_region: "US" }. Must be memoized
   *  by the caller to keep identity stable. */
  discoverParams?: Record<string, string | number | boolean>;
  /** Hide the h1/back header — the parent (BrandView) renders its own hero. */
  bare?: boolean;
  /** One-tap genre chips rendered under the dropdown filters. */
  showGenreChips?: boolean;
  /** Small line rendered above the filter bar (catalog description). */
  note?: string;
  /** Optional back link rendered above the title (e.g. back to the Studios hub) */
  onBack?: () => void;
  backLabel?: string;
}

const MOVIE_SORTS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "primary_release_date.desc", label: "Newest" },
  { value: "revenue.desc", label: "Top Grossing" },
];

const TV_SORTS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Highest Rated" },
  { value: "first_air_date.desc", label: "Newest" },
];

const YEAR_OPTIONS = [
  { value: "", label: "Any year" },
  ...Array.from({ length: 30 }, (_, i) => {
    const y = 2026 - i;
    return { value: String(y), label: String(y) };
  }),
];

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-normal normal-case text-zinc-200 focus:border-red-600 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#12121a]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] w-full rounded-lg bg-zinc-800/60" />
      <div className="mt-2 h-3.5 w-3/4 rounded bg-zinc-800/60" />
      <div className="mt-1.5 h-3 w-1/3 rounded bg-zinc-800/40" />
    </div>
  );
}

export function BrowseGrid({
  kind,
  query = "",
  actions,
  title,
  discoverParams,
  bare = false,
  showGenreChips = false,
  note,
  onBack,
  backLabel,
}: BrowseGridProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const store = useMediaStore();

  const isDiscover = kind === "movie" || kind === "tv";
  const isStoreList = kind === "mylist";

  // reset when switching tab / query / pinned params
  useEffect(() => {
    setItems([]);
    setPage(1);
    setError(null);
  }, [kind, query, discoverParams]);

  // load genres for discover
  useEffect(() => {
    if (!isDiscover) return;
    tmdb<{ genres: Genre[] }>(`genre/${kind}/list`)
      .then((res) => setGenres(res.genres ?? []))
      .catch(() => {});
  }, [isDiscover, kind]);

  // fetch pages
  useEffect(() => {
    if (isStoreList) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        let res: PagedResponse<MediaItem>;
        if (kind === "search") {
          if (!query.trim()) {
            setItems([]);
            setTotalPages(1);
            return;
          }
          res = await tmdb<PagedResponse<MediaItem>>("search/multi", {
            query,
            page,
            include_adult: false,
          });
        } else {
          const params: Record<string, string | number | boolean> = { page, sort_by: sortBy };
          if (discoverParams) Object.assign(params, discoverParams);
          if (genre) params.with_genres = genre;
          if (year) {
            if (kind === "movie") params.primary_release_year = year;
            else params.first_air_date_year = year;
          }
          if (reloadKey > 0 && page === 1) params._fresh = 1; // auto-update pass
          res = await tmdb<PagedResponse<MediaItem>>(`discover/${kind}`, params);
        }

        if (cancelled) return;
        const media = res.results
          .filter(
            (r) => (r.media_type === "movie" || r.media_type === "tv" || kind !== "search") && !r.adult
          )
          .map((r) => ({
            ...r,
            // discover endpoints don't return media_type — force it by kind
            media_type: kind === "search" ? getMediaType(r) : kind,
          }));
        setItems((prev) => (page === 1 ? media : [...prev, ...media]));
        setTotalPages(Math.min(res.total_pages, 500));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // debounce for search
    const delay = kind === "search" ? 150 : 0;
    const t = setTimeout(run, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kind, query, page, sortBy, genre, year, isStoreList, reloadKey, discoverParams]);

  // auto-update: re-pull page 1 when the tab regains focus or every 5 minutes,
  // so new movies/episodes show up on their own — no reload needed. The
  // `_fresh` hint bypasses the TMDB proxy cache for that one request.
  useEffect(() => {
    if (isStoreList || kind === "search") return;
    let last = Date.now();
    const bump = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 60_000) return; // throttle
      last = Date.now();
      setPage(1);
      setReloadKey((k) => k + 1);
    };
    const iv = setInterval(bump, 5 * 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", bump);
    };
  }, [isStoreList, kind]);

  // infinite scroll
  useEffect(() => {
    if (isStoreList || loading || page >= totalPages) return;
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: "600px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isStoreList, loading, page, totalPages]);

  const storeItems = useMemo(() => {
    if (!mounted || kind !== "mylist") return [];
    return store.watchlist;
  }, [mounted, kind, store.watchlist]);

  const onRemove = useCallback(
    (id: number, mediaType: "movie" | "tv") => {
      store.removeFromWatchlist(id, mediaType);
    },
    [store]
  );

  const hasFilters = isDiscover;
  const showReset = hasFilters && (sortBy !== "popularity.desc" || genre !== "" || year !== "");

  return (
    <div className={bare ? "px-4 pb-16 pt-4 md:px-8" : "px-4 pb-16 pt-24 md:px-8 md:pt-28"}>
      {bare && note && (
        <p className="text-xs text-zinc-500" data-testid="catalog-note">{note}</p>
      )}
      {!bare && (
        <>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-red-400"
            >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {backLabel ?? "Back"}
            </button>
          )}
          <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
          {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
        </>
      )}

      {/* Filters */}
      {hasFilters && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/5">
          <div className="flex items-center gap-2 text-zinc-500">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Filters</span>
          </div>
          <Select
            label="Sort"
            value={sortBy}
            onChange={(v) => {
              setSortBy(v);
              setPage(1);
            }}
            options={kind === "movie" ? MOVIE_SORTS : TV_SORTS}
          />
          <Select
            label="Genre"
            value={genre}
            onChange={(v) => {
              setGenre(v);
              setPage(1);
            }}
            options={[{ value: "", label: "All genres" }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))]}
          />
          <Select
            label="Year"
            value={year}
            onChange={(v) => {
              setYear(v);
              setPage(1);
            }}
            options={YEAR_OPTIONS}
          />
          {showReset && (
            <button
              type="button"
              onClick={() => {
                setSortBy("popularity.desc");
                setGenre("");
                setYear("");
                setPage(1);
              }}
              className="text-xs font-semibold text-red-400 hover:text-red-300"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Quick genre chips */}
      {showGenreChips && hasFilters && genres.length > 0 && (
        <div
          role="group"
          aria-label="Quick genre filters"
          className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8"
        >
          {[{ id: 0, name: "All" }, ...genres].map((g) => {
            const active = g.id === 0 ? genre === "" : String(g.id) === genre;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setGenre(g.id === 0 ? "" : String(g.id));
                  setPage(1);
                }}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                  active
                    ? "bg-red-600 text-white"
                    : "bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Search hint */}
      {kind === "search" && !query.trim() && (
        <p className="mt-10 text-center text-sm text-zinc-500">
          Type something in the search bar above to find movies and TV shows.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-300 ring-1 ring-red-900">
          {error}
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="ml-3 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty states */}
      {isStoreList && mounted && storeItems.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <BookmarkX className="h-12 w-12 text-zinc-700" />
          <p className="text-lg font-semibold text-zinc-400">Your list is empty</p>
          <p className="max-w-sm text-sm text-zinc-600">
            Browse movies and shows, then tap &quot;My List&quot; on any title to save it here.
          </p>
        </div>
      )}
      {kind === "search" && query.trim() && !loading && !items.length && !error && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <SearchX className="h-12 w-12 text-zinc-700" />
          <p className="text-lg font-semibold text-zinc-400">
            No results for &quot;{query}&quot;
          </p>
          <p className="text-sm text-zinc-600">Check the spelling or try a different keyword.</p>
        </div>
      )}

      {/* Discover empty state (e.g. a studio with no series, or over-narrow filters) */}
      {!isStoreList && kind !== "search" && !loading && !error && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <Clapperboard className="h-12 w-12 text-zinc-700" />
          <p className="text-lg font-semibold text-zinc-400">No titles found</p>
          <p className="max-w-sm text-sm text-zinc-600">
            {showReset
              ? "Nothing matches the current filters — try clearing one or widening the search."
              : "This catalog has no titles listed on TMDB yet. Check back later."}
          </p>
        </div>
      )}

      {/* Grid */}
      {isStoreList ? (
        storeItems.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-5 xl:grid-cols-6">
            {storeItems.map((entry) => (
              <MediaCard
                key={`${entry.media_type}-${entry.id}`}
                item={{
                  id: entry.id,
                  media_type: entry.media_type,
                  title: entry.title,
                  poster_path: entry.poster_path,
                  backdrop_path: entry.backdrop_path,
                  vote_average: entry.vote_average,
                  release_date: entry.release_date,
                  first_air_date: entry.release_date,
                }}
                actions={actions}
                onRemove={() => onRemove(entry.id, entry.media_type)}
              />
            ))}
          </div>
        )
      ) : items.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item, i) => (
            <MediaCard
              key={`${getMediaType(item)}-${item.id}-${i}`}
              item={item}
              actions={actions}
            />
          ))}
        </div>
      ) : null}

      {/* Loading skeletons */}
      {loading && !isStoreList && (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-5 xl:grid-cols-6">
          {[...Array(12)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Sentinel + status */}
      {!isStoreList && (
        <>
          <div ref={sentinel} className="h-1" />
          {!loading && page < totalPages && items.length > 0 && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-red-600 hover:text-white"
              >
                Load more
              </button>
            </div>
          )}
          {page >= totalPages && items.length > 0 && (
            <p className="mt-8 text-center text-xs text-zinc-600">
              You&apos;ve reached the end · {items.length} titles
            </p>
          )}
        </>
      )}

      {isStoreList && storeItems.length > 0 && (
        <p className="mt-8 text-center text-xs text-zinc-600">
          {storeItems.length} title{storeItems.length > 1 ? "s" : ""} in your list
        </p>
      )}

      {loading && isStoreList === false && page > 1 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs text-zinc-300 ring-1 ring-white/10 backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
        </div>
      )}
    </div>
  );
}
