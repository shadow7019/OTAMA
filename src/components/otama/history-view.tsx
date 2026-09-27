'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Poster } from '@/components/otama/media-card'
import { useAppStore } from '@/store/app-store'

interface HistoryRow {
  refId: string
  title: string
  poster?: string | null
  kind: string
  infoHash: string
  fileIndex: number
  position: number
  duration?: number | null
  updatedAt: string
}

/**
 * Watch history — private to the signed-in account. Remove a single entry or
 * clear everything; deletion only touches THIS account's rows server-side.
 */
export function HistoryView() {
  const openPlayer = useAppStore((s) => s.openPlayer)
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(() => {
    fetch('/api/history', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => setRows(d.history || []))
      .catch(() => setRows([]))
  }, [])
  useEffect(load, [load])

  const remove = async (row: HistoryRow) => {
    try {
      const r = await fetch(`/api/history?refId=${encodeURIComponent(row.refId)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('failed')
      setRows((prev) => prev?.filter((x) => x.refId !== row.refId) || [])
      toast.success('Removed from history')
    } catch {
      toast.error('Could not remove that entry')
    }
  }

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000) // auto-disarm
      return
    }
    try {
      const r = await fetch('/api/history?refId=all', { method: 'DELETE' })
      if (!r.ok) throw new Error('failed')
      setRows([])
      toast.success('History cleared')
    } catch {
      toast.error('Could not clear history')
    } finally {
      setConfirmClear(false)
    }
  }

  const resume = (row: HistoryRow) => {
    openPlayer({ infoHash: row.infoHash, fileIndex: row.fileIndex, title: row.title, poster: row.poster, refId: row.refId })
  }

  const fmtAgo = (iso: string) => {
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  const fmtPos = (row: HistoryRow) => {
    const f = (t: number) => {
      const h = Math.floor(t / 3600)
      const m = Math.floor((t % 3600) / 60)
      const sec = Math.floor(t % 60)
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
    }
    return row.duration ? `${f(row.position)} / ${f(row.duration)}` : f(row.position)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
          History
          <History className="h-5 w-5 text-amber-400" aria-hidden />
        </h1>
        {rows && rows.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            className={
              'ml-auto min-h-[44px] border-white/10 hover:bg-red-500/20 hover:text-red-300 ' +
              (confirmClear ? 'border-red-500/60 bg-red-500/20 text-red-300' : 'text-zinc-300')
            }
            aria-label={confirmClear ? 'Confirm: clear entire history' : 'Clear entire history'}
          >
            <Trash2 className="h-4 w-4" />
            {confirmClear ? 'Tap again to clear everything' : 'Clear all'}
          </Button>
        ) : null}
      </div>

      {rows === null ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <History className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-sm text-zinc-400">
            Nothing watched yet on this account. Anything you play shows up here so you can resume it later.
          </p>
        </div>
      ) : (
        <ul className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const pct = row.duration ? Math.min(100, (row.position / row.duration) * 100) : 4
            return (
              <li key={row.refId} className="group relative flex items-center gap-3 rounded-xl border border-white/5 bg-zinc-900/50 p-2.5 transition-colors hover:border-amber-400/40">
                <button
                  onClick={() => resume(row)}
                  className="relative w-36 shrink-0 overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-amber-400"
                  aria-label={`Resume ${row.title}`}
                >
                  <Poster src={row.poster || undefined} alt="" ratio="aspect-video" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500">
                      <Play className="h-4 w-4 fill-black text-black" />
                    </span>
                  </span>
                  <span className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-white/25">
                    <span className="block h-1 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={row.title}>{row.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {fmtPos(row)} · {fmtAgo(row.updatedAt)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-zinc-600">{row.kind}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(row)}
                  className="h-9 w-9 shrink-0 text-zinc-400 hover:bg-red-500/20 hover:text-red-300"
                  aria-label={`Remove ${row.title} from history`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
