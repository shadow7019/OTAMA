'use client'

import { useMemo, useState } from 'react'
import { Play, Loader2, ExternalLink, ShieldAlert, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { QualityBadge, Seeds } from '@/components/otama/media-card'
import { streamTorrentOption, guessPlayableExt, isHevcName, isRiskyContainer, containerOf, playableFirst } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import { groupTorrentsByQuality, BUCKET_META, QUALITY_BUCKETS, type QualityBucket } from '@/lib/quality'
import type { TorrentOption } from '@/lib/types'

const PROVIDER_LABEL: Record<string, string> = {
  tpb: 'TPB',
  eztv: 'EZTV',
  nyaa: 'Nyaa',
  yts: 'YTS',
  '1337x': '1337X',
  rarbg: 'RARBG',
  limetorrents: 'LimeTorrents',
  torrentdownloads: 'TorrentDownloads',
  torrentgalaxy: 'TorrentGalaxy',
  torrends: 'Torrends',
  torrentio: 'Torrentio',
  solidtorrents: 'Solid Torrents',
}

/**
 * Streaming links grouped by resolution & quality (4K → 1440p → 1080p → 720p →
 * SD → Other) with one-tap filter chips — so users can go straight to the
 * release type they want instead of scrolling a mixed wall of torrents.
 * Order inside every bucket is preserved from the server (browser-playable
 * first, then most seeded).
 */
export function TorrentList({
  torrents,
  meta,
  compact,
}: {
  torrents: TorrentOption[]
  meta?: { poster?: string; refId?: string; kind?: string; title?: string }
  compact?: boolean
}) {
  const openPlayer = useAppStore((s) => s.openPlayer)
  const closeDetail = useAppStore((s) => s.closeDetail)
  const setQuery = useAppStore((s) => s.setQuery)
  const setView = useAppStore((s) => s.setView)
  const [addingHash, setAddingHash] = useState<string | null>(null)
  const [filter, setFilter] = useState<QualityBucket | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<QualityBucket>>(new Set())

  const groups = useMemo(() => groupTorrentsByQuality(torrents), [torrents])
  const counts = useMemo(() => {
    const m = new Map<QualityBucket, number>()
    for (const g of groups) m.set(g.bucket, g.torrents.length)
    return m
  }, [groups])

  const play = async (option: TorrentOption) => {
    if (addingHash) return
    setAddingHash(option.hash)
    const startedAt = Date.now()
    const ticker = setInterval(() => {
      toast.loading(`Connecting to swarm… ${Math.round((Date.now() - startedAt) / 1000)}s — rare releases can take a minute`, { id: 'add-torrent' })
    }, 5000)
    try {
      const blocked = isHevcName(option.title) || option.codec === 'hevc'
      if (blocked) {
        toast.warning('HEVC/x265 release — most browsers cannot decode it. Picking it anyway; if it stays buffering, switch to a non-HEVC torrent from the player.', { duration: 8000 })
      }
      toast.loading('Connecting to swarm…', { id: 'add-torrent' })
      const { torrent, file } = await streamTorrentOption(option, meta)
      const ext = guessPlayableExt(file.name)
      if (ext === 'unsupported') {
        toast.warning(`"${file.name}" may not be playable in browsers. Trying anyway…`)
      } else if (ext === 'maybe') {
        toast.info('MKV/MOV streaming works in Chromium-based browsers — if playback fails, try an MP4 release.')
      }
      toast.success('Streaming started', { id: 'add-torrent' })
      closeDetail()
      openPlayer({
        infoHash: torrent.infoHash,
        fileIndex: file.index,
        title: meta?.title || option.title,
        poster: meta?.poster || null,
        refId: meta?.refId,
        kind: meta?.kind,
        season: option.season,
        episode: option.episode,
        quality: option.quality,
        fileName: file.name,
        alternatives: playableFirst(torrents.filter((t) => t.source && t.hash !== option.hash)).slice(0, 10),
      })
    } catch (err) {
      toast.error((err as Error).message || 'Failed to start torrent', { id: 'add-torrent' })
    } finally {
      clearInterval(ticker)
      setAddingHash(null)
    }
  }

  if (torrents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-400">
        <p>No torrents found for this selection. Try another episode/season or search every site directly.</p>
        {meta?.title ? (
          <Button
            size="sm"
            className="mt-3 bg-amber-500 font-bold text-black hover:bg-amber-400 min-h-[44px]"
            onClick={() => {
              closeDetail()
              setQuery(meta.title!)
              setView('search')
            }}
          >
            <Search className="mr-1.5 h-4 w-4" /> Search “{meta.title}” across all torrent sites
          </Button>
        ) : null}
      </div>
    )
  }

  const renderRow = (t: TorrentOption, idx: number) => (
    <li
      key={`${t.hash}-${t.season ?? ''}-${t.episode ?? ''}-${idx}`}
      className="group flex items-center gap-3 rounded-xl border border-white/5 bg-card p-3 transition-colors hover:border-amber-400/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" title={t.title}>
          {t.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <QualityBadge quality={t.quality} />
          {t.size ? <span>{t.size}</span> : null}
          <Seeds count={t.seeds} leechers={t.leechers} />
          <span className="rounded bg-white/5 px-1.5 py-0.5 uppercase text-[10px] tracking-wide text-zinc-400">
            {PROVIDER_LABEL[t.provider] || t.provider}
          </span>
          {t.sourceSite ? (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400" title={`Indexed from ${t.sourceSite}`}>
              via {t.sourceSite}
            </span>
          ) : null}
          {t.status === 'vip' || t.status === 'trusted' ? (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300 uppercase">
              {t.status}
            </span>
          ) : null}
          {isHevcName(t.title) || t.codec === 'hevc' ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 uppercase"
              title="HEVC/x265 — browsers usually cannot decode this codec; prefer an H.264/x264 release"
            >
              <ShieldAlert className="h-3 w-3" /> HEVC
            </span>
          ) : null}
          {isRiskyContainer(t.title) ? (
            <span
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 uppercase"
              title={`${(containerOf(t.title) || 'mkv').toUpperCase()} container — plays in Chromium-based browsers, but not Firefox/Safari; an MP4 release is more compatible`}
            >
              {containerOf(t.title)}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => play(t)}
        disabled={addingHash !== null}
        className="bg-amber-500 text-black hover:bg-amber-400 font-bold shrink-0 min-h-[36px]"
        aria-label={`Play ${t.title}`}
      >
        {addingHash === t.hash ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-black" />}
        {!compact && <span className="ml-1">Play</span>}
      </Button>
      {t.detailUrl ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 shrink-0"
          onClick={() => window.open(t.detailUrl, '_blank', 'noopener,noreferrer')}
          aria-label={`Open ${t.title} on source site`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </li>
  )

  const renderRows = (list: TorrentOption[], bucket: QualityBucket) => {
    // long buckets collapse behind a cap so a 40-row 1080p wall doesn't bury
    // the other quality groups (expandable with one click)
    const CAP = 6
    const isExpanded = expanded.has(bucket)
    const overflow = list.length > CAP && !isExpanded
    const visible = overflow ? list.slice(0, CAP) : list
    return (
      <div className={overflow ? 'otama-scroll max-h-[420px] overflow-y-auto pr-1' : ''}>
        <ul className="space-y-2">{visible.map((t, i) => renderRow(t, i))}</ul>
        {overflow ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-amber-400 hover:text-amber-300 min-h-[36px]"
            onClick={() => setExpanded((prev) => new Set(prev).add(bucket))}
            aria-label={`Show all ${list.length} ${BUCKET_META[bucket].short} torrents`}
          >
            Show all {list.length} {BUCKET_META[bucket].short} torrents
          </Button>
        ) : null}
      </div>
    )
  }

  const chip = (active: boolean) =>
    `min-h-[32px] rounded-full border px-3 text-xs font-semibold transition-colors ${
      active ? 'bg-amber-500 text-black border-amber-400 hover:bg-amber-400' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
    }`

  return (
    <div className="space-y-3">
      {/* quality filter chips — only non-empty buckets, best first */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by quality">
        <button type="button" className={chip(filter === 'all')} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>
          All ({torrents.length})
        </button>
        {QUALITY_BUCKETS.filter((b) => counts.get(b)).map((b) => (
          <button
            key={b}
            type="button"
            className={chip(filter === b)}
            onClick={() => setFilter(filter === b ? 'all' : b)}
            aria-pressed={filter === b}
          >
            {BUCKET_META[b].short} ({counts.get(b)})
          </button>
        ))}
      </div>

      {filter === 'all' ? (
        groups.map(({ bucket, torrents: list }) => (
          <section key={bucket} aria-label={BUCKET_META[bucket].label} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${BUCKET_META[bucket].badge}`}>
                {BUCKET_META[bucket].label}
              </span>
              <span className="text-xs text-zinc-500">{list.length} {list.length === 1 ? 'link' : 'links'}</span>
            </div>
            {renderRows(list, bucket)}
          </section>
        ))
      ) : (
        <ul className="space-y-2">
          {(groups.find((g) => g.bucket === filter)?.torrents || []).map((t, i) => renderRow(t, i))}
        </ul>
      )}
    </div>
  )
}
