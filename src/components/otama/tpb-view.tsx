'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Play, ExternalLink, Globe, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Seeds, QualityBadge } from '@/components/otama/media-card'
import { TorrendsSitesDialog } from '@/components/otama/torrends-sites-dialog'
import { addTorrent, bestVideoFile, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { MetaItem, TpbItem, TorrentOption } from '@/lib/types'

const TPB_CATEGORIES = [
  { value: 'all', label: 'All video' },
  { value: '201', label: 'Movies' },
  { value: '207', label: 'HD Movies' },
  { value: '205', label: 'TV Shows' },
  { value: '208', label: 'HD TV Shows' },
  { value: '209', label: '3D Movies' },
]

/** Zero-query browse chips — apibay `category:` listings, newest uploads. */
const TPB_BROWSE = [
  { value: '201', label: 'Latest movies' },
  { value: '207', label: 'HD movies' },
  { value: '205', label: 'TV shows' },
  { value: '208', label: 'HD TV shows' },
  { value: '209', label: '3D movies' },
]

const LEETX_CATEGORIES = [
  { value: 'movies', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
  { value: 'anime', label: 'Anime' },
  { value: 'games', label: 'Games' },
  { value: 'apps', label: 'Apps' },
  { value: 'music', label: 'Music' },
  { value: 'documentaries', label: 'Documentaries' },
  { value: 'other', label: 'Other' },
]

type Source = 'tpb' | 'leetx' | 'solid' | 'torrentio' | 'rarbg' | 'lime' | 'td' | 'tgx'

const SOURCE_META: Record<Source, { heading: React.ReactNode; hint: string; label: string }> = {
  tpb: {
    heading: (<>Pirate <span className="text-amber-400">Bay</span></>),
    hint: 'Search ThePirateBay directly — leave the box empty for the latest uploads.',
    label: 'Pirate Bay',
  },
  leetx: {
    heading: (<>1337<span className="text-amber-400">x</span></>),
    hint: 'Search 1337x across its mirror network — mirrors are picked automatically.',
    label: '1337x',
  },
  solid: {
    heading: (<>Solid <span className="text-amber-400">Torrents</span></>),
    hint: 'SolidTorrents — DHT index search that works even when trackers are blocked.',
    label: 'Solid Torrents',
  },
  torrentio: {
    heading: (<>Torrent<span className="text-amber-400">io</span></>),
    hint: 'Torrentio — one search across YTS, EZTV, RARBG, 1337x, Pirate Bay, Kickass, TorrentGalaxy, MagnetDL and more (keyed by IMDb).',
    label: 'Torrentio',
  },
  rarbg: {
    heading: (<>RARBG <span className="text-amber-400">archive</span></>),
    hint: 'The revived RARBG index (therarbg.to) — famous for clean x264/x265 movie & TV releases. Infohash included, no extra lookups.',
    label: 'RARBG',
  },
  lime: {
    heading: (<>Lime<span className="text-amber-400">Torrents</span></>),
    hint: 'LimeTorrents — hash-ready results across its rotating mirror domains.',
    label: 'LimeTorrents',
  },
  td: {
    heading: (<>Torrent<span className="text-amber-400">Downloads</span></>),
    hint: 'TorrentDownloads — magnets resolved from detail pages automatically.',
    label: 'TorrentDownloads',
  },
  tgx: {
    heading: (<>Torrent<span className="text-amber-400">Galaxy</span></>),
    hint: 'TorrentGalaxy (TGx) — best-effort via its proxy network; returns empty here when every mirror is unreachable.',
    label: 'TorrentGalaxy',
  },
}

const LIME_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'movies', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
  { value: 'anime', label: 'Anime' },
  { value: 'games', label: 'Games' },
  { value: 'music', label: 'Music' },
  { value: 'apps', label: 'Apps' },
  { value: 'other', label: 'Other' },
]

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

/** Torrents hub: ThePirateBay + 1337x + SolidTorrents + Torrentio + the Torrends.to site directory. */
export function TpbView() {
  const openDetail = useAppStore((s) => s.openDetail)
  const [source, setSource] = useState<Source>('tpb')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [tpbCat, setTpbCat] = useState('all')
  const [tpbBrowseCat, setTpbBrowseCat] = useState('201')
  const [leetxCat, setLeetxCat] = useState('movies')
  const [limeCat, setLimeCat] = useState('all')
  const [page, setPage] = useState(0)
  const [sitesOpen, setSitesOpen] = useState(false)

  // reset pagination when the query/source/category changes
  useEffect(() => { setPage(0) }, [q, source, tpbCat, leetxCat, limeCat])

  const tpbQuery = useQuery({
    queryKey: ['tpb', q, tpbCat],
    queryFn: () => fetchJson<{ items: TpbItem[]; error?: string }>(`/api/tpb?q=${encodeURIComponent(q)}&cat=${tpbCat === 'all' ? '' : tpbCat}`),
    staleTime: 2 * 60_000,
    enabled: source === 'tpb' && q.length > 0,
  })

  const tpbBrowseQuery = useQuery({
    queryKey: ['tpb-browse', tpbBrowseCat],
    queryFn: () => fetchJson<{ items: TpbItem[]; error?: string }>(`/api/tpb?browse=1&cat=${tpbBrowseCat}`),
    staleTime: 3 * 60_000,
    enabled: source === 'tpb' && q.length === 0,
  })

  const leetxQuery = useQuery({
    queryKey: ['leetx', q, leetxCat, page],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/1337x?q=${encodeURIComponent(q)}&cat=${leetxCat}&page=${page}`),
    staleTime: 2 * 60_000,
    enabled: source === 'leetx' && q.length > 0,
  })

  const solidQuery = useQuery({
    queryKey: ['solid', q, page],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/solid?q=${encodeURIComponent(q)}&page=${page}`),
    staleTime: 2 * 60_000,
    enabled: source === 'solid' && q.length > 0,
  })

  const torrentioQuery = useQuery({
    queryKey: ['torrentio', q],
    queryFn: () => fetchJson<{ item?: MetaItem; torrents: TorrentOption[]; error?: string }>(`/api/torrentio?q=${encodeURIComponent(q)}`),
    staleTime: 2 * 60_000,
    enabled: source === 'torrentio' && q.length > 0,
  })

  const rarbgQuery = useQuery({
    queryKey: ['rarbg', q, page],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/rarbg?q=${encodeURIComponent(q)}&page=${page + 1}`),
    staleTime: 2 * 60_000,
    enabled: source === 'rarbg' && q.length > 0,
  })

  const limeQuery = useQuery({
    queryKey: ['lime', q, limeCat, page],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/limetorrents?q=${encodeURIComponent(q)}&cat=${limeCat}&page=${page + 1}`),
    staleTime: 2 * 60_000,
    enabled: source === 'lime' && q.length > 0,
  })

  const tdQuery = useQuery({
    queryKey: ['td', q],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/torrentdownloads?q=${encodeURIComponent(q)}`),
    staleTime: 2 * 60_000,
    enabled: source === 'td' && q.length > 0,
  })

  const tgxQuery = useQuery({
    queryKey: ['tgx', q],
    queryFn: () => fetchJson<{ items: TorrentOption[]; error?: string }>(`/api/torrentgalaxy?q=${encodeURIComponent(q)}`),
    staleTime: 2 * 60_000,
    enabled: source === 'tgx' && q.length > 0,
  })

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    setQ(input.trim())
  }

  const play = async (opts: { source: string; title: string; quality?: string; refId?: string; key: string }) => {
    try {
      toast.loading('Connecting to swarm…', { id: opts.key })
      const t = await addTorrent({ source: opts.source, title: opts.title, refId: opts.refId, kind: 'tpb' })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file in this torrent')
      if (guessPlayableExt(file.name) !== 'ok') {
        toast.warning(`"${file.name}" may not play in browsers.`)
      }
      toast.success('Streaming started', { id: opts.key })
      useAppStore.getState().openPlayer({
        infoHash: t.infoHash,
        fileIndex: file.index,
        title: opts.title,
        refId: opts.refId,
        kind: 'tpb',
        fileName: file.name,
        quality: opts.quality,
      })
    } catch (err) {
      toast.error((err as Error).message, { id: opts.key })
    }
  }

  const isTpb = source === 'tpb'
  const activeQuery =
    isTpb ? (q ? tpbQuery : tpbBrowseQuery)
      : source === 'leetx' ? leetxQuery
      : source === 'solid' ? solidQuery
      : source === 'torrentio' ? torrentioQuery
      : source === 'rarbg' ? rarbgQuery
      : source === 'lime' ? limeQuery
      : source === 'td' ? tdQuery
      : tgxQuery
  const torrentItems: TorrentOption[] =
    source === 'leetx'
      ? leetxQuery.data?.items || []
      : source === 'solid'
        ? solidQuery.data?.items || []
        : source === 'torrentio'
          ? torrentioQuery.data?.torrents || []
          : source === 'rarbg'
            ? rarbgQuery.data?.items || []
            : source === 'lime'
              ? limeQuery.data?.items || []
              : source === 'td'
                ? tdQuery.data?.items || []
                : source === 'tgx'
                  ? tgxQuery.data?.items || []
                  : []
  const tpbItems: TpbItem[] = isTpb ? (q ? tpbQuery.data?.items || [] : tpbBrowseQuery.data?.items || []) : []
  const items: (TpbItem | TorrentOption)[] = isTpb ? tpbItems : torrentItems
  const matchedItem = source === 'torrentio' ? torrentioQuery.data?.item : undefined
  const serverError = (activeQuery.data as { error?: string } | undefined)?.error
    || (activeQuery.error as Error | null | undefined)?.message
    || null
  const loading = activeQuery.isLoading || activeQuery.isFetching
  const meta = SOURCE_META[source]
  const canPaginate = source === 'leetx' || source === 'solid' || source === 'rarbg' || source === 'lime'
  const hasCategory = source === 'tpb' || source === 'leetx' || source === 'lime'

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight">{meta.heading}</h1>
        <p className="text-sm text-zinc-400">{meta.hint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Torrent source">
        {(['tpb', 'leetx', 'solid', 'torrentio', 'rarbg', 'lime', 'td', 'tgx'] as Source[]).map((s) => {
          const active = source === s
          return (
            <Button
              key={s}
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSource(s)}
              className={active ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30' : 'text-zinc-400'}
              role="tab"
              aria-selected={active}
            >
              {SOURCE_META[s].label}
            </Button>
          )
        })}
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />
        <Button variant="ghost" size="sm" className="text-zinc-400" onClick={() => setSitesOpen(true)}>
          <Globe className="mr-1.5 h-4 w-4" aria-hidden />
          More sites
        </Button>
      </div>

      <form onSubmit={submit} className="flex flex-wrap gap-2" role="search">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={source === 'torrentio' ? 'Search a movie or series title…' : 'Search torrents…'}
            className="pl-9 min-h-[44px]"
            aria-label={`Search ${meta.label}`}
          />
        </div>
        {hasCategory ? (
          <Select
            value={isTpb ? tpbCat : source === 'lime' ? limeCat : leetxCat}
            onValueChange={(v) => (isTpb ? setTpbCat(v) : source === 'lime' ? setLimeCat(v) : setLeetxCat(v))}
          >
            <SelectTrigger className="w-[160px] min-h-[44px]" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {(isTpb ? TPB_CATEGORIES : source === 'lime' ? LIME_CATEGORIES : LEETX_CATEGORIES).map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button type="submit" className="bg-amber-500 font-bold text-black hover:bg-amber-400 min-h-[44px] px-6">
          Search
        </Button>
      </form>

      {serverError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {isTpb
            ? `ThePirateBay API is unavailable right now (${serverError}). It usually recovers shortly — try again or switch sources.`
            : `${meta.label} is unreachable right now (${serverError}). Try again shortly or pick another source.`}
        </div>
      ) : null}

      {!q && !serverError && isTpb ? (
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Pirate Bay browse">
          {TPB_BROWSE.map((c) => (
            <Button
              key={c.value}
              variant="ghost"
              size="sm"
              onClick={() => setTpbBrowseCat(c.value)}
              role="tab"
              aria-selected={tpbBrowseCat === c.value}
              className={tpbBrowseCat === c.value ? 'bg-white/10 text-white' : 'text-zinc-400'}
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : null}

      {!q && !serverError && !isTpb ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
          {source === 'torrentio'
            ? 'Type a movie or show title — Torrentio resolves it to IMDb and returns every indexed torrent with the exact video file pre-picked.'
            : 'Type a query and press Search — results resolve magnets automatically.'}
        </p>
      ) : null}

      {!q && !isTpb ? null : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : q === '' && items.length === 0 && !serverError && isTpb ? (
        <p className="py-12 text-center text-sm text-zinc-400">Loading the freshest Pirate Bay uploads…</p>
      ) : items.length === 0 && !serverError ? (
        <p className="py-12 text-center text-sm text-zinc-400">No results{q ? ` for “${q}”` : ''}.</p>
      ) : isTpb ? (
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="hidden md:grid grid-cols-[1fr_110px_90px_90px_110px_80px] gap-3 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <span>Name</span><span>Category</span><span>Size</span><span>Seeds</span><span>Added</span><span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-white/5">
            {(items as TpbItem[]).map((item) => (
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
                  <Button size="sm" className="h-8 bg-amber-500 font-bold text-black hover:bg-amber-400" onClick={() => play({ source: item.hash, title: item.name, quality: item.quality, refId: item.imdb, key: `tpb-${item.hash}` })} aria-label={`Play ${item.name}`}>
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
      ) : (
        <>
          {matchedItem ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
              Matched: <span className="font-semibold">{matchedItem.title}</span>
              {matchedItem.year ? ` (${matchedItem.year})` : ''} — every indexed torrent across the source sites below.
            </p>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-white/5">
            <div className="hidden md:grid grid-cols-[1fr_130px_100px_120px_80px] gap-3 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <span>Name</span><span>Source</span><span>Size</span><span>Seeds</span><span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-white/5">
              {(items as TorrentOption[]).map((item, idx) => (
                <li key={`${item.hash}-${idx}`} className="grid grid-cols-1 md:grid-cols-[1fr_130px_100px_120px_80px] gap-2 px-4 py-3 text-sm hover:bg-white/[0.03] transition-colors">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={item.title}>{item.title}</p>
                    <div className="mt-1 flex md:hidden flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <QualityBadge quality={item.quality} />
                      <span>{item.size}</span>
                      <Seeds count={item.seeds} leechers={item.leechers} />
                      <span>{SOURCE_META[source].label}</span>
                    </div>
                  </div>
                  <span className="hidden md:block text-xs text-zinc-400 self-center truncate" title={item.sourceSite ? `${SOURCE_META[source].label} · via ${item.sourceSite}` : SOURCE_META[source].label}>
                    {SOURCE_META[source].label}{item.sourceSite ? ` · ${item.sourceSite}` : ''}
                  </span>
                  <span className="hidden md:block text-xs text-zinc-400 self-center">{item.size || '—'}</span>
                  <span className="hidden md:flex self-center"><Seeds count={item.seeds} leechers={item.leechers} /></span>
                  <div className="flex md:justify-end gap-1 self-center">
                    {item.source ? (
                      <Button size="sm" className="h-8 bg-amber-500 font-bold text-black hover:bg-amber-400" onClick={() => play({ source: item.source, title: item.title, quality: item.quality, refId: matchedItem?.imdbId, key: `hub-${item.hash}` })} aria-label={`Play ${item.title}`}>
                        <Play className="h-3.5 w-3.5 fill-black" />
                      </Button>
                    ) : null}
                    {item.detailUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => window.open(item.detailUrl, '_blank', 'noopener,noreferrer')}
                        aria-label={`Open ${item.title} on ${SOURCE_META[source].label}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {q && canPaginate ? (
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
              </Button>
              <span className="text-xs text-zinc-500">page {page + 1}</span>
              <Button variant="secondary" size="sm" disabled={loading || items.length === 0} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </>
      )}

      <TorrendsSitesDialog open={sitesOpen} onOpenChange={setSitesOpen} query={q} />
    </div>
  )
}
