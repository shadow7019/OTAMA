"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Info, ChevronLeft, ChevronRight, Star, Flame } from "lucide-react";
import {
  MediaItem,
  getTitle,
  getYear,
  getDate,
  getMediaType,
  img,
  ratingColor,
  tmdb,
  PagedResponse,
} from "@/lib/tmdb";
import { MediaActions } from "./types";
import { useToast } from "@/hooks/use-toast";

interface HeroCarouselProps {
  actions: MediaActions;
  onTrailer: (item: MediaItem, videoKey: string) => void;
}

export function HeroCarousel({ actions, onTrailer }: HeroCarouselProps) {
  const { toast } = useToast();
  const [slides, setSlides] = useState<MediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    tmdb<PagedResponse<MediaItem>>("trending/all/week", {}, controller.signal)
      .then((res) => {
        const filtered = res.results
          .filter(
            (r) =>
              (r.media_type === "movie" || r.media_type === "tv") &&
              r.backdrop_path &&
              (r.title || r.name) &&
              !r.adult
          )
          .slice(0, 6);
        setSlides(filtered);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const next = useCallback(() => setIndex((i) => (i + 1) % Math.max(slides.length, 1)), [slides.length]);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + slides.length) % Math.max(slides.length, 1)),
    [slides.length]
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    timer.current = setInterval(next, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, next, slides.length]);

  if (!slides.length) {
    return (
      <div className="relative flex h-[52vh] min-h-[380px] w-full items-end bg-zinc-900/60 md:h-[72vh]">
        <div className="animate-pulse px-4 pb-16 md:px-12 md:pb-20">
          <div className="mb-4 h-4 w-24 rounded bg-zinc-700/60" />
          <div className="mb-3 h-12 w-72 rounded bg-zinc-700/60 md:h-16 md:w-[560px]" />
          <div className="h-4 w-full max-w-xl rounded bg-zinc-800/60" />
          <div className="mt-2 h-4 w-2/3 max-w-md rounded bg-zinc-800/60" />
        </div>
      </div>
    );
  }

  const item = slides[index];
  const type = getMediaType(item);
  const backdrop = img(item.backdrop_path, "original");
  const poster = img(item.poster_path, "w500");

  return (
    <section
      className="group relative h-[58vh] min-h-[420px] w-full overflow-hidden md:h-[78vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Trending titles"
    >
      {/* Backdrop layers */}
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={i !== index}
        >
          {img(slide.backdrop_path, "original") && (
            <img
              src={img(slide.backdrop_path, "original") as string}
              alt=""
              className={`h-full w-full object-cover object-top transition-transform duration-[8000ms] ease-out ${
                i === index ? "scale-105" : "scale-100"
              }`}
            />
          )}
        </div>
      ))}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b10] via-[#0b0b10]/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b10]/95 via-[#0b0b10]/50 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex items-end">
        <div className="flex w-full items-end gap-6 px-4 pb-14 md:px-12 md:pb-20 lg:gap-10">
          {poster && (
            <div className="hidden w-[180px] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15 shadow-2xl lg:block xl:w-[220px]">
              <img src={poster} alt={getTitle(item)} className="w-full object-cover" />
            </div>
          )}
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <Flame className="h-3 w-3" /> Trending #{index + 1}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-200 backdrop-blur">
                {type === "tv" ? "TV Series" : "Movie"}
              </span>
              {item.vote_average ? (
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Star className={`h-4 w-4 fill-current ${ratingColor(item.vote_average)}`} />
                  <span className={ratingColor(item.vote_average)}>
                    {item.vote_average.toFixed(1)}
                  </span>
                </span>
              ) : null}
              <span className="text-sm text-zinc-400">
                {getYear(item)} {getDate(item) ? `• ${new Date(getDate(item) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </span>
            </div>

            <h1 className="mb-3 text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg md:text-5xl xl:text-6xl">
              {getTitle(item)}
            </h1>

            <p className="mb-6 line-clamp-3 max-w-xl text-sm leading-relaxed text-zinc-300 drop-shadow md:mb-8 md:text-base">
              {item.overview}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => actions.openPlayer(item)}
                className="flex items-center gap-2 rounded-md bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-red-600/25 transition hover:bg-red-500 hover:shadow-red-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:px-8"
              >
                <Play className="h-4 w-4 fill-current" /> Watch Now
              </button>
              <button
                type="button"
                onClick={() => actions.openDetail(item)}
                className="flex items-center gap-2 rounded-md bg-white/15 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Info className="h-4 w-4" /> More Info
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const d = await tmdb<{ videos?: { results: { key: string; site: string; type: string }[] } }>(
                      `${type}/${item.id}`
                    );
                    const v = d.videos?.results?.find(
                      (x) => x.site === "YouTube" && (x.type === "Trailer" || x.type === "Teaser")
                    );
                    if (v) onTrailer(item, v.key);
                    else
                      toast({
                        title: "No trailer available",
                        description: `${getTitle(item)} doesn't have a trailer on TMDB yet.`,
                      });
                  } catch {
                    toast({ title: "Couldn't load trailer", variant: "destructive" });
                  }
                }}
                className="hidden items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-white/50 hover:text-white md:flex"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
                </svg>
                Trailer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Arrows */}
      <button
        type="button"
        aria-label="Previous slide"
        onClick={prev}
        className="absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 md:flex"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={next}
        className="absolute right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 md:flex"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 md:bottom-6 md:right-12">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-6 bg-red-600" : "w-1.5 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
