'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Clock, Heart, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Poster } from '@/components/otama/media-card'
import { TorrentList } from '@/components/otama/torrent-list'
import type { MetaItem, MovieDetail, SeriesDetail, TorrentOption } from '@/lib/types'
import { useAppStore } from '@/store/app-store'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

function useFavorite(detail: { kind: string; refId?: string; title: string; poster?: string; year?: number; rating?: number }) {
  const [fav, setFav] = useState(false)
  useEffect(() => {
    if (!detail.refId) return
    fetchJson<{ favorites: { kind: string; refId: string }[] }>(`/api/favorites`)
      .then((d) => setFav(d.favorites.some((f) => f.kind === detail.kind && f.refId === detail.refId)))
      .catch(() => {})
  }, [detail.kind, detail.refId])
  const toggle = async () => {
    if (!detail.refId) {
      toast.error('Cannot save this item (missing id)')
      return
    }
    try {
      if (fav) {
        await fetch(`/api/favorites?kind=${detail.kind}&refId=${encodeURIComponent(detail.refId)}`, { method: 'DELETE' })
        setFav(false)
        toast.success('Removed from favorites')
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: detail.kind, refId: detail.refId, title: detail.title, poster: detail.poster, year: detail.year, rating: detail.rating }),
        })
        setFav(true)
        toast.success('Added to favorites')
      }
    } catch {
      toast.error('Failed to update favorites')
    }
  }
  return { fav, toggle }
}

export function DetailOverlay() {
  const detail = useAppStore((s) => s.detail)
  const closeDetail = useAppStore((s) => s.closeDetail)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail()
    }
    if (detail) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail, closeDetail])

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
          onClick={closeDetail}
          role="dialog"
          aria-modal="true"
          aria-label={detail.title}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 top-10 mx-auto max-w-5xl overflow-hidden rounded-t-3xl bg-background shadow-2xl md:top-16"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={closeDetail}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Close details"
            >
              <X className="h-5 w-5" />
            </Button>
            <ScrollArea className="h-full">
              <div className="otama-scroll">
                {detail.directTorrents ? (
                  <AnimeDirectDetail detail={detail} />
                ) : detail.kind === 'movie' && detail.imdbId ? (
                  <MovieDetailBody imdbId={detail.imdbId} fallback={{ title: detail.title, poster: detail.poster, year: detail.year }} />
                ) : detail.imdbId ? (
                  <SeriesDetailBody imdbId={detail.imdbId} fallback={{ title: detail.title, poster: detail.poster, year: detail.year }} />
                ) : null}
              </div>
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------ movie ------------------------------ */

function MovieDetailBody({
  imdbId,
  fallback,
}: {
  imdbId: string
  fallback: { title: string; poster?: string; year?: number }
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['movie', imdbId],
    queryFn: () => fetchJson<MovieDetail>(`/api/meta/movie/${imdbId}`),
    staleTime: 10 * 60_000,
  })
  const meta = data?.item
  const fav = useFavorite({
    kind: 'movie',
    refId: imdbId,
    title: meta?.title || fallback.title,
    poster: meta?.poster || fallback.poster,
    year: meta?.year || fallback.year,
    rating: meta?.rating,
  })

  return (
    <div>
      <DetailHeader
        item={meta || { refId: imdbId, kind: 'movie', title: fallback.title, poster: fallback.poster, year: fallback.year, provider: 'cinemeta' }}
        loading={isLoading}
        favorite={fav.fav}
        onToggleFavorite={fav.toggle}
      />
      <div className="space-y-3 p-5 md:p-8">
        <h3 className="text-base font-bold flex items-center gap-2">
          Available torrents <span className="text-xs font-normal text-zinc-500">(ThePirateBay)</span>
        </h3>
        {error ? <p className="text-sm text-red-400">Failed to load details: {(error as Error).message}</p> : null}
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
        ) : (
          <TorrentList
            torrents={data?.torrents || []}
            meta={{ poster: meta?.poster || fallback.poster, refId: imdbId, kind: 'movie', title: meta?.title || fallback.title }}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------ series ------------------------------ */

function SeriesDetailBody({
  imdbId,
  fallback,
}: {
  imdbId: string
  fallback: { title: string; poster?: string; year?: number }
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['series', imdbId],
    queryFn: () => fetchJson<SeriesDetail>(`/api/meta/series/${imdbId}`),
    staleTime: 10 * 60_000,
  })
  const seasons = data?.seasons || []
  const [seasonOverride, setSeasonOverride] = useState<string | null>(null)
  // first available season by default, or user's explicit choice
  const season = seasonOverride ?? (seasons.length ? String(seasons[0].season) : '')
  const episodes = useMemo(() => seasons.find((s) => String(s.season) === season)?.episodes || [], [seasons, season])
  const fav = useFavorite({
    kind: 'tv',
    refId: imdbId,
    title: data?.item?.title || fallback.title,
    poster: data?.item?.poster || fallback.poster,
    year: data?.item?.year || fallback.year,
    rating: data?.item?.rating,
  })

  return (
    <div>
      <DetailHeader
        item={data?.item || { refId: imdbId, kind: 'tv', title: fallback.title, poster: fallback.poster, year: fallback.year, provider: 'cinemeta' }}
        loading={isLoading}
        favorite={fav.fav}
        onToggleFavorite={fav.toggle}
      />
      <div className="space-y-4 p-5 md:p-8">
        {error ? <p className="text-sm text-red-400">Failed to load series: {(error as Error).message}</p> : null}
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-bold">Episodes</h3>
          <Select value={season} onValueChange={setSeasonOverride}>
            <SelectTrigger className="w-[180px]" aria-label="Select season">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.season} value={String(s.season)}>
                  Season {s.season}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
        ) : (
          <EpisodeList imdbId={imdbId} title={data?.item?.title || fallback.title} poster={data?.item?.poster || fallback.poster} episodes={episodes} />
        )}
      </div>
    </div>
  )
}

function EpisodeList({
  imdbId,
  title,
  poster,
  episodes,
}: {
  imdbId: string
  title: string
  poster?: string
  episodes: { season: number; episode: number; title?: string; overview?: string; airDate?: string }[]
}) {
  const [openEp, setOpenEp] = useState<string | null>(null)
  if (episodes.length === 0) {
    return <p className="text-sm text-zinc-400">No episode data available for this series.</p>
  }
  return (
    <ul className="space-y-2">
      {episodes.map((ep) => {
        const key = `${ep.season}-${ep.episode}`
        const open = openEp === key
        return (
          <li key={key} className="rounded-xl border border-white/5 bg-card overflow-hidden">
            <button
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors min-h-[44px]"
              onClick={() => setOpenEp(open ? null : key)}
              aria-expanded={open}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-sm font-bold text-amber-400">
                {ep.episode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{ep.title || `Episode ${ep.episode}`}</span>
                {ep.airDate ? (
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <CalendarDays className="h-3 w-3" /> {ep.airDate.slice(0, 10)}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-zinc-500 shrink-0">{open ? 'Hide torrents' : 'Find torrents'}</span>
            </button>
            {open ? (
              <div className="border-t border-white/5 p-3 bg-background/50">
                <EpisodeTorrents imdbId={imdbId} title={title} poster={poster} season={ep.season} episode={ep.episode} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function EpisodeTorrents({
  imdbId,
  title,
  poster,
  season,
  episode,
}: {
  imdbId: string
  title: string
  poster?: string
  season: number
  episode: number
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['ep-torrents', imdbId, season, episode],
    queryFn: () =>
      fetchJson<{ torrents: TorrentOption[] }>(
        `/api/meta/series/${imdbId}/torrents?title=${encodeURIComponent(title)}&season=${season}&episode=${episode}`,
      ),
    staleTime: 5 * 60_000,
  })
  if (isLoading) return <Skeleton className="h-16 w-full rounded-xl" />
  return (
    <TorrentList
      torrents={data?.torrents || []}
      meta={{ poster, refId: `${imdbId}:${season}:${episode}`, kind: 'tv', title: `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` }}
      compact
    />
  )
}

/* ------------------------------ anime direct ------------------------------ */

function AnimeDirectDetail({ detail }: { detail: { title: string; poster?: string; directTorrents?: TorrentOption[] } }) {
  return (
    <div>
      <div className="relative">
        <div className="flex gap-5 p-5 md:p-8 pt-8">
          <Poster src={detail.poster} alt={detail.title} className="w-28 shrink-0 rounded-xl ring-1 ring-white/10 md:w-40" />
          <div className="min-w-0 space-y-2">
            <h2 className="text-2xl font-black tracking-tight">{detail.title}</h2>
            <p className="text-sm text-zinc-400">Anime · Nyaa Torrents</p>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-5 md:p-8 pt-0">
        <h3 className="text-base font-bold">Torrents</h3>
        <TorrentList torrents={detail.directTorrents || []} meta={{ poster: detail.poster, kind: 'anime', title: detail.title }} />
      </div>
    </div>
  )
}

/* ------------------------------ shared header ------------------------------ */

function DetailHeader({
  item,
  loading,
  favorite,
  onToggleFavorite,
}: {
  item: Partial<MetaItem> & { title: string }
  loading?: boolean
  favorite: boolean
  onToggleFavorite: () => void
}) {
  return (
    <div className="relative">
      {item.backdrop ? (
        <div className="relative h-52 md:h-64">
          <img src={item.backdrop} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
      ) : null}
      <div className={`flex gap-5 p-5 md:p-8 ${item.backdrop ? '-mt-16 md:-mt-20 relative' : 'pt-8'}`}>
        <Poster src={item.poster} alt={item.title} className="w-28 shrink-0 rounded-xl ring-1 ring-white/10 shadow-xl md:w-40" />
        <div className="min-w-0 flex-1 space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black tracking-tight leading-tight">{item.title}</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                {item.rating ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                    <Star className="h-4 w-4 fill-amber-300" /> {item.rating.toFixed(1)}
                  </span>
                ) : null}
                {item.year ? <span>{item.year}</span> : null}
                {item.runtime ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {item.runtime}m
                  </span>
                ) : null}
                <span className="rounded border border-white/15 px-1.5 py-0.5 text-xs uppercase">
                  {item.kind === 'movie' ? 'Movie' : 'Series'}
                </span>
              </div>
              {item.genres?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.genres.slice(0, 5).map((g) => (
                    <span key={g} className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300">
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
        <Button
          variant={favorite ? 'default' : 'secondary'}
          size="icon"
          onClick={onToggleFavorite}
          className={`shrink-0 ${favorite ? 'bg-amber-500 text-black hover:bg-amber-400' : ''}`}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={`h-4 w-4 ${favorite ? 'fill-black' : ''}`} />
        </Button>
      </div>
      {item.summary ? (
        <div className="px-5 md:px-8 pb-2">
          <p className="text-sm leading-relaxed text-zinc-300">{item.summary}</p>
          {item.genres && item.genres.length > 0 ? <Separator className="my-4 opacity-40" /> : null}
        </div>
      ) : null}
    </div>
  )
}
