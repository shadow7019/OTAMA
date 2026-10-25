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
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 via-zinc-900 to-red-950/60 p-3 text-center"
          role="img"
          aria-label={`${alt} — no artwork available`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e50914]/30 bg-[#e50914]/10">
            <Film className="h-5 w-5 text-red-300/80" aria-hidden />
          </span>
          <span className="line-clamp-4 text-xs font-semibold leading-snug text-zinc-300">{alt}</span>
        </div>
      )}
    </div>
  )
}

/** Red "TOP 10" ribbon badge pinned to the tile's top-left corner (reference photo). */
export function TopTenBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        'absolute left-0 top-0 z-10 flex flex-col items-center justify-center rounded-tl-xl rounded-br-xl bg-[#e50914] px-1.5 py-1 leading-none text-white shadow-md shadow-black/40',
        className,
      )}
      aria-label={`Number ${rank} today`}
    >
      <span className="text-[8px] font-bold tracking-[0.08em]">TOP</span>
      <span className="text-base font-black">{rank}</span>
    </span>
  )
}

const KIND_LABEL: Record<string, string> = { movie: 'Movie', tv: 'TV', anime: 'Anime' }

/**
 * Two card shapes:
 *  - `tile` — the Netflix 2025 landscape 16:9 thumbnail (reference photo): no
 *    text underneath, title reveals on hover, optional TOP-10 corner ribbon.
 *  - `poster` (default) — framed portrait poster with meta underneath.
 */
export function MediaCard({
  item,
  onClick,
  className,
  variant = 'poster',
  rank,
}: {
  item: MetaItem
  onClick?: () => void
  className?: string
  variant?: 'poster' | 'tile'
  rank?: number
}) {
  if (variant === 'tile') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'group relative w-full min-h-[44px] text-left focus-visible:outline-none',
          className,
        )}
        aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}
      >
        <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-white/40 group-hover:shadow-xl group-hover:shadow-black/50 group-focus-visible:ring-2 group-focus-visible:ring-[#e50914]">
          <Poster src={item.backdrop || item.poster} alt={item.title} ratio="aspect-video" />
          {rank ? <TopTenBadge rank={rank} /> : null}
          {/* hover reveal: gradient + title + play chip; always visible on
              touch devices where hover never fires (@media hover:none) */}
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow">{item.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                  {item.year ? <span>{item.year}</span> : null}
                  {item.rating ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" aria-hidden />
                      {item.rating.toFixed(1)}
                    </span>
                  ) : null}
                  <span className="uppercase tracking-wide text-zinc-400">{KIND_LABEL[item.kind] || 'Movie'}</span>
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-lg">
                <Play className="h-4 w-4 fill-black text-black" aria-hidden />
              </span>
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full min-h-[44px] text-left focus-visible:outline-none',
        className,
      )}
      aria-label={`${item.title}${item.year ? ` (${item.year})` : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-card ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.035] group-hover:ring-white/40 group-hover:shadow-lg group-hover:shadow-black/40 group-focus-visible:ring-2 group-focus-visible:ring-[#e50914]">
        <Poster src={item.poster} alt={item.title} />
        {/* hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg">
            <Play className="h-5 w-5 fill-black text-black" />
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

export function MediaCardSkeleton({ variant = 'poster' }: { variant?: 'poster' | 'tile' }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-white/5">
      <div className={variant === 'tile' ? 'aspect-video animate-pulse bg-zinc-800/60' : 'aspect-[2/3] animate-pulse bg-zinc-800/60'} />
    </div>
  )
}

export function QualityBadge({ quality, className }: { quality?: string; className?: string }) {
  if (!quality) return null
  const q = quality.toUpperCase()
  const tone =
    q.includes('2160')
      ? 'bg-[#e50914]/20 text-red-300 border-[#e50914]/40'
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
