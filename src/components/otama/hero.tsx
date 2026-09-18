'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Play, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

const ROTATE_MS = 7000

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
      <div className="relative h-[46vh] min-h-[320px] max-h-[520px] w-full overflow-hidden rounded-b-3xl bg-zinc-900">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute bottom-10 left-6 md:bottom-12 md:left-12 space-y-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96 max-w-[80vw]" />
        </div>
      </div>
    )
  }

  const item = featured[index % featured.length]

  return (
    <div className="relative h-[46vh] min-h-[320px] max-h-[520px] w-full overflow-hidden rounded-b-3xl">
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
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

      <motion.div
        key={`${item.refId}-text`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="absolute bottom-10 left-6 right-6 md:bottom-12 md:left-12 md:max-w-xl space-y-3"
      >
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          {item.rating ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
              <Star className="h-4 w-4 fill-amber-300" /> {item.rating.toFixed(1)}
            </span>
          ) : null}
          {item.year ? <span>{item.year}</span> : null}
          {item.genres?.slice(0, 2).map((g) => (
            <span key={g} className="rounded border border-white/15 px-1.5 py-0.5 text-xs">
              {g}
            </span>
          ))}
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight drop-shadow-lg">{item.title}</h1>
        <p className="text-sm md:text-base text-zinc-300 line-clamp-2 drop-shadow">{item.summary}</p>
        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => openDetail({ kind: 'movie', imdbId: item.imdbId, title: item.title, poster: item.poster, year: item.year })}
            className="bg-amber-500 text-black hover:bg-amber-400 font-bold"
          >
            <Play className="h-4 w-4 fill-black mr-1" /> View details
          </Button>
          <Button
            variant="secondary"
            onClick={() => openDetail({ kind: 'movie', imdbId: item.imdbId, title: item.title, poster: item.poster, year: item.year })}
          >
            <Info className="h-4 w-4 mr-1" /> More info
          </Button>
        </div>
      </motion.div>

      <div className="absolute bottom-3 right-6 md:right-12 flex gap-1.5" role="tablist" aria-label="Featured slides">
        {featured.map((f, i) => (
          <button
            key={f.refId}
            role="tab"
            aria-selected={i === index % featured.length}
            aria-label={`Slide ${i + 1}: ${f.title}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index % featured.length ? 'w-6 bg-amber-400' : 'w-2 bg-white/40 hover:bg-white/70'}`}
          />
        ))}
      </div>
    </div>
  )
}
