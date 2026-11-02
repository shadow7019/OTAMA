"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search as SearchIcon, Dices, X, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { MediaItem } from "@/lib/tmdb-constants";
import { MediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";

const TYPE_FILTERS = ["All", "Movies", "TV Shows"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const navigate = useStore((s) => s.navigate);
  const random = useStore((s) => s.random);
  const [query, setQuery] = useState(initialQuery);
  const [typeSel, setTypeSel] = useState<TypeFilter>("All");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);

  // Trending suggestions for the empty state
  useEffect(() => {
    fetch("/api/tmdb/trending/all/week")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { results?: MediaItem[] }) => setTrending((d.results || []).slice(0, 12)))
      .catch(() => setTrending([]));
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      const clear = setTimeout(() => {
        setResults([]);
        setTotal(0);
        setLoading(false);
      }, 0);
      return () => clearTimeout(clear);
    }
    const id = ++requestId.current;
    const t = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(q)}&include_adult=false&page=1`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d: { results?: MediaItem[]; total_results?: number; total_pages?: number }) => {
          if (requestId.current !== id) return;
          setResults(d.results || []);
          setTotal(d.total_results || 0);
          setTotalPages(Math.min(d.total_pages || 1, 500));
          setPage(1);
        })
        .catch(() => requestId.current === id && setFailed(true))
        .finally(() => requestId.current === id && setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // keep URL in sync (replace state, no scroll jump)
  useEffect(() => {
    const q = query.trim();
    const target = q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", target);
    }
  }, [query]);

  const searched = Boolean(query.trim());

  const filtered = useMemo(() => {
    if (typeSel === "All") return results;
    const want = typeSel === "Movies" ? "movie" : "tv";
    return results.filter((r) => r.type === want);
  }, [results, typeSel]);

  const loadMore = () => {
    const q = query.trim();
    if (!q || loading || page >= totalPages) return;
    setLoading(true);
    fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(q)}&include_adult=false&page=${page + 1}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { results?: MediaItem[] }) => {
        setResults((prev) => {
          const seen = new Set(prev.map((i) => `${i.type}-${i.id}`));
          return [...prev, ...(d.results || []).filter((i) => !seen.has(`${i.type}-${i.id}`))];
        });
        setPage((p) => p + 1);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-14 pt-24 md:px-8 md:pt-28">
      {/* Search box */}
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-2xl font-black tracking-tight md:text-3xl">
          {searched ? (
            <>
              Results for <span className="text-primary">“{query.trim()}”</span>
            </>
          ) : (
            "Find your next watch"
          )}
        </h1>
        <div className="relative mt-5">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search movies, TV shows, people…"
            aria-label="Search the TMDB catalog"
            className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 pl-12 pr-12 text-base text-foreground outline-none backdrop-blur transition placeholder:text-muted-foreground focus:border-primary/60 focus:bg-white/[0.07]"
          />
          {loading ? (
            <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-primary" />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-foreground/70 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* Type filters */}
        <div className="mt-4 flex justify-center gap-2">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeSel(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                typeSel === t
                  ? "bg-primary text-white shadow-md shadow-primary/25"
                  : "bg-white/5 text-foreground/70 hover:bg-white/10"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {searched && filtered.length ? (
        <>
          <p className="mt-8 text-sm text-muted-foreground">
            {total.toLocaleString()} result{total === 1 ? "" : "s"}
            {typeSel !== "All" ? ` · showing ${typeSel.toLowerCase()}` : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((t) => (
              <MediaCard key={`${t.type}-${t.id}`} item={t} />
            ))}
          </div>
          {page < totalPages ? (
            <div className="mt-10 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loading}
                className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-8 text-sm font-bold text-foreground transition hover:bg-primary hover:text-white disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load More"}
              </button>
            </div>
          ) : null}
        </>
      ) : searched && !loading && !failed ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <SearchIcon className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-lg font-bold">Nothing matched “{query.trim()}”</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Check the spelling, try a shorter phrase, or search in the original language — or
            let luck decide.
          </p>
          <button
            onClick={() => void random()}
            className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            <Dices className="h-4 w-4" /> Surprise Me
          </button>
        </div>
      ) : searched && failed ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-bold">Search failed</p>
          <p className="max-w-md text-sm text-muted-foreground">
            TMDB didn&apos;t respond. Check your connection and try again.
          </p>
        </div>
      ) : (
        // Empty state: trending suggestions
        <>
          {trending.length ? (
            <>
              <p className="mt-10 text-sm text-muted-foreground">Trending this week</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
                {trending.map((t) => (
                  <MediaCard key={`${t.type}-${t.id}`} item={t} />
                ))}
              </div>
            </>
          ) : null}
          <div className="mt-12 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <p className="max-w-md">
              Search across millions of movies and TV shows from TMDB. Try “Batman”, “Breaking
              Bad”, “Ghibli” or a director&apos;s name.
            </p>
            <button
              onClick={() => navigate({ name: "home" })}
              className="mt-2 rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-primary hover:text-white"
            >
              Back to Home
            </button>
          </div>
        </>
      )}
    </div>
  );
}
