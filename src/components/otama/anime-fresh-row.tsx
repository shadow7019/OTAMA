'use client'

import { useQuery } from '@tanstack/react-query'
import { Flame, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QualityBadge, Seeds } from '@/components/otama/media-card'
import { addTorrent, bestVideoFile, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { TorrentOption } from '@/lib/types'
import { fetchJson } from '@/lib/fetch-json'

/**
 * "Latest anime episodes" — the live Nyaa upload feed right on the home
 * screen. Nyaa is updated the minute fansubs release, so this row is always
 * current: new episodes and new seasons appear here automatically, one click
 * from playback. Fully auto-updating — nothing curated or stale.
 */
export function AnimeFreshRow() {
  const setView = useAppStore((s) => s.setView)
  const openPlayer = useAppStore((s) => s.openPlayer)

  const { data, isLoading, error } = useQuery({
    queryKey: ['nyaa-fresh'],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>('/api/nyaa?latest=1'),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000, // the feed itself refreshes while the app is open
  })

  const items = (data?.items || []).slice(0, 14)

  const play = async (item: TorrentOption) => {
    const key = `nyaa-fresh-${item.hash}`
    try {
      toast.loading('Connecting to swarm…', { id: key })
      const t = await addTorrent({ source: item.hash, title: item.title, kind: 'anime' })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file in this torrent')
      if (guessPlayableExt(file.name) !== 'ok') {
        toast.warning(`"${file.name}" may not play in browsers.`)
      }
      toast.success('Streaming started', { id: key })
      openPlayer({
        infoHash: t.infoHash,
        fileIndex: file.index,
        title: item.title,
        kind: 'anime',
        fileName: file.name,
        quality: item.quality,
      })
    } catch (err) {
      toast.error((err as Error).message, { id: key })
    }
  }

  return (
    <section aria-label="Latest anime episodes">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Flame className="h-5 w-5 text-amber-400" aria-hidden />
          Latest anime episodes
        </h2>
        <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300" onClick={() => setView('anime')}>
          Browse anime →
        </Button>
      </div>

      {error ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
          Nyaa is unreachable right now — the anime catalog and search keep working.
        </p>
      ) : isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] w-64 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
          No fresh uploads right now — search anime from the Anime tab.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar" role="list">
          {items.map((item) => (
            <article
              key={item.hash}
              role="listitem"
              className="group flex w-64 shrink-0 flex-col justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-colors hover:border-amber-400/40 hover:bg-white/[0.06]"
            >
              <div className="space-y-1.5">
                <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug" title={item.title}>
                  {item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <QualityBadge quality={item.quality} />
                  {item.size ? <span>{item.size}</span> : null}
                  <Seeds count={item.seeds} leechers={item.leechers} />
                </div>
              </div>
              <Button
                size="sm"
                className="h-9 w-full bg-amber-500 font-bold text-black hover:bg-amber-400"
                onClick={() => play(item)}
                aria-label={`Play ${item.title}`}
              >
                <Play className="mr-1 h-4 w-4 fill-black" aria-hidden />
                Play
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
