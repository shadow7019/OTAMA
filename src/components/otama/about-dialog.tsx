'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OtamaLogo } from '@/components/otama/logo'
import { useAppStore } from '@/store/app-store'
import { useEngineState } from '@/hooks/use-engine-state'

const FIXES: { title: string; detail: string }[] = [
  { title: 'Dead providers replaced', detail: 'RARBG shut down in 2023 and YTS/EZTV are geo/CF-blocked in many regions. OTAMA rebuilds the provider layer on Cinemeta (metadata), TVMaze (episodes), ThePirateBay via its official API, Nyaa (anime) and EZTV with automatic fallback to ThePirateBay.' },
  { title: 'Cloudflare 403 / TLS fingerprinting fixed', detail: 'Node fetch/https get challenged by Cloudflare even with browser UAs. OTAMA routes tracker APIs through a curl transport with fetch fallback — no more silent empty results.' },
  { title: 'Memory-leak / zombie-torrent fix', detail: 'The desktop app left torrents running forever. The engine now reaps idle torrents after 30 min, caps at 6 concurrent engines (LRU), and destroys streams when the browser tab disconnects.' },
  { title: 'Metadata mismatch fix', detail: 'Torrent-to-title matching is keyed by IMDB id (apibay supports imdb lookups) with title+year fallback — no more wrong-poster/wrong-movie results.' },
  { title: 'Sane file selection', detail: 'Instead of grabbing every file in a pack, the engine downloads the selected video plus small subtitle files only, and prioritises the exact byte ranges you seek to.' },
  { title: 'Instant seek, proper range streaming', detail: 'HTTP 206 range responses verified end-to-end so scrubbing works like a normal video site instead of re-downloading from the start.' },
  { title: 'Resume playback', detail: 'Positions are saved to SQLite every 10s; the player resumes where you left off (the desktop app lost your position on every restart).' },
  { title: 'Search everywhere at once', detail: 'One query fans out to movies, series, anime and Pirate Bay in parallel — the original app searched providers one at a time.' },
]

export function AboutDialog() {
  const open = useAppStore((s) => s.aboutOpen)
  const setOpen = useAppStore((s) => s.setAboutOpen)
  const { connected } = useEngineState()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto otama-scroll">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <OtamaLogo />
          </div>
          <DialogDescription className="text-left pt-1">
            OTAMA is a web-UI rearchitecting of the popcorn-desktop concept: a torrent-streaming
            client built on Next.js + WebTorrent-style swarm streaming. The desktop app&apos;s
            peerflix/torrent-stream engine was rebuilt as a standalone service; the Angular UI was
            rebuilt as a modern responsive SPA.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-white/10 bg-amber-500/5 p-3 text-xs leading-relaxed text-zinc-300">
          <strong className="text-amber-300">Use responsibly.</strong> OTAMA is a torrent client —
          only stream content you have the rights to (public-domain, Creative-Commons, your own
          uploads). You are responsible for complying with the law in your country.
        </div>

        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Fixes vs the upstream repo</h3>
        <ul className="space-y-2.5">
          {FIXES.map((f) => (
            <li key={f.title} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{f.detail}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="rounded-full border border-white/10 px-2 py-0.5">Next.js 16</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">torrent-stream (peerflix lineage)</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">socket.io live stats</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">Prisma / SQLite</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">Cinemeta · TVMaze · TPB · Nyaa</span>
          <span className={`rounded-full border px-2 py-0.5 ${connected ? 'border-emerald-500/40 text-emerald-400' : 'border-red-500/40 text-red-400'}`}>
            engine {connected ? 'online' : 'offline'}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
