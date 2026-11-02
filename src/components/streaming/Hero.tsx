"use client";

import { useEffect, useState } from "react";
import { Play, Info, Plus, Check, Star, Dices, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { type MediaItem } from "@/lib/tmdb-constants";
import { cn } from "@/lib/utils";

type Props = {
  items: MediaItem[];
  loading?: boolean;
};

export function Hero({ items, loading }: Props) {
  const navigate = useStore((s) => s.navigate);
  const toggleWatchlist = useStore((s) => s.toggleWatchlist);
  const watchlist = useStore((s) => s.watchlist);
  const random = useStore((s) => s.random);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 9000);
    return () => clearInterval(t);
  }, [items.length]);

  if (loading || !items.length) {
    return (
      <section
        aria-label="Featured titles"
        className="relative flex h-[78vh] min-h-[520px] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-900 via-background to-black md:h-[86vh]"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading today&apos;s picks…</p>
        </div>
      </section>
    );
  }

  const current = items[index % items.length];
  const inList = watchlist.some((w) => w.id === `${current.type}-${current.id}`);
  const src = current.backdrop || current.poster;

  return (
    <section
      aria-label="Featured titles"
      className="relative h-[78vh] min-h-[520px] w-full overflow-hidden md:h-[86vh]"
    >
      {/* Backdrops */}
      {items.map((t, i) => {
        const s = t.backdrop || t.poster;
        return (
          <div
            key={`${t.type}-${t.id}`}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000",
              i === index ? "opacity-100" : "opacity-0"
            )}
          >
            <img
              src={s}
              alt=""
              className={cn("h-full w-full object-cover", !t.backdrop && "scale-110 blur-lg")}
              draggable={false}
            />
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/30 to-transparent" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-end px-4 pb-16 md:justify-center md:px-8 md:pb-0">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded bg-primary px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-white">
              Trending #{(index % items.length) + 1}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70">
              {current.type === "tv" ? "TV Series" : "Movie"}
              {current.full ? " • Free full movie" : ""}
            </span>
          </div>

          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-lg md:text-6xl">
            {current.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-foreground/80">
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <Star className="h-4 w-4 fill-amber-400" /> {current.rating.toFixed(1)}
            </span>
            <span aria-hidden>•</span>
            <span>{current.year ?? "—"}</span>
            <span aria-hidden>•</span>
            <span className="capitalize">{current.type === "tv" ? "Series" : "Film"}</span>
          </div>

          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-foreground/80 md:text-[15px]">
            {current.overview}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                navigate({ name: "watch", type: current.type, id: String(current.id) })
              }
              className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-bold text-white shadow-xl shadow-primary/30 transition hover:scale-[1.03] hover:bg-primary/90"
            >
              <Play className="h-5 w-5 fill-white" /> {current.full ? "Watch Full Movie" : "Play Now"}
            </button>
            <button
              onClick={() =>
                navigate({ name: "detail", type: current.type, id: String(current.id) })
              }
              className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-6 text-base font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <Info className="h-5 w-5" /> More Info
            </button>
            <button
              onClick={() => toggleWatchlist(current)}
              aria-label={inList ? "Remove from My List" : "Add to My List"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            >
              {inList ? <Check className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Indicators */}
        <div className="absolute bottom-6 right-4 flex gap-2 md:bottom-10 md:right-8">
          {items.map((t, i) => (
            <button
              key={`${t.type}-${t.id}`}
              onClick={() => setIndex(i)}
              aria-label={`Show ${t.name}`}
              aria-current={i === index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-8 bg-primary" : "w-3 bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
          <button
            onClick={() => void random()}
            aria-label="Random title"
            title="Surprise me"
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/80 hover:text-primary"
          >
            <Dices className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
