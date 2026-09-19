'use client'

import { OtamaLogo } from '@/components/otama/logo'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black/30">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <OtamaLogo className="scale-90 origin-left" />
            <p className="max-w-xl text-xs leading-relaxed text-zinc-500">
              OTAMA is a torrent-streaming client for the modern web — inspired by the open-source
              popcorn-desktop architecture and rebuilt on Next.js. Only stream content you have the
              rights to. No copyrighted media is hosted, indexed or endorsed by this software.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>Next.js 16 + TypeScript</span>
            <span aria-hidden>·</span>
            <span>torrent-stream engine</span>
            <span aria-hidden>·</span>
            <span>Cinemeta / TVMaze / TPB / Nyaa / TMDB</span>
            <span aria-hidden>·</span>
            <span>socket.io live stats</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-600">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  )
}
