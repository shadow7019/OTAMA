'use client'

import { Play, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Seeds, QualityBadge } from '@/components/otama/media-card'
import { addTorrent, bestVideoFile, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { TpbItem } from '@/lib/types'

/** Compact TPB result rows used inside search tabs. */
export function TpbResultList({ items }: { items: TpbItem[] }) {
  const openDetail = useAppStore((s) => s.openDetail)

  const play = async (item: TpbItem) => {
    try {
      toast.loading('Connecting to swarm…', { id: `tpbs-${item.hash}` })
      const t = await addTorrent({ source: item.hash, title: item.name, refId: item.imdb, kind: 'tpb' })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file in this torrent')
      if (guessPlayableExt(file.name) !== 'ok') toast.warning(`"${file.name}" may not play in browsers.`)
      toast.success('Streaming started', { id: `tpbs-${item.hash}` })
      useAppStore.getState().openPlayer({
        infoHash: t.infoHash,
        fileIndex: file.index,
        title: item.name,
        refId: item.imdb,
        kind: 'tpb',
        fileName: file.name,
        quality: item.quality,
      })
    } catch (err) {
      toast.error((err as Error).message, { id: `tpbs-${item.hash}` })
    }
  }

  if (items.length === 0) return <p className="py-8 text-center text-sm text-zinc-400">No torrents found.</p>

  return (
    <ul className="space-y-2 max-w-4xl">
      {items.map((item) => (
        <li key={`${item.id}-${item.hash}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-card p-3 hover:border-amber-400/40 transition-colors">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <QualityBadge quality={item.quality} />
              <span>{item.size}</span>
              <Seeds count={item.seeds} leechers={item.leechers} />
              <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase text-[10px]">{item.category}</span>
            </div>
          </div>
          <Button size="sm" className="h-8 bg-amber-500 font-bold text-black hover:bg-amber-400" onClick={() => play(item)} aria-label={`Play ${item.name}`}>
            <Play className="h-3.5 w-3.5 fill-black" />
          </Button>
          {item.imdb ? (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => openDetail({ kind: 'movie', imdbId: item.imdb, title: item.name })} aria-label="Details">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
