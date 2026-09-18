'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Play, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Seeds, QualityBadge } from '@/components/otama/media-card'
import { addTorrent, bestVideoFile, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { TpbItem } from '@/lib/types'

const CATEGORIES = [
  { value: 'all', label: 'All video' },
  { value: '201', label: 'Movies' },
  { value: '207', label: 'HD Movies' },
  { value: '205', label: 'TV Shows' },
  { value: '208', label: 'HD TV Shows' },
  { value: '209', label: '3D Movies' },
]

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

export function TpbView() {
  const openDetail = useAppStore((s) => s.openDetail)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['tpb', q, cat],
    queryFn: () => fetchJson<{ items: TpbItem[]; error?: string }>(`/api/tpb?q=${encodeURIComponent(q)}&cat=${cat === 'all' ? '' : cat}`),
    staleTime: 2 * 60_000,
  })

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setQ(input.trim())
  }

  const play = async (item: TpbItem) => {
    try {
      toast.loading('Connecting to swarm…', { id: `tpb-${item.hash}` })
      const t = await addTorrent({ source: item.hash, title: item.name, refId: item.imdb, kind: 'tpb' })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file in this torrent')
      if (guessPlayableExt(file.name) !== 'ok') {
        toast.warning(`"${file.name}" may not play in browsers.`)
      }
      toast.success('Streaming started', { id: `tpb-${item.hash}` })
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
      toast.error((err as Error).message, { id: `tpb-${item.hash}` })
    }
  }

  const items = data?.items || []
  const serverError = data?.error || (error ? (error as Error).message : null)

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight">
          Pirate <span className="text-amber-400">Bay</span>
        </h1>
        <p className="text-sm text-zinc-400">Search ThePirateBay directly — leave the box empty for the latest uploads.</p>
      </div>

      <form onSubmit={submit} className="flex flex-wrap gap-2" role="search">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search torrents…"
            className="pl-9 min-h-[44px]"
            aria-label="Search ThePirateBay"
          />
        </div>
        <Select value={cat} onValueChange={(v) => setCat(v)}>
          <SelectTrigger className="w-[160px] min-h-[44px]" aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" className="bg-amber-500 font-bold text-black hover:bg-amber-400 min-h-[44px] px-6">
          Search
        </Button>
      </form>

      {serverError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          ThePirateBay API is unavailable right now ({serverError}). It usually recovers shortly — try again.
        </div>
      ) : null}

      {isLoading || isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 && !serverError ? (
        <p className="py-12 text-center text-sm text-zinc-400">No results{q ? ` for “${q}”` : ''}.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="hidden md:grid grid-cols-[1fr_110px_90px_90px_110px_80px] gap-3 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <span>Name</span><span>Category</span><span>Size</span><span>Seeds</span><span>Added</span><span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-white/5">
            {items.map((item) => (
              <li key={`${item.id}-${item.hash}`} className="grid grid-cols-1 md:grid-cols-[1fr_110px_90px_90px_110px_80px] gap-2 px-4 py-3 text-sm hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={item.name}>{item.name}</p>
                  <div className="mt-1 flex md:hidden flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <QualityBadge quality={item.quality} />
                    <span>{item.size}</span>
                    <Seeds count={item.seeds} leechers={item.leechers} />
                    <span>{item.category}</span>
                  </div>
                </div>
                <span className="hidden md:block text-xs text-zinc-400 self-center">{item.category}</span>
                <span className="hidden md:block text-xs text-zinc-400 self-center">{item.size}</span>
                <span className="hidden md:flex self-center"><Seeds count={item.seeds} leechers={item.leechers} /></span>
                <span className="hidden md:block text-xs text-zinc-500 self-center">{item.added ? item.added.slice(0, 10) : '—'}</span>
                <div className="flex md:justify-end gap-1 self-center">
                  <Button size="sm" className="h-8 bg-amber-500 font-bold text-black hover:bg-amber-400" onClick={() => play(item)} aria-label={`Play ${item.name}`}>
                    <Play className="h-3.5 w-3.5 fill-black" />
                  </Button>
                  {item.imdb ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => openDetail({ kind: 'movie', imdbId: item.imdb, title: item.name })}
                      aria-label={`Details for ${item.name}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
