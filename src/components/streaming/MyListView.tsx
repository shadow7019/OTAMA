"use client";

import { Bookmark, Trash2, Dices } from "lucide-react";
import { useStore, continueWatching } from "@/lib/store";
import { MediaCard } from "./MediaCard";

export function MyListView() {
  const navigate = useStore((s) => s.navigate);
  const watchlist = useStore((s) => s.watchlist);
  const progressMap = useStore((s) => s.progress);
  const clearProgress = useStore((s) => s.clearProgress);
  const random = useStore((s) => s.random);

  const resumeList = continueWatching();

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-14 pt-24 md:px-8 md:pt-28">
      <h1 className="text-2xl font-black tracking-tight md:text-3xl">My List</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Titles you saved to watch later — stored on this device.
      </p>

      {watchlist.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
          {watchlist.map((w) => (
            <MediaCard
              key={w.id}
              item={{
                id: w.tmdbId,
                type: w.type,
                name: w.name,
                year: w.year,
                rating: w.rating,
                poster: w.poster,
                backdrop: w.backdrop,
                overview: "",
                full: w.full,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
          <Bookmark className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-lg font-bold">Your list is empty</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Hit the <span className="font-semibold text-foreground">+</span> button on any poster
            to save it here for later.
          </p>
          <button
            onClick={() => navigate({ name: "home" })}
            className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            Browse the Catalog
          </button>
        </div>
      )}

      {/* Continue watching management */}
      {resumeList.length ? (
        <section className="mt-14">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Continue Watching</h2>
            <button
              onClick={() => {
                resumeList.forEach((p) => clearProgress(p.id));
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-red-400/50 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear history
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
            {resumeList.map((p) => {
              const pct = p.duration ? (p.seconds / p.duration) * 100 : 0;
              const epLabel =
                p.season && p.episode ? `S${p.season} E${p.episode}` : undefined;
              return (
                <MediaCard
                  key={p.id}
                  item={{
                    id: p.tmdbId,
                    type: p.type,
                    name: p.name,
                    year: p.year,
                    rating: p.rating,
                    poster: p.poster,
                    backdrop: p.backdrop,
                    overview: "",
                    full: p.full,
                  }}
                  progressPct={pct}
                  episodeLabel={epLabel}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Random nudge */}
      <div className="mt-14 flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-8 text-center">
        <p className="text-lg font-bold">Can&apos;t decide what to watch?</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Roll the dice and let TMDB pick something popular for you — movies or shows, randomly
          chosen from thousands.
        </p>
        <button
          onClick={() => void random()}
          className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:scale-[1.03]"
        >
          <Dices className="h-4 w-4" /> Roll the Dice
        </button>
      </div>
    </div>
  );
}
