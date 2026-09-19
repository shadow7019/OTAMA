'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ShieldCheck, ShieldAlert, CircleDashed, ExternalLink, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface TmdbStatus {
  configured: boolean
  mode?: 'v3' | 'v4'
  source?: 'db' | 'env'
  valid?: boolean
  error?: string
}

/** Settings dialog — connect your own TMDB API key for the richer catalog. */
export function TmdbDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [status, setStatus] = useState<TmdbStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'load' | 'save' | 'remove' | null>(null)

  const load = useCallback(async () => {
    setBusy('load')
    try {
      const res = await fetch('/api/tmdb', { cache: 'no-store' })
      setStatus((await res.json()) as TmdbStatus)
    } catch {
      setStatus({ configured: false, error: 'status check failed' })
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setKey('')
      void load()
    }
  }, [open, load])

  const save = async () => {
    const trimmed = key.trim()
    if (!trimmed) return
    setBusy('save')
    try {
      const res = await fetch('/api/tmdb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      })
      const data = (await res.json()) as TmdbStatus & { error?: string }
      if (!res.ok) {
        toast.error(data.error || 'TMDB rejected this key')
        return
      }
      setStatus(data)
      setKey('')
      toast.success('TMDB connected — catalogs and search now use The Movie Database')
    } catch {
      toast.error('Failed to save the key')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    try {
      await fetch('/api/tmdb', { method: 'DELETE' })
      setStatus({ configured: false })
      toast.success('TMDB key removed — back to keyless providers')
    } catch {
      toast.error('Failed to remove the key')
    } finally {
      setBusy(null)
    }
  }

  const statusBadge = () => {
    if (busy === 'load' || !status) return <CircleDashed className="h-4 w-4 animate-spin text-zinc-500" />
    if (status.configured && status.valid) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Connected ({status.mode === 'v4' ? 'v4 token' : 'v3 key'}, from {status.source === 'db' ? 'app settings' : 'environment'})
        </span>
      )
    }
    if (status.configured && status.valid === false) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          Key rejected by TMDB — replace it below
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
        Not connected — using keyless providers
      </span>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto otama-scroll">
        <DialogHeader>
          <DialogTitle>TMDB integration</DialogTitle>
          <DialogDescription className="text-left">
            Connect <span className="text-zinc-300">The Movie Database</span> for trending/popular/top-rated
            browse, richer posters &amp; backdrops, and deeper search. Everything works without a key too —
            OTAMA falls back to its keyless providers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">{statusBadge()}</div>

          <div className="space-y-2">
            <label htmlFor="tmdb-key" className="text-sm font-medium text-zinc-300">
              API key or Read Access Token
            </label>
            <Input
              id="tmdb-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. 3f8a… (v3) or eyJhbGciOi… (v4)"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
            />
            <p className="text-xs leading-relaxed text-zinc-500">
              Free: create a TMDB account → Settings → API → Request an API key. Paste the
              <span className="text-zinc-300"> v3 API key</span> or the
              <span className="text-zinc-300"> v4 Read Access Token</span>. The key is stored locally in this
              app&apos;s database only and is sent solely to api.themoviedb.org.
            </p>
            <a
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
            >
              Get a key on themoviedb.org <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} disabled={!key.trim() || busy !== null} className="min-h-[40px]">
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
            {status?.configured && status.source === 'db' ? (
              <Button variant="outline" onClick={() => void remove()} disabled={busy !== null} className="min-h-[40px]">
                {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Remove key
              </Button>
            ) : null}
          </div>

          <p className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[11px] leading-relaxed text-zinc-500">
            This product uses the TMDB API but is not endorsed or certified by TMDB. The Movie Database is a
            trademark of the TMDB separate entity.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
