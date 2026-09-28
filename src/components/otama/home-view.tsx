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

  const movieItems = movies.data?.items || []
  const seriesItems = series.data?.items || []

  return (
    <div className="pb-10">
      <Hero items={movieItems} loading={movies.isLoading} />
      <div className="mx-auto max-w-7xl space-y-9 px-4 pt-6 md:px-8">
        <ContinueWatchingRow />
        <MediaRow
          ranked
          title="Top 10 Movies"
          accent="Today"
          subtitle="The films everyone is streaming right now — updated live."
          items={movieItems.slice(0, 10)}
          loading={movies.isLoading}
          onSelect={openFor}
          exploreTo="movies"
        />
        <MediaRow
          title="Popular on OTAMA"
          accent="now"
          subtitle="Fan favorites and critically acclaimed films — the ones audiences can't stop talking about."
          items={movieItems.slice(10, 30)}
          loading={movies.isLoading}
          onSelect={openFor}
          exploreTo="movies"
        />
        <MediaRow
          ranked
          title="Top 10 TV Shows"
          accent="Today"
          subtitle="Series riding the top of the charts today."
          items={seriesItems.slice(0, 10)}
          loading={series.isLoading}
          onSelect={openFor}
          exploreTo="tv"
        />
        <MediaRow
          title="New episodes"
          accent="airing today"
          subtitle="Fresh episodes landing today — keep up with your shows."
          items={(airingToday.data?.items || []).slice(0, 20)}
          loading={airingToday.isLoading}
          onSelect={openFor}
          exploreTo="tv"
        />
        <MediaRow
          title="New in"
          accent="theaters"
          subtitle="Just released on the big screen — now streaming."
          items={(nowPlaying.data?.items || []).slice(0, 20)}
          loading={nowPlaying.isLoading}
          onSelect={openFor}
          exploreTo="movies"
        />
        <MediaRow
          title="Popular"
          accent="anime"
          subtitle="The seasons and series the anime community is watching."
          items={(anime.data?.items || []).slice(0, 20)}
          loading={anime.isLoading}
          onSelect={openFor}
          exploreTo="anime"
        />
        <AnimeFreshRow />
        <PirateBayFreshRow />
        <MediaRow
          title="Coming"
          accent="soon"
          subtitle="Get ahead of the hype — upcoming releases to watch for."
          items={(upcoming.data?.items || []).slice(0, 20)}
          loading={upcoming.isLoading}
          onSelect={openFor}
          exploreTo="movies"
        />
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
