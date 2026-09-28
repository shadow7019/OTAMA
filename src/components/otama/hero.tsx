'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Play, Info, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

const ROTATE_MS = 7000

/* chillflix-style hero: full-bleed backdrop, gradient + grain overlays,
 * "% Match" meta row, TRENDING badge, big title, glass buttons. */

const GRAIN =
  'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")'

export function Hero({ items, loading }: { items: MetaItem[]; loading?: boolean }) {
  const [index, setIndex] = useState(0)
  const openDetail = useAppStore((s) => s.openDetail)
  const featured = items.filter((i) => i.backdrop).slice(0, 6)

  useEffect(() => {
    if (featured.length <= 1) return
    const t = setInterval(() => setIndex((i) => (i + 1) % featured.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [featured.length])

  if (loading || featured.length === 0) {
    return (
      <div className="relative -mt-16 h-[clamp(540px,72svh,680px)] md:h-[690px] w-full overflow-hidden bg-zinc-950">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute bottom-12 left-6 md:left-12 space-y-3">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96 max-w-[80vw]" />
        </div>
      </div>
    )
  }

  const item = featured[index % featured.length]
  const match = item.rating ? Math.min(99, Math.round(item.rating * 10)) : null

  return (
    <div className="relative -mt-16 h-[clamp(540px,72svh,680px)] md:h-[690px] w-full overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={item.refId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          <img src={item.backdrop} alt="" className="h-full w-full object-cover" />
        </motion.div>
      </AnimatePresence>

      {/* chillflix overlays: linear to page bg + brand-tinted radials + grain */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'linear-gradient(180deg, rgba(9,12,20,.06), rgba(9,12,20,.45) 58%, hsl(222 28% 5%) 96%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'linear-gradient(90deg, rgba(9,12,20,.72) 0%, rgba(9,12,20,.25) 42%, transparent 68%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'radial-gradient(ellipse 520px 340px at 26% 82%, rgba(217,70,239,.10), transparent 62%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-30 mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden
      />

      <motion.div
        key={`${item.refId}-text`}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="absolute inset-x-0 bottom-0 z-10 flex items-end"
      >
        <div className="w-full px-5 pb-10 pt-28 sm:px-6 md:px-12 md:pb-14">
          <div className="flex max-w-2xl flex-col items-start text-left">
            <div className="mb-3 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
              <span className="inline-flex items-center gap-1 rounded border border-[#ff4d2e]/45 bg-[#ff4d2e]/10 px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-[#ff4d2e]">
                <Flame className="h-3.5 w-3.5 fill-[#ff4d2e]" aria-hidden /> TRENDING
              </span>
            </div>

            <h1 className="text-4xl font-black leading-[1.04] tracking-tight drop-shadow-xl md:text-6xl">
              {item.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
              {match ? (
                <span className="font-extrabold text-[#6fae6a]">{match}% Match</span>
              ) : null}
              {item.year ? <span className="font-semibold text-zinc-300">{item.year}</span> : null}
              <span className="h-[3px] w-[3px] rounded-full bg-zinc-500" aria-hidden />
              <span className="rounded border border-white/25 px-1.5 py-px text-[11px] font-bold text-zinc-200">
                {item.kind === 'anime' ? 'ANIME' : item.kind === 'tv' ? 'TV' : 'MOVIE'}
              </span>
              {item.rating ? (
                <span className="inline-flex items-center gap-1 rounded border border-white/25 px-1.5 py-px text-[11px] font-bold text-zinc-100">
                  <Star className="h-3 w-3 fill-fuchsia-400 text-fuchsia-400" aria-hidden />
                  {item.rating.toFixed(1)}
                </span>
              ) : null}
              {item.genres?.slice(0, 2).map((g) => (
                <span key={g} className="rounded bg-white/10 px-1.5 py-px text-[11px] font-semibold text-zinc-200">
                  {g}
                </span>
              ))}
            </div>

            <p className="mt-3 line-clamp-3 max-w-xl text-sm text-zinc-300/95 drop-shadow md:text-[15px]">
              {item.summary}
            </p>

            <div className="mt-5 flex gap-3">
              <Button
                onClick={() => openDetail({ kind: 'movie', imdbId: item.imdbId, title: item.title, poster: item.poster, year: item.year })}
                className="bg-fuchsia-500 font-bold text-white hover:bg-fuchsia-400"
              >
                <Play className="mr-1 h-4 w-4 fill-white" /> View details
              </Button>
              <Button
                variant="secondary"
                onClick={() => openDetail({ kind: 'movie', imdbId: item.imdbId, title: item.title, poster: item.poster, year: item.year })}
                className="bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <Info className="mr-1 h-4 w-4" /> More info
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-3 right-6 z-10 flex gap-1.5 md:right-12" role="tablist" aria-label="Featured slides">
        {featured.map((f, i) => (
          <button
            key={f.refId}
            role="tab"
            aria-selected={i === index % featured.length}
            aria-label={`Slide ${i + 1}: ${f.title}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index % featured.length ? 'w-6 bg-fuchsia-400' : 'w-2 bg-white/40 hover:bg-white/70'}`}
          />
        ))}
      </div>
    </div>
  )
}
