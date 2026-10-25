'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Info, RefreshCw, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

const ROTATE_MS = 7000

/* Netflix 2025-style hero billboard (matches the reference screenshot):
 * a rounded-corner card inset from the page edges — red "O" monogram top-left,
 * circular reshuffle button top-right, dot-separated meta line, description,
 * white pill Play + translucent pill More Info, and the two dark chips in the
 * bottom-right corner of the card. */

const GRAIN =
  'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")'

/** Red ribbon-O monogram — the OTAMA counterpart of the red "N" in the corner. */
function HeroMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-10 w-10 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] md:h-12 md:w-12"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-o-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4d57" />
          <stop offset="0.55" stopColor="#e50914" />
          <stop offset="1" stopColor="#9c070f" />
        </linearGradient>
      </defs>
      <g transform="rotate(-14 32 32)">
        <circle cx="32" cy="32" r="20.5" fill="none" stroke="url(#hero-o-grad)" strokeWidth="11.5" />
      </g>
    </svg>
  )
}

function Dot() {
  return <span className="h-[3px] w-[3px] rounded-full bg-zinc-400" aria-hidden />
}

export function Hero({ items, loading }: { items: MetaItem[]; loading?: boolean }) {
  const [index, setIndex] = useState(0)
  const openDetail = useAppStore((s) => s.openDetail)
  const featured = items.filter((i) => i.backdrop).slice(0, 8)

  useEffect(() => {
    if (featured.length <= 1) return
    const t = setInterval(() => setIndex((i) => (i + 1) % featured.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [featured.length])

  const shuffle = () => {
    if (featured.length <= 1) return
    setIndex((cur) => {
      let next = cur
      while (next === cur) next = Math.floor(Math.random() * featured.length)
      return next
    })
  }

  if (loading || featured.length === 0) {
    return (
      <div className="px-3 pt-3 md:px-6">
        <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-950 md:rounded-[28px]">
          <div className="aspect-[5/6] w-full sm:aspect-[16/10] lg:aspect-[21/9]">
            <Skeleton className="h-full w-full rounded-none" />
          </div>
          <div className="absolute bottom-8 left-6 space-y-3 md:left-10">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-96 max-w-[70vw]" />
          </div>
        </div>
      </div>
    )
  }

  const item = featured[index % featured.length]
  const match = item.rating ? Math.min(99, Math.round(item.rating * 10)) : null
  const open = () =>
    openDetail({ kind: 'movie', imdbId: item.imdbId, title: item.title, poster: item.poster, year: item.year })

  return (
    <div className="px-3 pt-3 md:px-6">
      <div className="relative w-full overflow-hidden rounded-2xl md:rounded-[28px]">
        {/* artwork */}
        <div className="aspect-[5/6] w-full sm:aspect-[16/10] lg:aspect-[21/9]">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={item.refId}
              initial={{ opacity: 0, scale: 1.03 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="h-full w-full"
            >
              <img src={item.backdrop} alt="" className="h-full w-full object-cover" />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* overlays: bottom-left legibility gradient + grain */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25), transparent 30%, rgba(0,0,0,0.42) 78%, rgba(0,0,0,0.72))' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(76deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.34) 40%, transparent 62%)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-25 mix-blend-overlay"
          style={{ backgroundImage: GRAIN }}
          aria-hidden
        />

        {/* top row inside the card: monogram left, reshuffle right */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 md:p-7">
          <HeroMark />
          <button
            onClick={shuffle}
            aria-label="Shuffle featured title"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/60 md:h-11 md:w-11"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* bottom-left content */}
        <motion.div
          key={`${item.refId}-text`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-6 p-5 pb-6 sm:p-7 md:p-9"
        >
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] font-semibold text-zinc-100 drop-shadow md:text-sm">
              <span>{item.kind === 'anime' ? 'Anime' : item.kind === 'tv' ? 'Series' : 'Film'}</span>
              <Dot />
              {item.genres?.[0] ? (
                <>
                  <span>{item.genres[0]}</span>
                  <Dot />
                </>
              ) : null}
              {item.year ? (
                <>
                  <span>{item.year}</span>
                  <Dot />
                </>
              ) : null}
              {item.rating ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-bold text-[#46d369]">{item.rating.toFixed(1)}</span>
                    <span className="text-zinc-300">★</span>
                  </span>
                  <Dot />
                </>
              ) : null}
              <span className="rounded border border-white/30 px-1.5 py-px text-[11px] font-bold">16+</span>
            </div>

            <h1 className="mt-2 text-3xl font-black leading-[1.05] tracking-tight drop-shadow-xl md:mt-3 md:text-5xl">
              {item.title}
            </h1>

            <p className="mt-2 line-clamp-3 max-w-xl text-sm text-zinc-200/95 drop-shadow md:text-[15px]">
              {item.summary}
            </p>

            <div className="mt-4 flex gap-3 md:mt-5">
              <Button
                onClick={open}
                className="h-11 rounded-full bg-white px-6 font-bold text-black shadow-lg hover:bg-white/85 md:h-12 md:px-8"
              >
                <Play className="mr-1 h-5 w-5 fill-black" /> Play
              </Button>
              <Button
                variant="secondary"
                onClick={open}
                className="h-11 rounded-full bg-[#3a3a3a]/70 px-6 font-semibold text-white backdrop-blur hover:bg-[#3a3a3a]/90 md:h-12 md:px-8"
              >
                <Info className="mr-1.5 h-5 w-5" /> More Info
              </Button>
            </div>
          </div>

          {/* corner chips (like the reference) — desktop only */}
          <div className="hidden shrink-0 items-center gap-3 pb-1 lg:flex">
            {match ? (
              <span className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-2 text-sm font-semibold text-white backdrop-blur">
                <HeroMarkSmall />
                {match}% Match
              </span>
            ) : null}
            <span className="flex items-center gap-2 rounded-md bg-black/60 px-3 py-2 text-sm font-semibold text-white backdrop-blur">
              <ThumbsUp className="h-4 w-4" aria-hidden />
              We think you&rsquo;ll love this!
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function HeroMarkSmall() {
  return (
    <svg viewBox="0 0 64 64" className="h-5 w-5 shrink-0" aria-hidden>
      <g transform="rotate(-14 32 32)">
        <circle cx="32" cy="32" r="20.5" fill="none" stroke="#e50914" strokeWidth="12" />
      </g>
    </svg>
  )
}
