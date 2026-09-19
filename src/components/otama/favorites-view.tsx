'use client'

import { useEffect, useState } from 'react'
import { Heart, Trash2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Poster } from '@/components/otama/media-card'
import { addTorrent, bestVideoFile, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'

interface FavRow {
  id: string
  kind: string
  refId: string
  title: string
  year?: number | null
  poster?: string | null
  rating?: number | null
  metaJson?: string | null
}

export function FavoritesView() {
  const openDetail = useAppStore((s) => s.openDetail)
  const openPlayer = useAppStore((s) => s.openPlayer)
  const [favs, setFavs] = useState<FavRow[] | null>(null)

  const load = () => {
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((d) => setFavs(d.favorites || []))
      .catch(() => setFavs([]))
  }
  useEffect(load, [])

  const remove = async (row: FavRow) => {
    try {
      await fetch(`/api/favorites?kind=${row.kind}&refId=${encodeURIComponent(row.refId)}`, { method: 'DELETE' })
      setFavs((prev) => prev?.filter((f) => f.id !== row.id) || [])
      toast.success('Removed from favorites')
    } catch {
      toast.error('Failed to remove')
    }
  }

  const open = (row: FavRow) => {
    if (row.kind === 'tpb') {
      // raw torrent favorite — refId stores the info hash; stream it directly
      playRawTorrent(row)
      return
    }
    openDetail({
      kind: (row.kind === 'anime' ? 'anime' : row.kind) as 'movie' | 'tv' | 'anime',
      imdbId: row.refId.startsWith('tt') ? row.refId : undefined,
      title: row.title,
      poster: row.poster || undefined,
      year: row.year || undefined,
    })
  }

  const playRawTorrent = async (row: FavRow) => {
    const hash = row.refId
    if (!/^[0-9a-f]{40}$/i.test(hash) && !hash.startsWith('magnet:')) {
      toast.error('This favorite has no playable torrent attached — remove and re-save it.')
      return
    }
    try {
      toast.loading('Connecting to swarm…', { id: `fav-${row.id}` })
      const t = await addTorrent({ source: hash, title: row.title, kind: 'tpb' })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file in this torrent')
      if (guessPlayableExt(file.name) !== 'ok') toast.warning(`"${file.name}" may not play in browsers.`)
      toast.success('Streaming started', { id: `fav-${row.id}` })
      openPlayer({
        infoHash: t.infoHash,
        fileIndex: file.index,
        title: row.title,
        poster: row.poster || null,
        kind: 'tpb',
        fileName: file.name,
      })
    } catch (err) {
      toast.error((err as Error).message || 'Failed to stream favorite', { id: `fav-${row.id}` })
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-black tracking-tight">Favorites</h1>
        <Heart className="h-5 w-5 fill-amber-400 text-amber-400" />
      </div>
      {favs === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : favs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <Heart className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">Nothing saved yet. Tap the heart on any title to keep it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {favs.map((row) => (
            <div key={row.id} className="group relative">
              <button onClick={() => open(row)} className="w-full text-left rounded-xl overflow-hidden ring-1 ring-white/5 hover:ring-amber-400/60 transition-all min-h-[44px]" aria-label={`Open ${row.title}`}>
                <Poster src={row.poster || undefined} alt={row.title} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 pt-8">
                  <p className="text-sm font-semibold line-clamp-1">{row.title}</p>
                  <p className="text-xs text-zinc-400">{row.year || row.kind}</p>
                </div>
                {row.rating ? (
                  <span className="absolute top-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                    ★ {row.rating.toFixed(1)}
                  </span>
                ) : null}
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(row)}
                className="absolute left-2 top-2 h-7 w-7 rounded-full bg-black/60 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 hover:text-white"
                aria-label={`Remove ${row.title} from favorites`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ContinueWatchingRow() {
  const openPlayer = useAppStore((s) => s.openPlayer)
  const setDownloadsOpen = useAppStore((s) => s.setDownloadsOpen)
  const [entries, setEntries] = useState<{ refId: string; title: string; poster?: string | null; infoHash: string; fileIndex: number; position: number; duration?: number | null }[] | null>(null)

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => setEntries((d.history || []).filter((h: { position: number; infoHash: string }) => h.position > 10 && h.infoHash)))
      .catch(() => setEntries([]))
  }, [])

  if (entries === null || entries.length === 0) return null

  const resume = async (e: (typeof entries)[number]) => {
    // Check engine still has the torrent; if not, add via magnet? For simplicity try stream directly.
    openPlayer({ infoHash: e.infoHash, fileIndex: e.fileIndex, title: e.title, poster: e.poster, refId: e.refId })
  }

  return (
    <section className="space-y-3 px-1" aria-label="Continue watching">
      <h2 className="text-lg font-bold tracking-tight">
        Continue <span className="text-amber-400">watching</span>
      </h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {entries.map((e) => {
          const pct = e.duration ? Math.min(100, (e.position / e.duration) * 100) : 8
          return (
            <div key={e.refId} className="relative w-[210px] shrink-0 group">
              <button
                onClick={() => resume(e)}
                className="block w-full text-left rounded-xl overflow-hidden ring-1 ring-white/5 hover:ring-amber-400/60 transition-all min-h-[44px]"
                aria-label={`Resume ${e.title}`}
              >
                <Poster src={e.poster || undefined} alt={e.title} ratio="aspect-video" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500">
                    <Play className="h-5 w-5 fill-black text-black" />
                  </span>
                </span>
                <span className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 to-transparent">
                  <span className="block text-sm font-semibold truncate">{e.title}</span>
                  <span className="mt-1 block h-1 w-full rounded-full bg-white/20">
                    <span className="block h-1 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <Button variant="ghost" size="sm" className="text-xs text-zinc-400" onClick={() => setDownloadsOpen(true)}>
        Managing active downloads…
      </Button>
    </section>
  )
}
