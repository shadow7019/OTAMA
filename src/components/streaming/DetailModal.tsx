"use client";

import { useEffect, useState } from "react";
import {
  X,
  Star,
  Play,
  Plus,
  Check,
  Clock,
  Calendar,
  Layers,
  ShieldCheck,
} from "lucide-react";
import {
  MediaDetails,
  MediaItem,
  getTitle,
  getYear,
  getMediaType,
  getDate,
  img,
  ratingColor,
  formatRuntime,
  formatDate,
  tmdb,
  trailerOf,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";
import { MediaCard } from "./MediaCard";

interface DetailModalProps {
  item: MediaItem | null;
  actions: MediaActions;
  onClose: () => void;
}

export function DetailModal({ item, actions, onClose }: DetailModalProps) {
  // remounted per item via key in parent — initial state is safe to derive
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(() => item !== null);
  const [error, setError] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [adFree, setAdFree] = useState(false);
  const mounted = useMounted();
  const watchlist = useMediaStore((s) => s.watchlist);
  const toggleWatchlist = useMediaStore((s) => s.toggleWatchlist);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    tmdb<MediaDetails>(`${getMediaType(item)}/${item.id}`, {
      append_to_response: "credits,videos,similar",
    })
      .then((d) => {
        if (!cancelled) {
          setDetails(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  // check for an ad-free public-domain stream (movies only)
  // (component remounts per item, so no reset-on-change needed)
  useEffect(() => {
    if (!item || getMediaType(item) !== "movie") return;
    let cancelled = false;
    fetch(
      `/api/archive?title=${encodeURIComponent(getTitle(item))}&year=${encodeURIComponent(getYear(item))}`
    )
      .then((r) => r.json())
      .then((j: { match?: unknown }) => {
        if (!cancelled) setAdFree(Boolean(j.match));
      })
      .catch(() => {
        if (!cancelled) setAdFree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  // lock body scroll while open
  useEffect(() => {
    if (!item) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  const inList = mounted
    ? item
      ? watchlist.some(
          (w) => w.id === item.id && w.media_type === getMediaType(item)
        )
      : false
    : false;

  if (!item) return null;

  const type = getMediaType(item);
  const title = details?.title || details?.name || getTitle(item);
  const backdrop = img(details?.backdrop_path || item.backdrop_path, "w1280");
  const poster = img(details?.poster_path || item.poster_path, "w500");
  const trailer = details ? trailerOf(details) : null;
  const cast = details?.credits?.cast?.slice(0, 14) ?? [];
  const similar = (details?.similar?.results ?? [])
    .filter((s) => s.poster_path && !s.adult)
    .slice(0, 14);
  const seasons = (details?.seasons ?? []).filter(
    (s) => s.season_number > 0 && s.episode_count > 0
  );

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} details`}
    >
      <div
        className="mx-auto my-6 w-[calc(100%-1.5rem)] max-w-4xl overflow-hidden rounded-2xl bg-[#12121a] shadow-2xl ring-1 ring-white/10 md:my-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero area */}
        <div className="relative">
          <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
            {backdrop ? (
              <img src={backdrop} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#12121a] via-transparent to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                type="button"
                onClick={() => actions.openPlayer(item)}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600/90 text-white shadow-2xl transition hover:scale-110 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label={`Play ${title}`}
              >
                <Play className="ml-1 h-7 w-7 fill-current" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur transition hover:bg-red-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-8 md:px-8">
          {loading && (
            <div className="space-y-3 py-6" data-testid="detail-loading">
              <div className="h-8 w-2/3 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
              <div className="h-20 w-full animate-pulse rounded bg-zinc-800" />
            </div>
          )}

          {error && (
            <div className="my-6 rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-300 ring-1 ring-red-900">
              Failed to load details: {error}
            </div>
          )}

          {details && !loading && (
            <>
              <div className="-mt-12 flex items-end gap-4 md:-mt-16">
                {poster && (
                  <div className="hidden w-[130px] shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15 shadow-xl sm:block">
                    <img src={poster} alt={title} className="w-full" />
                  </div>
                )}
                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="text-2xl font-black leading-tight text-white md:text-3xl">
                    {title}
                  </h2>
                  {details.tagline && (
                    <p className="mt-1 text-sm italic text-red-400">{details.tagline}</p>
                  )}
                </div>
              </div>

              {/* Meta row */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-400">
                {details.vote_average ? (
                  <span className="flex items-center gap-1 font-semibold">
                    <Star className={`h-4 w-4 fill-current ${ratingColor(details.vote_average)}`} />
                    <span className={ratingColor(details.vote_average)}>
                      {details.vote_average.toFixed(1)}
                    </span>
                    {details.vote_count ? (
                      <span className="font-normal text-zinc-500">
                        ({details.vote_count.toLocaleString()})
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {getDate(details) && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> {formatDate(getDate(details))}
                  </span>
                )}
                {type === "movie" && details.runtime ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> {formatRuntime(details.runtime)}
                  </span>
                ) : null}
                {type === "tv" && details.number_of_seasons ? (
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> {details.number_of_seasons} season
                    {details.number_of_seasons > 1 ? "s" : ""} ·{" "}
                    {details.number_of_episodes ?? "?"} episodes
                  </span>
                ) : null}
                <span className="rounded border border-zinc-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-300">
                  {type === "tv" ? "Series" : "Movie"}
                </span>
                {details.status && (
                  <span className="text-xs uppercase tracking-wide text-zinc-500">
                    {details.status.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {/* Genres */}
              {details.genres?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {details.genres.map((g) => (
                    <span
                      key={g.id}
                      className="rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-zinc-300 ring-1 ring-white/10"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Actions */}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => actions.openPlayer(item)}
                  className="flex items-center gap-2 rounded-md bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Play className="h-4 w-4 fill-current" /> Watch Now
                </button>
                {trailer && (
                  <button
                    type="button"
                    onClick={() => setShowTrailer((v) => !v)}
                    className="flex items-center gap-2 rounded-md border border-white/20 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/50"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
                    </svg>
                    {showTrailer ? "Hide Trailer" : "Watch Trailer"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleWatchlist(item)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    inList
                      ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/50"
                      : "bg-white/10 text-zinc-100 hover:bg-white/20"
                  }`}
                >
                  {inList ? (
                    <>
                      <Check className="h-4 w-4" /> In My List
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" /> My List
                    </>
                  )}
                </button>
              </div>

              {/* Ad-free availability (public-domain direct stream) */}
              {adFree && getMediaType(item) === "movie" && (
                <button
                  type="button"
                  onClick={() => actions.openPlayer(item)}
                  className="mt-3 flex w-fit items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-600/40 transition hover:bg-emerald-600/25"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Ad-free version available — direct public-domain stream (archive.org)
                </button>
              )}

              {/* Trailer embed */}
              {showTrailer && trailer && (
                <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-white/10">
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                      title={`${title} trailer`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                </div>
              )}

              {/* Overview */}
              {details.overview && (
                <div className="mt-5">
                  <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wider text-zinc-500">
                    Storyline
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-300">{details.overview}</p>
                </div>
              )}

              {/* Seasons (TV) */}
              {type === "tv" && seasons.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
                    Seasons
                  </h3>
                  <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 thin-scrollbar sm:grid-cols-2">
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => actions.openPlayer(item, s.season_number, 1)}
                        className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-red-600/15 hover:ring-red-600/40"
                      >
                        <span className="text-sm font-semibold text-zinc-200">{s.name}</span>
                        <span className="text-xs text-zinc-500">
                          {s.episode_count} ep{s.episode_count > 1 ? "s" : ""}
                          {s.air_date ? ` · ${s.air_date.slice(0, 4)}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cast */}
              {cast.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
                    Top Cast
                  </h3>
                  <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                    {cast.map((c) => (
                      <div key={c.id} className="w-20 shrink-0 text-center">
                        <div className="mb-1.5 aspect-square w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
                          {img(c.profile_path, "w200") ? (
                            <img
                              src={img(c.profile_path, "w200") as string}
                              alt={c.name}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg font-bold text-zinc-600">
                              {c.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-200">
                          {c.name}
                        </p>
                        {c.character && (
                          <p className="line-clamp-1 text-[10px] text-zinc-500">{c.character}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar */}
              {similar.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-zinc-500">
                    More Like This
                  </h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {similar.map((s) => (
                      <MediaCard
                        key={s.id}
                        item={{ ...s, media_type: type }}
                        actions={{
                          openDetail: actions.openDetail,
                          openPlayer: actions.openPlayer,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
