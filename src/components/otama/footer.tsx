'use client'

import { Github, Instagram, Twitter, Youtube } from 'lucide-react'
import { useAppStore } from '@/store/app-store'

const LINKS: { label: string; href?: string }[] = [
  { label: 'About OTAMA' },
  { label: 'Help Center' },
  { label: 'Terms of Use', href: 'https://github.com/shadow7019/OTAMA' },
  { label: 'Privacy' },
  { label: 'Cookie Preferences' },
  { label: 'Corporate Information' },
  { label: 'Contact Us' },
  { label: 'Legal Notices' },
]

/**
 * Netflix-style footer: muted gray link columns, social row and a
 * "Service Code" button, sitting directly on the #141414 page canvas.
 */
export function Footer() {
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)

  return (
    <footer className="mt-auto pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-3xl px-6 py-12 text-zinc-500">
        <p className="text-sm">
          Questions?{' '}
          <button onClick={() => setAboutOpen(true)} className="underline hover:text-zinc-300">
            Contact us
          </button>
        </p>

        <div className="mt-6 flex items-center gap-4" aria-label="OTAMA social">
          <a
            href="https://github.com/shadow7019/OTAMA"
            target="_blank"
            rel="noreferrer"
            aria-label="OTAMA on GitHub"
            className="text-zinc-400 transition-colors hover:text-white"
          >
            <Github className="h-5 w-5" />
          </a>
          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            aria-label="OTAMA on X"
            className="text-zinc-400 transition-colors hover:text-white"
          >
            <Twitter className="h-5 w-5" />
          </a>
          <a
            href="https://youtube.com"
            target="_blank"
            rel="noreferrer"
            aria-label="OTAMA on YouTube"
            className="text-zinc-400 transition-colors hover:text-white"
          >
            <Youtube className="h-5 w-5" />
          </a>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noreferrer"
            aria-label="OTAMA on Instagram"
            className="text-zinc-400 transition-colors hover:text-white"
          >
            <Instagram className="h-5 w-5" />
          </a>
        </div>

        <nav aria-label="Footer" className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] md:grid-cols-4">
          {LINKS.map((l) =>
            l.href ? (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="hover:underline">
                {l.label}
              </a>
            ) : (
              <button key={l.label} onClick={() => setAboutOpen(true)} className="text-left hover:underline">
                {l.label}
              </button>
            ),
          )}
        </nav>

        <button
          onClick={() => setAboutOpen(true)}
          className="mt-6 border border-zinc-600 px-2 py-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Service Code
        </button>

        <p className="mt-5 text-[11px] leading-relaxed">
          OTAMA is a torrent-streaming client for the modern web — inspired by the open-source
          popcorn-desktop architecture and rebuilt on Next.js. Only stream content you have the
          rights to. No copyrighted media is hosted, indexed or endorsed by this software.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  )
}
