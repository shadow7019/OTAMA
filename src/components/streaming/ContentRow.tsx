"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard } from "./MediaCard";
import type { MediaItem } from "@/lib/tmdb-constants";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  items: MediaItem[];
  /** optional accessor for continue-watching card extras */
  progressFor?: (t: MediaItem) => { progressPct?: number; episodeLabel?: string } | undefined;
  action?: React.ReactNode;
  /** card width class override */
  cardWidth?: string;
};

export function ContentRow({ title, subtitle, items, progressFor, action, cardWidth }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [update, items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 300), behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <section aria-label={title} className="group/row relative">
      <div className="mb-3 flex items-end justify-between px-4 md:px-8">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground md:text-lg">
            {title}
          </h2>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>

      <div className="relative">
        {canLeft ? (
          <button
            onClick={() => scrollBy(-1)}
            aria-label={`Scroll ${title} left`}
            className="absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition group-hover/row:opacity-100 hover:bg-black/90 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {canRight ? (
          <button
            onClick={() => scrollBy(1)}
            aria-label={`Scroll ${title} right`}
            className="absolute right-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition group-hover/row:opacity-100 hover:bg-black/90 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}

        <div
          ref={scroller}
          onScroll={update}
          className={cn(
            "flex gap-3 overflow-x-auto px-4 pb-2 md:gap-4 md:px-8",
            "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
          )}
          style={{ scrollbarWidth: "thin" }}
        >
          {items.map((t) => {
            const extra = progressFor?.(t);
            return (
              <MediaCard
                key={`${t.type}-${t.id}`}
                item={t}
                className={cardWidth || "w-[136px] sm:w-[150px] md:w-[168px]"}
                progressPct={extra?.progressPct}
                episodeLabel={extra?.episodeLabel}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
