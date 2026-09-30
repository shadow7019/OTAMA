'use client'

import { cn } from '@/lib/utils'

/**
 * OTAMA wordmark — the official app artwork (neon swirl + torii + Mt. Fuji
 * night scene) served from /public/logo-mark.png (full art with wordmark: /public/logo.png), matching the v1.5.2 icons on
 * Android/iOS/desktop. Kept as <img> so brand updates ship as one file.
 */
export function OtamaLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <img
        src="/logo-mark.png"
        alt="OTAMA logo"
        className="h-9 w-9 shrink-0 rounded-[10px] object-cover"
        width={36}
        height={36}
      />
      <span className="text-xl font-extrabold tracking-tight">OTAMA</span>
    </div>
  )
}
