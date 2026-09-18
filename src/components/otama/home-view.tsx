'use client'

import { useQuery } from '@tanstack/react-query'
import { Hero } from '@/components/otama/hero'
import { MediaRow } from '@/components/otama/media-row'
import { ContinueWatchingRow } from '@/components/otama/favorites-view'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

export function HomeView() {
  const openDetail = useAppStore((s) => s.openDetail)

  const movies = useQuery({
    queryKey: ['home', 'movies'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=movie&sort=top'),
    staleTime: 10 * 60_000,
  })
  const series = useQuery({
    queryKey: ['home', 'series'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=series&sort=top'),
    staleTime: 10 * 60_000,
  })
  const anime = useQuery({
    queryKey: ['home', 'anime'],
    queryFn: () => fetchJson<{ items: MetaItem[] }>('/api/catalog?type=anime'),
    staleTime: 10 * 60_000,
  })

  const openFor = (item: MetaItem) => {
    const imdb = item.imdbId || (item.refId.startsWith('tt') ? item.refId : undefined)
    if (imdb) openDetail({ kind: item.kind === 'anime' ? 'anime' : item.kind, imdbId: imdb, title: item.title, poster: item.poster, year: item.year })
  }

  return (
    <div className="pb-10">
      <Hero items={movies.data?.items || []} loading={movies.isLoading} />
      <div className="mx-auto max-w-7xl space-y-8 px-4 pt-8 md:px-8">
        <ContinueWatchingRow />
        <MediaRow title="Trending" accent="movies" items={(movies.data?.items || []).slice(0, 20)} loading={movies.isLoading} onSelect={openFor} />
        <MediaRow title="Top" accent="series" items={(series.data?.items || []).slice(0, 20)} loading={series.isLoading} onSelect={openFor} />
        <MediaRow title="Popular" accent="anime" items={(anime.data?.items || []).slice(0, 20)} loading={anime.isLoading} onSelect={openFor} />
        {movies.error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Could not reach the metadata provider ({(movies.error as Error).message}). Check your connection and refresh.
          </p>
        ) : null}
      </div>
    </div>
  )
}
