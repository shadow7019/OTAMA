'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, ArrowDownToLine, Signal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { QualityBadge } from '@/components/otama/media-card'
import { useEngineState } from '@/hooks/use-engine-state'
import { streamUrl, fmtSpeed, fmtEta, fmtBytes, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { PlayerPayload } from '@/lib/types'

async function saveHistory(p: PlayerPayload, position: number, duration?: number) {
  if (!p.refId || position < 5) return
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refId: p.refId,
        title: p.title,
        poster: p.poster,
        kind: p.kind || 'movie',
        infoHash: p.infoHash,
        fileIndex: p.fileIndex,
        position,
        duration,
      }),
    })
  } catch { /* non-fatal */ }
}

export function PlayerOverlay() {
  const player = useAppStore((s) => s.player)
  const closePlayer = useAppStore((s) => s.closePlayer)
  const { torrents } = useEngineState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [waiting, setWaiting] = useState(true)
  const lastSave = useRef(0)

  const active = torrents.find((t) => t.infoHash === player?.infoHash)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayer()
    }
    if (player) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, closePlayer])

  // resume position lookup
  useEffect(() => {
    if (!player?.refId) return
    let cancelled = false
    fetch(`/api/history`)
      .then((r) => r.json())
      .then((d: { history: { refId: string; position: number; infoHash: string }[] }) => {
        if (cancelled) return
        const entry = d.history?.find((h) => h.refId === player.refId && h.infoHash === player.infoHash)
        const v = videoRef.current
        if (entry && entry.position > 30 && v) {
          const seek = () => {
            v.currentTime = Math.min(entry.position, (v.duration || Infinity) - 5)
            v.removeEventListener('loadedmetadata', seek)
          }
          v.addEventListener('loadedmetadata', seek)
          toast.info(`Resuming from ${Math.floor(entry.position / 60)}m — press Escape to exit`)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [player])

  // periodic + final progress save
  useEffect(() => {
    if (!player) return
    const v = videoRef.current
    const onTime = () => {
      const now = Date.now()
      if (now - lastSave.current > 10_000 && v && !v.paused) {
        lastSave.current = now
        void saveHistory(player, v.currentTime, v.duration)
      }
    }
    v?.addEventListener('timeupdate', onTime)
    return () => {
      v?.removeEventListener('timeupdate', onTime)
      const vv = videoRef.current
      if (vv && vv.currentTime > 5) void saveHistory(player, vv.currentTime, vv.duration)
    }
  }, [player])

  if (!player) return null

  const ext = guessPlayableExt(player.fileName)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col"
        role="dialog"
        aria-label={`Playing ${player.title}`}
      >
        {/* top bar */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const v = videoRef.current
              if (v && v.currentTime > 5) void saveHistory(player, v.currentTime, v.duration)
              closePlayer()
            }}
            className="rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close player"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{player.title}</p>
            {player.fileName ? <p className="truncate text-xs text-zinc-400">{player.fileName}</p> : null}
          </div>
          {player.quality ? <QualityBadge quality={player.quality} className="ml-auto shrink-0" /> : null}
        </div>

        {/* video */}
        <div className="relative flex-1 flex items-center justify-center min-h-0">
          {waiting && (
            <div className="absolute z-10 flex flex-col items-center gap-3 text-zinc-300">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="text-sm">Buffering — streaming from the swarm…</p>
              {ext === 'unsupported' && (
                <p className="max-w-sm text-center text-xs text-amber-300/90">
                  This format (e.g. AVI/TS) usually can&apos;t play in browsers. Consider another torrent.
                </p>
              )}
            </div>
          )}
          <video
            ref={videoRef}
            src={streamUrl(player.infoHash, player.fileIndex)}
            controls
            autoPlay
            playsInline
            className="h-full w-full object-contain"
            onWaiting={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}
            onError={() => {
              setWaiting(false)
              toast.error('Playback error — this file may be unsupported or the torrent has no seeds. Try another quality.')
            }}
          />
        </div>

        {/* stats bar */}
        <div className="z-10 border-t border-white/10 bg-black/90 px-4 py-2.5">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1.5 sm:gap-x-6 text-xs text-zinc-300">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${active?.done ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              {active?.done ? 'Completed — seeding' : 'Streaming'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-zinc-500" /> {active?.numPeers ?? 0} peers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5 text-zinc-500" /> {fmtSpeed(active?.downloadSpeed || 0)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Signal className="h-3.5 w-3.5 text-zinc-500" /> {fmtBytes(active?.downloaded || 0)} / {fmtBytes(active?.length || 0)}
            </span>
            {active && !active.done ? <span>ETA {fmtEta(active.timeRemaining)}</span> : null}
            <div className="ml-auto flex min-w-[140px] flex-1 items-center gap-2">
              <Progress value={(active?.progress || 0) * 100} className="h-1.5" aria-label="Torrent download progress" />
              <span className="w-10 text-right font-mono text-[10px]">{Math.round((active?.progress || 0) * 100)}%</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
