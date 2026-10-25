'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MediaCard } from '@/components/otama/media-card'
import { Button } from '@/components/ui/button'
import { useAppStore, type View } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

/**
 * Netflix-style carousel row. `tile` renders the 2025 landscape 16:9 cards
 * from the reference photo (no text underneath, TOP-10 ribbon on ranked rows);
 * the classic portrait poster row is still available for compact contexts.
 */
export function MediaRow({
  title,
  items,
  loading,
  onSelect,
  accent,
  subtitle,
  exploreTo,
  exploreLabel,
  ranked,
  tile,
}: {
  title: string
  items: MetaItem[]
  loading?: boolean
  onSelect?: (item: MetaItem) => void
  accent?: string
  subtitle?: string
  exploreTo?: View
  exploreLabel?: string
  ranked?: boolean
  tile?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const setView = useAppStore((s) => s.setView)
  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  }
  if (!loading && items.length === 0) return null

  const cardWidth = tile ? 'w-[236px] shrink-0 sm:w-[272px] md:w-[300px]' : 'w-[130px] shrink-0 sm:w-[150px]'

  return (
    <section className="group/row space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className={tile ? 'text-xl font-bold tracking-tight md:text-2xl' : 'text-base font-semibold tracking-tight md:text-lg'}>
            {title}
            {accent ? <span className="text-[#e50914]"> {accent}</span> : null}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 hidden line-clamp-1 text-xs text-zinc-400 md:block">{subtitle}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {exploreTo ? (
            <button
              onClick={() => setView(exploreTo)}
              className="hidden items-center gap-0.5 text-sm font-medium text-zinc-300 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover/row:opacity-100 sm:flex"
              aria-label={`Explore all ${title}`}
            >
              {exploreLabel || 'Explore All'} <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
      <div ref={scroller} className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto scroll-smooth px-1 pb-1">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={cardWidth}>
                <div className={tile ? 'aspect-video animate-pulse rounded-xl bg-zinc-800/60' : 'aspect-[2/3] animate-pulse rounded-lg bg-zinc-800/60'} />
              </div>
            ))
          : items.map((item, i) =>
              tile ? (
                <div key={`${item.refId}-${item.title}`} className={cardWidth}>
                  <MediaCard item={item} variant="tile" rank={ranked ? i + 1 : undefined} onClick={() => onSelect?.(item)} />
                </div>
              ) : ranked ? (
                <div key={`${item.refId}-${item.title}`} className="flex w-[168px] shrink-0 items-end sm:w-[196px]">
                  <span
                    aria-hidden
                    className="-mr-4 select-none bg-gradient-to-b from-[#ff5252] via-[#e50914] to-[#7a0a0f] bg-clip-text text-[96px] font-black italic leading-[0.78] text-transparent drop-shadow-[0_2px_10px_rgba(229,9,20,0.3)] sm:-mr-5 sm:text-[112px]"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <MediaCard item={item} onClick={() => onSelect?.(item)} />
                  </div>
                </div>
              ) : (
                <div key={`${item.refId}-${item.title}`} className={cardWidth}>
                  <MediaCard item={item} onClick={() => onSelect?.(item)} />
                </div>
              ),
            )}
      </div>
    </section>
  )
}
