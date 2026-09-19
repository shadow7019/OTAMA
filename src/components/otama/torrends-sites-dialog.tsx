'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Globe, Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface TorrendsEntry {
  name: string
  title: string
  url: string
  searchTemplate: string | null
  proxies: string[]
}

/**
 * "More sites" dialog — the Torrends.to directory: 40+ curated torrent sites,
 * each with a one-click search link (query prefilled) and live proxies.
 */
export function TorrendsSitesDialog({
  open,
  onOpenChange,
  query = '',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  query?: string
}) {
  const [q, setQ] = useState(query)

  // keep the query box in sync with the parent search while the dialog opens
  // (React-recommended render-time adjustment; avoids setState-in-effect)
  const [syncedQuery, setSyncedQuery] = useState<string | null>(null)
  if (open && query !== syncedQuery) {
    setSyncedQuery(query)
    setQ(query)
  }

  // seed the query each time the dialog opens (no effect needed)
  const handleOpenChange = (v: boolean) => {
    if (v) setQ(query)
    onOpenChange(v)
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['torrends-directory'],
    queryFn: async () => {
      const res = await fetch('/api/torrends', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      return json as { sites: TorrendsEntry[] }
    },
    enabled: open,
    staleTime: 30 * 60_000,
  })

  const openSite = (site: TorrendsEntry) => {
    const term = q.trim()
    let url = site.url
    if (site.searchTemplate) {
      url = site.searchTemplate.replace('@@s@@', encodeURIComponent(term))
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const sites = data?.sites || []
  const host = useMemo(
    () => (u: string) => {
      try { return new URL(u).host.replace(/^www\./, '') } catch { return u }
    },
    [],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            More torrent sites <span className="text-sm font-normal text-zinc-400">via Torrends.to</span>
          </DialogTitle>
          <DialogDescription>
            {sites.length} curated sites with live proxies. Searching opens the site in a new tab with your query prefilled.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all sites for…"
            className="pl-9"
            aria-label="Query used when opening sites"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading directory" />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-300">
            Torrends directory unavailable: {(error as Error).message}
          </p>
        ) : (
          <ScrollArea className="otama-scroll -mr-2 min-h-0 flex-1 pr-2">
            <ul className="space-y-1.5">
              {sites.map((s) => (
                <li key={s.name}>
                  <button
                    onClick={() => openSite(s)}
                    className="group flex w-full items-center gap-3 rounded-lg border border-white/5 bg-card px-3 py-2.5 text-left transition-colors hover:border-amber-400/40 hover:bg-white/[0.03]"
                    aria-label={`Search ${s.title} for ${q || 'everything'}`}
                  >
                    <Globe className="h-4 w-4 shrink-0 text-zinc-500 group-hover:text-amber-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-zinc-500">{host(s.url)}</span>
                    </span>
                    {s.proxies.length > 1 ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {s.proxies.length} mirrors
                      </Badge>
                    ) : null}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-amber-400" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500">
          <span>Directory by torrends.to — sites open externally</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => window.open(`https://torrends.to/${q.trim() ? `torrent-search/?query=${encodeURIComponent(q.trim())}` : ''}`, '_blank', 'noopener,noreferrer')}
          >
            Open Torrends
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
