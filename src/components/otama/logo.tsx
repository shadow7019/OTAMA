'use client'

import { cn } from '@/lib/utils'

/** Original OTAMA wordmark — a catfish-swoosh around a play button. */
export function OtamaLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="otama-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        {/* catfish body swoosh */}
        <path
          d="M6 27 C10 15, 26 10, 36 17 C40 20, 42 24, 41 28 C39 34, 30 37, 22 35 C16 33.5, 10 32, 6 27 Z M41 24 L47 18 L46 28 Z"
          fill="url(#otama-g)"
        />
        {/* play cutout */}
        <circle cx="23" cy="24" r="9" fill="oklch(0.13 0.004 80)" />
        <path d="M20.5 19.5 L29 24 L20.5 28.5 Z" fill="url(#otama-g)" />
        {/* whiskers */}
        <path d="M8 26 C5 24, 3 24, 1.5 25" stroke="url(#otama-g)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M8 28 C5.5 29.5, 4 30.5, 3 32" stroke="url(#otama-g)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* eye */}
        <circle cx="33.5" cy="21.5" r="1.3" fill="oklch(0.13 0.004 80)" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">
        OTAMA
      </span>
    </div>
  )
}
