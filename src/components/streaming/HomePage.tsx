"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Sparkles,
  CalendarClock,
  Clock3,
  Ghost,
  Laugh,
  Rocket,
  Tv,
  Popcorn,
  MonitorPlay,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useStore, continueWatching } from "@/lib/store";
import type { MediaItem } from "@/lib/tmdb-constants";
import { Hero } from "./Hero";
import { ContentRow } from "./ContentRow";
import { MediaCard } from "./MediaCard";

type HomeData = {
  hero: MediaItem[];
  trending: MediaItem[];
  nowPlaying: MediaItem[];
  popularMovies: MediaItem[];
  topMovies: MediaItem[];
  popularTv: MediaItem[];
  topTv: MediaItem[];
  onAir: MediaItem[];
  animation: MediaItem[];
  scifi: MediaItem[];
  horror: MediaItem[];
  comedy: MediaItem[];
  classics: MediaItem[];
  error?: string;
};

export function HomePage() {
  const navigate = useStore((s) => s.navigate);
  const random = useStore((s) => s.random);
  const auth = useStore((s) => s.auth);
  const watchlist = useStore((s) => s.watchlist);
  const progressMap = useStore((s) => s.progress);

  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    fetch("/api/tmdb/home", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((d: HomeData) => setData(d))
      .catch(() => setFailed(true));
  };

  useEffect(load, []);

  const resumeList = useMemo(() => continueWatching(), [progressMap]);
  const myList = useMemo(
    () =>
      watchlist.map((w) => ({
        id: w.tmdbId,
        type: w.type,
        name: w.name,
        year: w.year,
        rating: w.rating,
        poster: w.poster,
        backdrop: w.backdrop,
        overview: "",
        full: w.full,
      })),
    [watchlist]
  );

  const loading = !data && !failed;

  const genreRow = (title: string, items: MediaItem[], genreId: number, icon: React.ReactNode, sub?: string) =>
    items.length ? (
      <ContentRow
        title={title}
        subtitle={sub}
        items={items}
        action={
          <div className="flex items-center gap-3">
            {icon}
            <button
              onClick={() => navigate({ name: "browse", kind: "movie", genre: genreId })}
              className="text-xs font-semibold text-primary hover:underline"
            >
              See all
            </button>
          </div>
        }
      />
    ) : null;

  return (
    <div>
      <Hero items={data?.hero || []} loading={loading} />

      <main className="relative z-10 -mt-10 space-y-10 pb-14 md:space-y-12">
        {/* Greeting strip */}
        <div className="flex items-center justify-between px-4 md:px-8">
          <div>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              {auth ? `Welcome back, ${auth.name}` : "Your streaming home"}
            </h2>
            <p className="text-xs text-muted-foreground md:text-sm">
              Thousands of movies &amp; shows · powered by TMDB · free classics included
            </p>
          </div>
          <button
            onClick={() => void random()}
            className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-foreground/85 transition hover:border-primary/60 hover:text-primary"
          >
            <Flame className="h-4 w-4" />
            <span className="hidden sm:inline">Random</span>
          </button>
        </div>

        {failed ? (
          <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center md:mx-8">
            <p className="text-lg font-bold">Couldn&apos;t reach TMDB</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The catalog service didn&apos;t respond. Check your connection and try again.
            </p>
            <button
              onClick={() => {
                setFailed(false);
                load();
              }}
              className="mt-1 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading the catalog…
          </div>
        ) : null}

        {data ? (
          <>
            {/* Continue watching */}
            {resumeList.length ? (
              <ContentRow
                title="Continue Watching"
                subtitle="Pick up where you left off"
                items={resumeList.map((p) => ({
                  id: p.tmdbId,
                  type: p.type,
                  name: p.name,
                  year: p.year,
                  rating: p.rating,
                  poster: p.poster,
                  backdrop: p.backdrop,
                  overview: "",
                  full: p.full,
                }))}
                progressFor={(t) => {
                  const p = resumeList.find((x) => x.id === `${t.type}-${t.id}`);
                  if (!p) return undefined;
                  const pct = p.duration ? (p.seconds / p.duration) * 100 : 0;
                  const label =
                    p.season && p.episode
                      ? `S${p.season} E${p.episode} · ${Math.floor(pct)}% watched`
                      : `${Math.floor(pct)}% watched`;
                  return { progressPct: pct, episodeLabel: label };
                }}
              />
            ) : null}

            {/* My List */}
            {myList.length ? (
              <ContentRow
                title="My List"
                subtitle="Saved for later"
                items={myList}
                action={
                  <button
                    onClick={() => navigate({ name: "mylist" })}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View all
                  </button>
                }
              />
            ) : null}

            <ContentRow
              title="Trending Now"
              subtitle="What the world is watching today"
              items={data.trending}
              action={<Flame className="h-5 w-5 text-primary/70" />}
            />

            <ContentRow
              title="In Theaters"
              subtitle="Now playing near you"
              items={data.nowPlaying}
              action={<Popcorn className="h-5 w-5 text-primary/50" />}
            />

            <ContentRow
              title="Popular Movies"
              items={data.popularMovies}
              action={<Clock3 className="h-5 w-5 text-primary/50" />}
            />

            <ContentRow
              title="Top Rated Movies"
              subtitle="The greatest of all time"
              items={data.topMovies}
            />

            <ContentRow
              title="Popular TV Shows"
              items={data.popularTv}
              action={<Tv className="h-5 w-5 text-primary/50" />}
            />

            <ContentRow
              title="Top Rated TV"
              subtitle="Series worth bingeing"
              items={data.topTv}
            />

            <ContentRow
              title="On The Air"
              subtitle="Fresh episodes this week"
              items={data.onAir}
              action={<MonitorPlay className="h-5 w-5 text-primary/50" />}
            />

            {/* Free classics — full movies */}
            {data.classics.length ? (
              <ContentRow
                title="Free Classics — Watch Full Movies"
                subtitle="Public-domain & open-licensed films you can stream start to finish"
                items={data.classics}
                action={<Sparkles className="h-5 w-5 text-emerald-400/80" />}
              />
            ) : null}

            {data.animation.length
              ? genreRow(
                  "Animation Spotlight",
                  data.animation,
                  16,
                  <Sparkles className="h-5 w-5 text-primary/50" />,
                  "Animated worlds for every age"
                )
              : null}
            {data.scifi.length
              ? genreRow(
                  "Science Fiction",
                  data.scifi,
                  878,
                  <Rocket className="h-5 w-5 text-primary/50" />
                )
              : null}
            {data.horror.length
              ? genreRow(
                  "Lights Off: Horror",
                  data.horror,
                  27,
                  <Ghost className="h-5 w-5 text-primary/50" />
                )
              : null}
            {data.comedy.length
              ? genreRow(
                  "Laugh Track: Comedy",
                  data.comedy,
                  35,
                  <Laugh className="h-5 w-5 text-primary/50" />
                )
              : null}

            {/* Genre quick grid */}
            <section className="px-4 md:px-8" aria-label="Browse by genre">
              <h2 className="mb-4 text-base font-bold md:text-lg">Browse Movies by Genre</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {[
                  ["Action", 28],
                  ["Adventure", 12],
                  ["Animation", 16],
                  ["Comedy", 35],
                  ["Crime", 80],
                  ["Documentary", 99],
                  ["Drama", 18],
                  ["Family", 10751],
                  ["Fantasy", 14],
                  ["History", 36],
                  ["Horror", 27],
                  ["Music", 10402],
                  ["Mystery", 9648],
                  ["Romance", 10749],
                  ["Science Fiction", 878],
                  ["Thriller", 53],
                  ["War", 10752],
                  ["Western", 37],
                ].map(([name, id]) => (
                  <button
                    key={String(name)}
                    onClick={() =>
                      navigate({ name: "browse", kind: "movie", genre: Number(id) })
                    }
                    className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-primary/40 hover:bg-white/[0.06]"
                  >
                    <p className="text-sm font-bold text-foreground group-hover:text-primary">
                      {name}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* Featured spotlight strip */}
            {data.topMovies.length >= 2 ? (
              <section className="px-4 md:px-8" aria-label="Editor's pick">
                <h2 className="mb-4 text-base font-bold md:text-lg">Editor&apos;s Pick</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {data.topMovies.slice(0, 2).map((t) => (
                    <div
                      key={`${t.type}-${t.id}`}
                      className="group flex gap-4 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-primary/30"
                    >
                      <MediaCard item={t} className="w-24 md:w-28" />
                      <div className="min-w-0 flex-1 py-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          {t.type === "tv" ? "TV Series" : "Movie"} · {t.year ?? ""}
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-base font-bold leading-snug">
                          {t.name}
                        </h3>
                        <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                          {t.overview}
                        </p>
                        <button
                          onClick={() =>
                            navigate({ name: "detail", type: t.type, id: String(t.id) })
                          }
                          className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-primary hover:text-white"
                        >
                          Learn more
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
