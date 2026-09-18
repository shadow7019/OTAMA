'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MediaCard } from '@/components/otama/media-card'
import { useAppStore } from '@/store/app-store'
import type { MetaItem } from '@/lib/types'

const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western']
const TV_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Reality', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western']

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

export function CatalogView({ type }: { type: 'movie' | 'tv' | 'anime' }) {
  const openDetail = useAppStore((s) => s.openDetail)
  const [genre, setGenre] = useState<string>('all')
  const [sort, setSort] = useState('top')
  const [source, setSource] = useState<'cinemeta' | 'tvmaze'>('cinemeta')
  const [items, setItems] = useState<MetaItem[]>([])
  const [page, setPage] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['catalog', type, genre, sort, source],
    queryFn: () => {
      const params = new URLSearchParams({ type, sort })
      if (source === 'tvmaze' && type === 'tv') {
        params.set('source', 'tvmaze')
        params.set('page', '0')
      } else {
        if (genre !== 'all') params.set('genre', genre)
      }
      return fetchJson<{ items: MetaItem[] }>(`/api/catalog?${params}`)
    },
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    setItems(data?.items || [])
    setPage(0)
  }, [data])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = page + 1
      const params = new URLSearchParams({ type, sort })
      if (source === 'tvmaze' && type === 'tv') {
        params.set('source', 'tvmaze')
        params.set('page', String(next))
      } else {
        if (genre !== 'all') params.set('genre', genre)
        params.set('skip', String(next * 100))
      }
      const more = await fetchJson<{ items: MetaItem[] }>(`/api/catalog?${params}`)
      const seen = new Set(items.map((i) => i.refId))
      setItems((prev) => [...prev, ...more.items.filter((i) => !seen.has(i.refId))])
      setPage(next)
    } catch {
      // silently stop
    } finally {
      setLoadingMore(false)
    }
  }

  const openFor = (item: MetaItem) => {
    const imdb = item.imdbId || (item.refId.startsWith('tt') ? item.refId : undefined)
    if (imdb) {
      openDetail({ kind: item.kind === 'anime' ? 'anime' : item.kind, imdbId: imdb, title: item.title, poster: item.poster, year: item.year })
    } else if (item.tvmazeId) {
      // TVMaze-only item without imdb — fall back to search by title? Show toast.
    }
  }

  const genres = type === 'movie' ? MOVIE_GENRES : TV_GENRES
  const grid = useMemo(() => items, [items])

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight capitalize">
          {type === 'tv' ? 'TV Shows' : type === 'anime' ? 'Anime' : 'Movies'}
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {type !== 'anime' && source === 'cinemeta' ? (
            <Select value={genre} onValueChange={(v) => { setGenre(v); refetch() }}>
              <SelectTrigger className="w-[150px]" aria-label="Genre filter">
                <SelectValue placeholder="Genre" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All genres</SelectItem>
                {genres.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {source === 'cinemeta' ? (
            <Select value={sort} onValueChange={(v) => { setSort(v); refetch() }}>
              <SelectTrigger className="w-[150px]" aria-label="Sort order">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Popular</SelectItem>
                <SelectItem value="imdbRating">Top rated</SelectItem>
                <SelectItem value="year">Newest</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {type === 'tv' ? (
            <Select value={source} onValueChange={(v) => setSource(v as 'cinemeta' | 'tvmaze')}>
              <SelectTrigger className="w-[150px]" aria-label="TV source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cinemeta">Cinemeta</SelectItem>
                <SelectItem value="tvmaze">TVmaze</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Failed to load catalog: {(error as Error).message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : grid.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-400">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {grid.map((item) => (
            <MediaCard key={`${item.refId}-${item.title}`} item={item} onClick={() => openFor(item)} />
          ))}
        </div>
      )}

      {grid.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore || isFetching} className="min-h-[44px] px-6">
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
