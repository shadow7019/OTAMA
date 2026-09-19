'use client'

import { useState } from 'react'
import { Star, Play, Film } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MetaItem } from '@/lib/types'

/**
 * Poster image with a branded no-artwork fallback. When the poster URL is
 * missing/broken (Cinemeta's metahub serves an HTML error page for titles
 * without artwork), we render an intentional OTAMA-style card — film icon +
 * the title — instead of a grey "initials" placeholder.
 */
export function Poster({
  src,
  alt,
  className,
  ratio = 'aspect-[2/3]',
}: {
  src?: string
  alt: string
  className?: string
  ratio?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn('relative overflow-hidden', ratio, className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 via-zinc-900 to-amber-950/70 p-3 text-center"
          role="img"
          aria-label={`${alt} — no artwork available`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10">
            <Film className="h-5 w-5 text-amber-300/80" aria-hidden />
          </span>
          <span className="line-clamp-4 text-xs font-semibold leading-snug text-zinc-300">{alt}</span>
        </div>
      )}
    </div>
  )
}

export function MediaCard({
  item,
  onClick,
  className,
}: {
  item: MetaItem
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-xl overflow-hidden ring-1 ring-white/5 bg-card transition-all duration-200 hover:ring-amber-400/60 hover:shadow-lg hover:shadow-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:scale-[1.02] min-h-[44px]',
        className,
      )}
      aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}
    >
      <Poster src={item.poster} alt={item.title} />
      {/* hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg">
          <Play className="h-5 w-5 fill-black" />
        </span>
      </div>
      {item.rating ? (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-amber-300 backdrop-blur">
          <Star className="h-3 w-3 fill-amber-300" />
          {item.rating.toFixed(1)}
        </span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-3 pt-6 bg-gradient-to-t from-black/95 to-transparent">
        <p className="text-sm font-semibold leading-tight line-clamp-1">{item.title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {item.year || ''}
          {item.kind === 'anime' ? ' · Anime' : item.kind === 'tv' ? ' · TV' : ''}
        </p>
      </div>
    </button>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden ring-1 ring-white/5">
      <div className="aspect-[2/3] bg-zinc-800/60 animate-pulse" />
    </div>
  )
}

export function QualityBadge({ quality, className }: { quality?: string; className?: string }) {
  if (!quality) return null
  const q = quality.toUpperCase()
  const tone =
    q.includes('2160')
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : q.includes('1080')
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
        : q.includes('720')
          ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
          : 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40'
  return (
    <Badge variant="outline" className={cn('text-[10px] font-bold px-1.5', tone, className)}>
      {q}
    </Badge>
  )
}

export function Seeds({ count, leechers }: { count?: number; leechers?: number }) {
  const n = count || 0
  const tone = n >= 50 ? 'text-emerald-400' : n >= 5 ? 'text-amber-400' : 'text-red-400'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn('inline-flex items-center gap-1', tone)}>
        <span aria-hidden>▲</span>
        {n}
      </span>
      {leechers != null && (
        <span className="text-zinc-500">
          <span aria-hidden>▼</span>
          {leechers}
        </span>
      )}
    </span>
  )
}
