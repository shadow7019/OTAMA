'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MediaCard } from '@/components/otama/media-card'
import { Button } from '@/components/ui/button'
import type { MetaItem } from '@/lib/types'

export function MediaRow({
  title,
  items,
  loading,
  onSelect,
  accent,
}: {
  title: string
  items: MetaItem[]
  loading?: boolean
  onSelect?: (item: MetaItem) => void
  accent?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: 'smooth' })
  }
  if (!loading && items.length === 0) return null
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-bold tracking-tight">
          {title}
          {accent ? <span className="text-amber-400"> {accent}</span> : null}
        </h2>
        <div className="hidden sm:flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div ref={scroller} className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[130px] sm:w-[150px] shrink-0">
                <div className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse" />
              </div>
            ))
          : items.map((item) => (
              <div key={`${item.refId}-${item.title}`} className="w-[130px] sm:w-[150px] shrink-0">
                <MediaCard item={item} onClick={() => onSelect?.(item)} />
              </div>
            ))}
      </div>
    </section>
  )
}
