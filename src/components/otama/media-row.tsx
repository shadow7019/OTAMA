'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MediaCard } from '@/components/otama/media-card'
import { Button } from '@/components/ui/button'
import { useAppStore, type View } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

/**
 * chillflix-style carousel row: title + accent + optional subtitle, an
 * "Explore more" outline button and arrow scrollers on the right. Set
 * `ranked` to render a Top-10 row with big gradient rank numbers.
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
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const setView = useAppStore((s) => s.setView)
  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  }
  if (!loading && items.length === 0) return null
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight md:text-xl">
            {title}
            {accent ? <span className="text-fuchsia-400"> {accent}</span> : null}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 hidden line-clamp-1 text-xs text-zinc-400 md:block">{subtitle}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {exploreTo ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView(exploreTo)}
              className="h-9 border-white/15 bg-transparent px-3 text-sm text-zinc-200 hover:bg-white/10 hover:text-white"
            >
              {exploreLabel || 'Explore more'}
            </Button>
          ) : null}
          <div className="flex gap-1">
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
              <div key={i} className="w-[130px] shrink-0 sm:w-[150px]">
                <div className="aspect-[2/3] animate-pulse rounded-lg bg-zinc-800/60" />
              </div>
            ))
          : items.map((item, i) =>
              ranked ? (
                <div key={`${item.refId}-${item.title}`} className="flex w-[168px] shrink-0 items-end sm:w-[196px]">
                  <span
                    aria-hidden
                    className="-mr-4 select-none bg-gradient-to-b from-fuchsia-300/90 via-fuchsia-500/80 to-violet-700/90 bg-clip-text text-[96px] font-black italic leading-[0.78] text-transparent drop-shadow-[0_2px_10px_rgba(217,70,239,0.25)] sm:-mr-5 sm:text-[112px]"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <MediaCard item={item} onClick={() => onSelect?.(item)} />
                  </div>
                </div>
              ) : (
                <div key={`${item.refId}-${item.title}`} className="w-[130px] shrink-0 sm:w-[150px]">
                  <MediaCard item={item} onClick={() => onSelect?.(item)} />
                </div>
              ),
            )}
      </div>
    </section>
  )
}
