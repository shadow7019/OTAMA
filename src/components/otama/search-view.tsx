'use client'

import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MediaCard } from '@/components/otama/media-card'
import { TorrentList } from '@/components/otama/torrent-list'
import { TpbResultList } from '@/components/otama/tpb-result-list'
import { Skeleton } from '@/components/ui/skeleton'
import type { MetaItem, TorrentOption, TpbItem } from '@/lib/types'
import { useAppStore } from '@/store/app-store'
import { fetchJson } from '@/lib/fetch-json'

interface SearchResults {
  movies: MetaItem[]
  series: MetaItem[]
  anime: TorrentOption[]
  animeSeries: MetaItem[]
  tpb: TpbItem[]
  leetx: TorrentOption[]
  solid: TorrentOption[]
  more: TorrentOption[]
}

export function SearchView({ query }: { query: string }) {
  const openDetail = useAppStore((s) => s.openDetail)
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => fetchJson<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`),
    staleTime: 2 * 60_000,
    enabled: query.trim().length > 0,
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
      fetchJson<{ imdbId?: string | null; error?: string }>(`/api/resolve?tmdbId=${tmdbId}&type=${item.kind === 'tv' ? 'tv' : 'movie'}`)
        .then((r) => {
          toast.dismiss('resolve-tmdb')
          if (r.imdbId) {
            openDetail({ kind: item.kind === 'anime' ? 'anime' : item.kind, imdbId: r.imdbId, title: item.title, poster: item.poster, year: item.year })
          } else {
            toast.error(`Could not resolve “${item.title}” to an IMDb id — torrents are keyed by IMDb.`)
          }
        })
        .catch(() => toast.dismiss('resolve-tmdb'))
      return
    }
    toast.info(`“${item.title}” has no torrent mapping — search for it in the Torrents tab.`)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <h1 className="text-2xl font-black tracking-tight">
        Results for <span className="text-amber-400">“{query}”</span>
      </h1>
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Search failed: {(error as Error).message}</p>
      ) : null}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="movies" className="w-full">
          <TabsList className="bg-white/5 max-w-full overflow-x-auto no-scrollbar">
            <TabsTrigger value="movies">Movies ({data?.movies.length ?? 0})</TabsTrigger>
            <TabsTrigger value="series">TV ({data?.series.length ?? 0})</TabsTrigger>
            <TabsTrigger value="anime">Anime ({(data?.anime.length ?? 0) + (data?.animeSeries.length ?? 0)})</TabsTrigger>
            <TabsTrigger value="tpb">Pirate Bay ({data?.tpb.length ?? 0})</TabsTrigger>
            <TabsTrigger value="leetx">1337x ({data?.leetx.length ?? 0})</TabsTrigger>
            <TabsTrigger value="solid">Solid ({data?.solid.length ?? 0})</TabsTrigger>
            <TabsTrigger value="more">More Sites ({data?.more.length ?? 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="movies" className="pt-4">
            {(data?.movies.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No movies found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {data!.movies.map((m) => (
                  <MediaCard key={m.refId} item={m} onClick={() => openFor(m)} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="series" className="pt-4">
            {(data?.series.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No series found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {data!.series.map((m) => (
                  <MediaCard key={`${m.refId}-${m.title}`} item={m} onClick={() => openFor(m)} />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="anime" className="pt-4">
            {/* Anime SERIES cards first — every match opens with the full
                season/episode browser (per-episode Nyaa + Torrentio), instead
                of a flat torrent wall where whole seasons go missing. */}
            {(data?.animeSeries?.length ?? 0) > 0 ? (
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-zinc-300">
                  Anime series <span className="font-normal text-zinc-500">— open for all seasons &amp; episodes</span>
                </h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {data!.animeSeries.map((s) => (
                    <MediaCard key={`${s.refId}-${s.title}`} item={{ ...s, kind: 'anime' }} onClick={() => openFor({ ...s, kind: 'anime' })} />
                  ))}
                </div>
              </div>
            ) : null}
            {(data?.anime.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No anime torrents found.</p>
            ) : (
              <TorrentList torrents={data!.anime} compact />
            )}
          </TabsContent>
          <TabsContent value="tpb" className="pt-4">
            <TpbResultList items={data?.tpb || []} />
          </TabsContent>
          <TabsContent value="leetx" className="pt-4 max-w-3xl">
            {(data?.leetx.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No 1337x results (or 1337x is unreachable right now).</p>
            ) : (
              <TorrentList torrents={data!.leetx} compact />
            )}
          </TabsContent>
          <TabsContent value="solid" className="pt-4 max-w-3xl">
            {(data?.solid.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No SolidTorrents results (or the index is unreachable right now).</p>
            ) : (
              <TorrentList torrents={data!.solid} compact />
            )}
          </TabsContent>
          <TabsContent value="more" className="pt-4 max-w-3xl">
            {(data?.more.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No results from RARBG archive, LimeTorrents, TorrentDownloads or TorrentGalaxy (some sites may be blocked on this network).</p>
            ) : (
              <TorrentList torrents={data!.more} compact />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

export function SearchSkeletonRow() {
  return <Skeleton className="h-16 w-full rounded-xl" />
}
