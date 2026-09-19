'use client'

import { useState } from 'react'
import { Play, Loader2, ExternalLink, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { QualityBadge, Seeds } from '@/components/otama/media-card'
import { streamTorrentOption, guessPlayableExt, isHevcName, isRiskyContainer, containerOf, playableFirst } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { TorrentOption } from '@/lib/types'

const PROVIDER_LABEL: Record<string, string> = {
  tpb: 'TPB',
  eztv: 'EZTV',
  nyaa: 'Nyaa',
  yts: 'YTS',
  '1337x': '1337X',
  torrends: 'Torrends',
}

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
  const [addingHash, setAddingHash] = useState<string | null>(null)

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
        No torrents found for this selection. Try another episode/season or search Pirate Bay directly.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {torrents.map((t) => (
        <li
          key={`${t.hash}-${t.season ?? ''}-${t.episode ?? ''}`}
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
      ))}
    </ul>
  )
}
