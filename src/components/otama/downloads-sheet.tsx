'use client'

import { Play, Trash2, StopCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Poster } from '@/components/otama/media-card'
import { useEngineState } from '@/hooks/use-engine-state'
import { destroyTorrent, bestVideoFile, engineList, fmtSpeed, fmtEta, fmtBytes, streamUrl, guessPlayableExt } from '@/lib/engine'
import { useAppStore } from '@/store/app-store'

export function DownloadsSheet() {
  const open = useAppStore((s) => s.downloadsOpen)
  const setOpen = useAppStore((s) => s.setDownloadsOpen)
  const openPlayer = useAppStore((s) => s.openPlayer)
  const { torrents, connected } = useEngineState()
  const [opening, setOpening] = useState<string | null>(null)

  /**
   * Open a download in the player. The socket payload normally carries the
   * file list; if it does not (older snapshot), fall back to the REST list
   * before giving up — "Open" must never fail with a false "no video file".
   */
  const play = async (infoHash: string, title: string, poster?: string | null, refId?: string | null, kind?: string | null) => {
    if (opening) return
    setOpening(infoHash)
    try {
      let t = torrents.find((x) => x.infoHash === infoHash)
      if (!t || !t.files?.length) {
        const list = await engineList()
        const fresh = list.find((x) => x.infoHash.toLowerCase() === infoHash.toLowerCase())
        if (fresh) t = fresh
      }
      const file = bestVideoFile(t)
      if (!t || !file) {
        toast.error(t && !t.ready ? 'Still fetching metadata — try again in a few seconds.' : 'No video file in this torrent')
        return
      }
      if (guessPlayableExt(file.name) === 'unsupported') {
        toast.warning('This format may not play in browsers.')
      }
      setOpen(false)
      openPlayer({
        infoHash,
        fileIndex: file.index,
        title,
        poster,
        refId: t.refId || undefined,
        kind: t.kind || undefined,
        quality: undefined,
        fileName: file.name,
      })
    } finally {
      setOpening(null)
    }
  }

  const stop = async (infoHash: string) => {
    await destroyTorrent(infoHash, false)
    toast.success('Torrent stopped (files kept on disk)')
  }

  const remove = async (infoHash: string) => {
    await destroyTorrent(infoHash, true)
    toast.success('Torrent removed and files deleted')
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="flex items-center gap-2">
            Downloads
            <span className={`ml-2 inline-flex h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden />
            <span className="text-xs font-normal text-zinc-400">{connected ? 'engine online' : 'engine offline'}</span>
          </SheetTitle>
          <SheetDescription>Active torrents on this device. Files are stored temporarily.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-5 pb-5">
          {torrents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
              No active torrents. Start something from Movies, TV or Pirate Bay!
            </div>
          ) : (
            <ul className="space-y-3">
              {torrents.map((t) => (
                <li key={t.infoHash} className="flex gap-3 rounded-xl border border-white/5 bg-card p-3">
                  <Poster src={t.poster || undefined} alt={t.title} className="w-14 shrink-0 rounded-lg" ratio="aspect-[2/3]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={t.title}>
                      {t.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                      {t.ready ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Loader2 className={`h-3 w-3 ${t.done ? 'hidden' : 'animate-spin'}`} /> {t.done ? 'done' : 'downloading'}
                        </span>
                      ) : (
                        <span className="text-amber-400">fetching metadata…</span>
                      )}
                      <span>{fmtSpeed(t.downloadSpeed)}</span>
                      <span>{t.numPeers} peers</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={t.progress * 100} className="h-1.5" aria-label={`${t.title} progress`} />
                      <span className="w-9 text-right font-mono text-[10px] text-zinc-400">{Math.round(t.progress * 100)}%</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        {fmtBytes(t.downloaded)} / {fmtBytes(t.length)}
                        {!t.done && t.timeRemaining && isFinite(t.timeRemaining) ? ` · ETA ${fmtEta(t.timeRemaining)}` : ''}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => void play(t.infoHash, t.title, t.poster, t.refId, t.kind)}
                        disabled={!t.ready || opening !== null}
                      >
                        {opening === t.infoHash ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />} Open
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400 hover:text-red-400" onClick={() => stop(t.infoHash)} aria-label={`Stop ${t.title}`}>
                        <StopCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-400 hover:text-red-400" onClick={() => remove(t.infoHash)} aria-label={`Delete ${t.title}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export { streamUrl }
