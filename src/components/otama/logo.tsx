'use client'

import { cn } from '@/lib/utils'

/**
 * OTAMA wordmark — neon swirl ring around a play button, matching the
 * v1.4.0 app icon (magenta → violet → blue).
 */
export function OtamaLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 select-none', className)}>
      <svg viewBox="0 0 48 48" className="h-8 w-8 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="otama-sw" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="48%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id="otama-pl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5d0fe" />
            <stop offset="55%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="15" fill="#0a0b14" />
        <path
          d="M 24 5.5 A 18.5 18.5 0 1 0 41.4 27.5 C 40 33.5, 36 38.4, 30.6 40.6"
          fill="none"
          stroke="url(#otama-sw)"
          strokeWidth="5.6"
          strokeLinecap="round"
        />
        <path
          d="M 24 5.5 A 18.5 18.5 0 0 1 42.3 21.5"
          fill="none"
          stroke="url(#otama-sw)"
          strokeWidth="5.6"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M20.6 17.6 L31.8 24 L20.6 30.4 Z"
          fill="url(#otama-pl)"
          stroke="url(#otama-pl)"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">OTAMA</span>
    </div>
  )
}
