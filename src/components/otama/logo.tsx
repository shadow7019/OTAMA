'use client'

import { cn } from '@/lib/utils'

/**
 * OTAMA wordmark — v2 brand: the "Ribbon O" mark (black rounded tile, red
 * folded-ring O with a play-triangle core — echoes the intro ident ribbons),
 * served from /public/logo-mark.png (full lockup with the condensed OTAMA
 * wordmark: /public/logo.png). Kept as <img> so brand updates ship as one file.
 */
export function OtamaLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <img
        src="/logo-mark.png"
        alt="OTAMA logo"
        className="h-9 w-9 shrink-0 object-cover"
        width={36}
        height={36}
      />
      <span className="text-xl font-extrabold uppercase tracking-tight text-[#e50914] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">OTAMA</span>
    </div>
  )
}
