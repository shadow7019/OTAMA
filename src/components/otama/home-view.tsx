'use client'

import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Hero } from '@/components/otama/hero'
import { MediaRow } from '@/components/otama/media-row'
import { ContinueWatchingRow } from '@/components/otama/favorites-view'
import { PirateBayFreshRow } from '@/components/otama/tpb-fresh-row'
import { AnimeFreshRow } from '@/components/otama/anime-fresh-row'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'
import { fetchJson } from '@/lib/fetch-json'

export function HomeView() {
  const openDetail = useAppStore((s) => s.openDetail)

  // All rows below are LIVE provider feeds (TMDB trending / now_playing /
  // airing_today / upcoming + Nyaa's newest uploads) — new movies, new
  // episodes and new seasons appear here automatically, no manual curation.
  const movies = useQuery({
    queryKey: ['home', 'movies'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=movie&sort=top&source=tmdb'),
    staleTime: 10 * 60_000,
  })
  const series = useQuery({
    queryKey: ['home', 'series'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=series&sort=top&source=tmdb'),
    staleTime: 10 * 60_000,
  })
  const anime = useQuery({
    queryKey: ['home', 'anime'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=anime&sort=popular&source=tmdb'),
    staleTime: 10 * 60_000,
  })
  const nowPlaying = useQuery({
    queryKey: ['home', 'now-playing'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=movie&sort=now_playing&source=tmdb'),
    staleTime: 10 * 60_000,
  })
  const airingToday = useQuery({
    queryKey: ['home', 'airing-today'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=series&sort=airing_today&source=tmdb'),
    staleTime: 10 * 60_000,
  })
  const upcoming = useQuery({
    queryKey: ['home', 'upcoming'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=movie&sort=upcoming&source=tmdb'),
    staleTime: 10 * 60_000,
  })

  const openFor = (item: MetaItem) => {
    const imdb = item.imdbId || (item.refId.startsWith('tt') ? item.refId : undefined)
    if (imdb) {
      openDetail({ kind: item.kind === 'anime' ? 'anime' : item.kind, imdbId: imdb, title: item.title, poster: item.poster, year: item.year })
      return
    }
    // TMDB-only item (imdb lookup failed at list time) — resolve now, then open
    const tmdbId = item.tmdbId || (item.refId.startsWith('tmdb:') ? parseInt(item.refId.slice(5), 10) : NaN)
    if (tmdbId) {
      toast.loading('Resolving title…', { id: 'resolve-tmdb' })
      fetchJson<{ imdbId?: string | null }>(`/api/resolve?tmdbId=${tmdbId}&type=${item.kind === 'tv' ? 'tv' : 'movie'}`)
        .then((r) => {
          toast.dismiss('resolve-tmdb')
          if (r.imdbId) {
            openDetail({ kind: item.kind === 'anime' ? 'anime' : item.kind, imdbId: r.imdbId, title: item.title, poster: item.poster, year: item.year })
          } else {
            toast.error(`Could not resolve “${item.title}” to an IMDb id — search for it in the Anime/Torrents tab.`)
          }
        })
        .catch(() => toast.dismiss('resolve-tmdb'))
    }
  }

  return (
    <div className="pb-10">
      <Hero items={movies.data?.items || []} loading={movies.isLoading} />
      <div className="mx-auto max-w-7xl space-y-8 px-4 pt-8 md:px-8">
        <ContinueWatchingRow />
        <MediaRow title="Trending" accent="now" items={(movies.data?.items || []).slice(0, 20)} loading={movies.isLoading} onSelect={openFor} />
        <MediaRow title="New episodes" accent="airing today" items={(airingToday.data?.items || []).slice(0, 20)} loading={airingToday.isLoading} onSelect={openFor} />
        <MediaRow title="New in" accent="theaters" items={(nowPlaying.data?.items || []).slice(0, 20)} loading={nowPlaying.isLoading} onSelect={openFor} />
        <MediaRow title="Top" accent="series" items={(series.data?.items || []).slice(0, 20)} loading={series.isLoading} onSelect={openFor} />
        <MediaRow title="Popular" accent="anime" items={(anime.data?.items || []).slice(0, 20)} loading={anime.isLoading} onSelect={openFor} />
        <AnimeFreshRow />
        <PirateBayFreshRow />
        <MediaRow title="Coming" accent="soon" items={(upcoming.data?.items || []).slice(0, 20)} loading={upcoming.isLoading} onSelect={openFor} />
        {movies.error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            <p className="font-medium">Metadata is unavailable right now.</p>
            <p className="mt-1 opacity-90">{(movies.error as Error).message}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
