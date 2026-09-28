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
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 via-zinc-900 to-fuchsia-950/70 p-3 text-center"
          role="img"
          aria-label={`${alt} — no artwork available`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10">
            <Film className="h-5 w-5 text-fuchsia-300/80" aria-hidden />
          </span>
          <span className="line-clamp-4 text-xs font-semibold leading-snug text-zinc-300">{alt}</span>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<string, string> = { movie: 'Movie', tv: 'TV', anime: 'Anime' }

/**
 * chillflix-style card: framed poster with hover play chip, and the meta
 * (title, rating, year, type) rendered UNDER the poster.
 */
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
        'group w-full min-h-[44px] text-left focus-visible:outline-none',
        className,
      )}
      aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-card ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.035] group-hover:ring-fuchsia-400/70 group-hover:shadow-lg group-hover:shadow-fuchsia-500/10 group-focus-visible:ring-2 group-focus-visible:ring-fuchsia-400">
        <Poster src={item.poster} alt={item.title} />
        {/* hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-lg">
            <Play className="h-5 w-5 fill-white" />
          </span>
        </div>
        {item.rating ? (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
            {item.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="px-0.5 pt-2">
        <p className="line-clamp-1 text-[13px] font-semibold leading-tight text-zinc-100">{item.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
          {item.year ? <span>{item.year}</span> : null}
          <span className="rounded border border-white/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {KIND_LABEL[item.kind] || 'Movie'}
          </span>
        </p>
      </div>
    </button>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-white/5">
      <div className="aspect-[2/3] animate-pulse bg-zinc-800/60" />
    </div>
  )
}

export function QualityBadge({ quality, className }: { quality?: string; className?: string }) {
  if (!quality) return null
  const q = quality.toUpperCase()
  const tone =
    q.includes('2160')
      ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40'
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
  const tone = n >= 50 ? 'text-emerald-400' : n >= 5 ? 'text-fuchsia-400' : 'text-red-400'
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
