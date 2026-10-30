"use client";

import { memo } from "react";
import { Star, Play, Info } from "lucide-react";
import { MediaItem, getTitle, getYear, img, ratingColor, getMediaType } from "@/lib/tmdb";
import { MediaActions } from "./types";

interface MediaCardProps {
  item: MediaItem;
  actions: MediaActions;
  className?: string;
  badge?: string;
  onRemove?: () => void;
}

function MediaCardBase({ item, actions, className = "", badge, onRemove }: MediaCardProps) {
  const title = getTitle(item);
  const year = getYear(item);
  const type = getMediaType(item);
  const poster = img(item.poster_path, "w300");
  const vote = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <div className={`group relative ${className}`} data-testid="media-card">
      <button
        type="button"
        aria-label={`View details for ${title}`}
        onClick={() => actions.openDetail(item)}
        className="block w-full text-left focus-visible:outline-none"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-zinc-800/60 ring-1 ring-white/10 transition-all duration-300 group-hover:ring-2 group-hover:ring-red-500/80 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)] group-focus-visible:ring-2 group-focus-visible:ring-red-500">
          {poster ? (
            <img
              src={poster}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 p-3">
              <span className="line-clamp-4 text-center text-sm font-medium text-zinc-400">
                {title}
              </span>
            </div>
          )}

          {/* hover overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg">
              <Play className="h-3.5 w-3.5 fill-current" /> Watch
            </span>
            <span className="flex items-center gap-1 text-[11px] text-zinc-300">
              <Info className="h-3 w-3" /> Details
            </span>
          </div>

          {/* badges */}
          <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
            {badge && (
              <span className="rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {badge}
              </span>
            )}
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 backdrop-blur">
              {type === "tv" ? "Series" : "Movie"}
            </span>
          </div>
          {vote && (
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 backdrop-blur">
              <Star className={`h-3 w-3 fill-current ${ratingColor(item.vote_average)}`} />
              <span className={`text-[11px] font-semibold ${ratingColor(item.vote_average)}`}>
                {vote}
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 px-0.5">
          <h3 className="line-clamp-1 text-sm font-medium text-zinc-100 transition-colors group-hover:text-white">
            {title}
          </h3>
          <p className="text-xs text-zinc-500">{year || "—"}</p>
        </div>
      </button>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${title} from list`}
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-black/80 text-zinc-300 backdrop-blur transition hover:bg-red-600 hover:text-white group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export const MediaCard = memo(MediaCardBase);
