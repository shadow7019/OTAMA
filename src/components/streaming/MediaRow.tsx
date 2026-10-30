"use client";

import { memo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem } from "@/lib/tmdb";
import { MediaActions } from "./types";
import { MediaCard } from "./MediaCard";

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  actions: MediaActions;
  icon?: React.ReactNode;
  badge?: string;
}

function MediaRowBase({ title, items, actions, icon, badge }: MediaRowProps) {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 300), behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <section className="group/row relative py-3" aria-label={title}>
      <div className="mb-1 flex items-center justify-between px-4 md:px-8">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-100 md:text-xl">
          {icon && <span className="text-red-500">{icon}</span>}
          {title}
        </h2>
        <div className="hidden items-center gap-1.5 md:flex">
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            onClick={() => scroll(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-200 opacity-0 transition hover:bg-red-600 hover:text-white group-hover/row:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            onClick={() => scroll(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-200 opacity-0 transition hover:bg-red-600 hover:text-white group-hover/row:opacity-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 py-2 md:gap-4 md:px-8"
      >
        {items.map((item) => (
          <MediaCard
            key={`${item.id}-${item.media_type ?? "m"}`}
            item={item}
            actions={actions}
            badge={badge}
            className="w-[136px] shrink-0 snap-start sm:w-[152px] md:w-[168px]"
          />
        ))}
      </div>
    </section>
  );
}

export const MediaRow = memo(MediaRowBase);
