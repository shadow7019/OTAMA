"use client";

import { useEffect, useRef, useState } from "react";
import {
  Flame,
  Film,
  Tv,
  Trophy,
  Calendar,
  Clock,
  Sparkles,
  Radio,
  History,
} from "lucide-react";
import {
  MediaItem,
  PagedResponse,
  tmdb,
  ListEntry,
  getYear,
  img,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";
import { MediaRow } from "./MediaRow";
import { HeroCarousel } from "./HeroCarousel";

interface HomeViewProps {
  actions: MediaActions;
  onTrailer: (item: MediaItem, key: string) => void;
}

interface RowConfig {
  key: string;
  title: string;
  path: string;
  icon: React.ReactNode;
}

const ROWS: RowConfig[] = [
  { key: "trending", title: "Trending Now", path: "trending/all/day", icon: <Flame className="h-5 w-5" /> },
  { key: "pop-movies", title: "Popular Movies", path: "movie/popular", icon: <Film className="h-5 w-5" /> },
  { key: "top-movies", title: "Top Rated Movies", path: "movie/top_rated", icon: <Trophy className="h-5 w-5" /> },
  { key: "pop-tv", title: "Popular TV Shows", path: "tv/popular", icon: <Tv className="h-5 w-5" /> },
  { key: "airing", title: "Airing This Week", path: "tv/on_the_air", icon: <Radio className="h-5 w-5" /> },
  { key: "now-playing", title: "In Theaters", path: "movie/now_playing", icon: <Sparkles className="h-5 w-5" /> },
  { key: "upcoming", title: "Coming Soon", path: "movie/upcoming", icon: <Calendar className="h-5 w-5" /> },
  { key: "top-tv", title: "Top Rated TV", path: "tv/top_rated", icon: <Trophy className="h-5 w-5" /> },
  { key: "airing-today", title: "Airing Today", path: "tv/airing_today", icon: <Clock className="h-5 w-5" /> },
];

function LazyRow({ config, actions }: { config: RowConfig; actions: MediaActions }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state === "idle") {
          setState("loading");
          tmdb<PagedResponse<MediaItem>>(config.path)
            .then((res) => {
              const fallbackType = config.path.startsWith("tv") ? "tv" : "movie";
              const media = res.results.filter(
                (r) => (r.media_type === undefined || r.media_type === "movie" || r.media_type === "tv") && !r.adult && r.poster_path
              ).map((r) => ({ ...r, media_type: r.media_type ?? fallbackType }));
              setItems(media.slice(0, 20));
              setState("done");
            })
            .catch(() => setState("error"));
        }
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [config.path, state]);

  return (
    <div ref={ref}>
      {state === "done" && items.length > 0 ? (
        <MediaRow title={config.title} items={items} actions={actions} icon={config.icon} />
      ) : (
        <section className="py-3" aria-label={`${config.title} (loading)`}>
          <div className="mb-1 flex items-center gap-2 px-4 md:px-8">
            <span className="text-red-500">{config.icon}</span>
            <h2 className="text-lg font-bold tracking-tight text-zinc-100 md:text-xl">
              {config.title}
            </h2>
          </div>
          {state !== "error" && (
            <div className="no-scrollbar flex gap-3 overflow-hidden px-4 py-2 md:gap-4 md:px-8">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-[136px] shrink-0 sm:w-[152px] md:w-[168px]">
                  <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-zinc-800/50" />
                  <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-zinc-800/40" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ContinueWatchingRow({ actions }: { actions: MediaActions }) {
  const mounted = useMounted();
  const store = useMediaStore();
  const entries: ListEntry[] = mounted ? store.continueWatching : [];

  if (!entries.length) return null;

  return (
    <section className="py-3" aria-label="Continue watching">
      <div className="mb-1 flex items-center justify-between px-4 md:px-8">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-100 md:text-xl">
          <span className="text-red-500">
            <History className="h-5 w-5" />
          </span>
          Continue Watching
        </h2>
        <button
          type="button"
          onClick={() => store.clearContinue()}
          className="text-xs font-semibold text-zinc-500 transition hover:text-red-400"
        >
          Clear history
        </button>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-2 md:gap-4 md:px-8">
        {entries.map((entry) => (
          <div
            key={`${entry.media_type}-${entry.id}`}
            className="group relative w-[220px] shrink-0 sm:w-[260px]"
          >
            <button
              type="button"
              onClick={() =>
                actions.openPlayer(
                  {
                    id: entry.id,
                    media_type: entry.media_type,
                    title: entry.title,
                    name: entry.title,
                    poster_path: entry.poster_path,
                    backdrop_path: entry.backdrop_path,
                    vote_average: entry.vote_average,
                    release_date: entry.release_date,
                    first_air_date: entry.release_date,
                  },
                  entry.season,
                  entry.episode
                )
              }
              className="block w-full text-left focus-visible:outline-none"
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10 transition group-hover:ring-2 group-hover:ring-red-500/80">
                {img(entry.backdrop_path, "w780") ? (
                  <img
                    src={img(entry.backdrop_path, "w780") as string}
                    alt={entry.title}
                    className="h-full w-full object-cover"
                  />
                ) : img(entry.poster_path, "w300") ? (
                  <img
                    src={img(entry.poster_path, "w300") as string}
                    alt={entry.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    {entry.title}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white">
                    ▶
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2.5">
                  <p className="truncate text-sm font-bold text-white">{entry.title}</p>
                  <p className="text-xs text-zinc-400">
                    {entry.media_type === "tv"
                      ? `S${entry.season ?? 1} · E${entry.episode ?? 1}`
                      : getYear({ release_date: entry.release_date, id: entry.id, title: entry.title }) || "Movie"}
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              aria-label={`Remove ${entry.title} from continue watching`}
              onClick={() => store.removeContinue(entry.id, entry.media_type)}
              className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-black/80 text-zinc-300 transition hover:bg-red-600 hover:text-white group-hover:flex"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomeView({ actions, onTrailer }: HomeViewProps) {
  return (
    <div className="pb-10">
      <HeroCarousel actions={actions} onTrailer={onTrailer} />
      <ContinueWatchingRow actions={actions} />
      {ROWS.map((row) => (
        <LazyRow key={row.key} config={row} actions={actions} />
      ))}
    </div>
  );
}
