'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, ArrowDownToLine, Signal, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { QualityBadge } from '@/components/otama/media-card'
import { useEngineState } from '@/hooks/use-engine-state'
import { streamUrl, fmtSpeed, fmtEta, fmtBytes, guessPlayableExt, ensureTorrent, isHevcName, addTorrent, bestVideoFile } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'
import type { PlayerPayload, TorrentOption } from '@/lib/types'

const STALL_HINT_AFTER_MS = 12_000

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
  const openPlayer = useAppStore((s) => s.openPlayer)
  const closePlayer = useAppStore((s) => s.closePlayer)
  const { torrents, connected } = useEngineState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [waiting, setWaiting] = useState(true)
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const lastSave = useRef(0)
  const retryCount = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = torrents.find((t) => t.infoHash === player?.infoHash)
  /** Metadata resolved on the engine — only then does <video> get mounted. */
  const ready = !!active?.ready

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayer()
    }
    if (player) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, closePlayer])

  // reset per-torrent state
  useEffect(() => {
    setWaiting(true)
    setWaitingSince(Date.now())
    setError(null)
    retryCount.current = 0
    if (retryTimer.current) clearTimeout(retryTimer.current)
  }, [player?.infoHash, player?.fileIndex])

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [])

  // Re-add the torrent if the engine dropped it (restart / LRU eviction / resume from history).
  useEffect(() => {
    if (!player || active) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled || active) return
      ensureTorrent(player.infoHash, {
        title: player.title,
        poster: player.poster || undefined,
        refId: player.refId,
        kind: player.kind,
      }).catch(() => {
        if (!cancelled) setError('Torrent is no longer on the engine and could not be re-added.')
      })
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [player, active])

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

  // stall watchdog: if we never get playable data, surface a diagnosis
  useEffect(() => {
    if (!waiting) {
      setWaitingSince(null)
      return
    }
    if (waitingSince === null) setWaitingSince(Date.now())
    const iv = setInterval(() => {
      if (!videoRef.current) return
      // if bytes are flowing but frames aren't decoding, that's a codec issue
      if (videoRef.current.readyState >= 3) setWaiting(false)
    }, 1000)
    return () => clearInterval(iv)
  }, [waiting, waitingSince])

  const switchTo = async (option: TorrentOption) => {
    if (switching) return
    setSwitching(option.hash)
    try {
      toast.loading('Connecting to swarm…', { id: 'switch-torrent' })
      const t = await addTorrent({
        source: option.source,
        title: option.title,
        poster: player?.poster || undefined,
        refId: player?.refId,
        kind: player?.kind,
      })
      const file = bestVideoFile(t)
      if (!file) throw new Error('No video file found in this torrent')
      toast.success(`Switched to ${option.quality || option.title}`, { id: 'switch-torrent' })
      openPlayer({
        infoHash: t.infoHash,
        fileIndex: file.index,
        title: player?.title || option.title,
        poster: player?.poster || null,
        refId: player?.refId,
        kind: player?.kind,
        quality: option.quality,
        fileName: file.name,
        alternatives: player?.alternatives?.filter((a) => a.hash !== option.hash),
      })
    } catch (err) {
      toast.error((err as Error).message || 'Switch failed', { id: 'switch-torrent' })
    } finally {
      setSwitching(null)
    }
  }

  if (!player) return null

  const ext = guessPlayableExt(player.fileName)
  const currentIsHevc = isHevcName(player.fileName)
  const stalledLong = ready && waiting && waitingSince !== null && Date.now() - waitingSince > STALL_HINT_AFTER_MS
  const swarmAlive = (active?.numPeers || 0) > 0 && (active?.downloadSpeed || 0) > 1024
  const showDiagnostics = stalledLong || !!error

  const stageLabel = !active
    ? 'Adding torrent to the engine…'
    : !ready
      ? 'Connecting to swarm — fetching metadata…'
      : 'Buffering — streaming from the swarm…'

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
          {currentIsHevc ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300 uppercase">
              <ShieldAlert className="h-3 w-3" /> HEVC
            </span>
          ) : null}
          {player.quality ? <QualityBadge quality={player.quality} className="ml-auto shrink-0" /> : null}
        </div>

        {/* video — mounted only once the engine has resolved the torrent metadata,
            so it can never hit a 404/503 and die with MEDIA_ERR_SRC_NOT_SUPPORTED */}
        <div className="relative flex-1 flex items-center justify-center min-h-0">
          {showDiagnostics ? (
            <div className="absolute z-20 flex max-h-[85%] w-[min(92%,560px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 text-zinc-200 shadow-2xl otama-scroll">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {error ? 'Playback problem' : 'Stuck buffering? Here is what OTAMA sees'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {error ? (
                      error
                    ) : currentIsHevc ? (
                      <>
                        This file is <span className="font-semibold text-red-300">HEVC/x265</span> — the swarm is
                        {swarmAlive ? ' streaming data fine' : ` at ${fmtSpeed(active?.downloadSpeed || 0)} with ${active?.numPeers ?? 0} peers`},
                        but browsers cannot decode HEVC without hardware support. Switch to an H.264/x264 release below.
                      </>
                    ) : ext === 'unsupported' ? (
                      <>This container (AVI/TS) cannot play inside browsers. Pick a different release below.</>
                    ) : ext === 'maybe' ? (
                      <>
                        This file is <span className="font-semibold text-amber-300">MKV/MOV</span> — it plays in
                        Chromium-based browsers but not Firefox/Safari. For maximum compatibility switch to an MP4
                        release below.
                      </>
                    ) : (
                      <>
                        Swarm status: {connected ? `${active?.numPeers ?? 0} peers · ${fmtSpeed(active?.downloadSpeed || 0)}` : 'engine offline'}.
                        {swarmAlive
                          ? ' Data is flowing — if this persists the release may use an unsupported codec. Try another torrent.'
                          : ' No meaningful data from the swarm — this torrent looks dead/slow. Try another one below.'}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {(player.alternatives?.length ?? 0) > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Try another torrent</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 otama-scroll">
                    {player.alternatives!.map((a) => {
                      const aHevc = isHevcName(a.title) || a.codec === 'hevc'
                      return (
                        <button
                          key={`${a.hash}-${a.season ?? ''}-${a.episode ?? ''}`}
                          onClick={() => void switchTo(a)}
                          disabled={switching !== null}
                          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left text-xs transition-colors hover:border-amber-400/50 hover:bg-white/10 disabled:opacity-50 min-h-[44px]"
                        >
                          {switching === a.hash ? (
                            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                          ) : (
                            <span className={`h-2 w-2 shrink-0 rounded-full ${aHevc ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          )}
                          <span className="min-w-0 flex-1 truncate">{a.title}</span>
                          {a.quality ? <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">{a.quality}</span> : null}
                          <span className="shrink-0 text-zinc-500">{a.seeds ?? 0} seeds</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  No alternative torrents were loaded for this title — close the player and pick another quality from the details screen.
                </p>
              )}

              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => {
                  setWaitingSince(Date.now())
                  setError(null)
                  const v = videoRef.current
                  if (v) {
                    v.load()
                    void v.play().catch(() => {})
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry this torrent
              </Button>
            </div>
          ) : !ready || waiting ? (
            <div className="absolute z-10 flex flex-col items-center gap-3 text-zinc-300">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <p className="text-sm">{stageLabel}</p>
              {!ready && retryCount.current > 0 ? (
                <p className="text-xs text-amber-300/90">Reconnecting (attempt {retryCount.current + 1}/4)…</p>
              ) : null}
              <p className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> {active?.numPeers ?? 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowDownToLine className="h-3 w-3" /> {fmtSpeed(active?.downloadSpeed || 0)}
                </span>
                {!connected ? (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <WifiOff className="h-3 w-3" /> engine offline
                  </span>
                ) : null}
              </p>
              {ext === 'unsupported' && (
                <p className="max-w-sm text-center text-xs text-amber-300/90">
                  This format (e.g. AVI/TS) usually can&apos;t play in browsers. Consider another torrent.
                </p>
              )}
            </div>
          ) : null}
          {ready ? (
            <video
              ref={videoRef}
              src={streamUrl(player.infoHash, player.fileIndex)}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="h-full w-full object-contain"
              onWaiting={() => {
                setWaiting(true)
                setWaitingSince((s) => s ?? Date.now())
              }}
              onPlaying={() => setWaiting(false)}
              onCanPlay={() => setWaiting(false)}
              onError={() => {
                // Transient races (engine restart / eviction / pending metadata)
                // used to kill playback permanently with MediaError 4 — auto
                // retry a few times before showing the diagnostics card.
                const dataFlowing = (active?.downloaded || 0) > 2 * 1024 * 1024
                if (!dataFlowing && retryCount.current < 3) {
                  const attempt = retryCount.current++
                  if (retryTimer.current) clearTimeout(retryTimer.current)
                  retryTimer.current = setTimeout(
                    () => {
                      const v = videoRef.current
                      if (!v) return
                      v.load()
                      void v.play().catch(() => {})
                    },
                    [1500, 4000, 8000][attempt] ?? 8000,
                  )
                  return
                }
                setWaiting(false)
                setError('The browser could not decode this file — it may use an unsupported codec/container, or the torrent has no seeds. Try another quality below.')
              }}
            />
          ) : null}
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
