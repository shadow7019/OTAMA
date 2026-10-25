'use client'

import { useEffect, useState } from 'react'
import { Search, Download, Info, Menu, X, Wifi, WifiOff, Settings2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { OtamaLogo } from '@/components/otama/logo'
import { TmdbDialog } from '@/components/otama/tmdb-dialog'
import { useAppStore, type View } from '@/store/app-store'
import { useEngineState } from '@/hooks/use-engine-state'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV' },
  { id: 'anime', label: 'Anime' },
  { id: 'tpb', label: 'Pirate Bay' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'history', label: 'History' },
]

/**
 * Netflix-style top bar: transparent gradient floating over the hero, turns
 * solid #141414 once the page scrolls. Search collapses to a magnifier icon
 * and expands into an input (Netflix behavior).
 */
export function NavBar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const setQuery = useAppStore((s) => s.setQuery)
  const setDownloadsOpen = useAppStore((s) => s.setDownloadsOpen)
  const setAboutOpen = useAppStore((s) => s.setAboutOpen)
  const { torrents, connected } = useEngineState()
  const [input, setInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [tmdbOpen, setTmdbOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const debounced = useDebounce(input, 450)

  useEffect(() => {
    setQuery(debounced)
  }, [debounced, setQuery])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const activeTorrents = torrents.length

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-transparent pt-[env(safe-area-inset-top)] transition-colors duration-300',
        scrolled || menuOpen
          ? 'border-white/5 bg-[#141414]/95 shadow-lg shadow-black/40 backdrop-blur-md'
          : 'bg-gradient-to-b from-black/85 via-black/45 to-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 md:gap-6 md:px-12">
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <button onClick={() => setView('home')} aria-label="OTAMA home" className="shrink-0">
          <OtamaLogo />
        </button>

        <nav className="hidden items-center gap-4 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cn(
                'text-sm transition-colors',
                view === n.id ? 'font-semibold text-white' : 'text-zinc-300 hover:text-white/80',
              )}
              aria-current={view === n.id ? 'page' : undefined}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          {/* Netflix-style expanding search (desktop) */}
          <div className="hidden items-center sm:flex">
            {searchOpen ? (
              <form className="relative" role="search" onSubmit={(e) => e.preventDefault()}>
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                <Input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onBlur={() => {
                    if (!input) setSearchOpen(false)
                  }}
                  placeholder="Titles, genres…"
                  className="h-9 w-56 border-white/40 bg-black/70 pl-8 text-sm"
                  aria-label="Search"
                />
              </form>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                aria-label="Open search"
              >
                <Search className="h-5 w-5" />
              </Button>
            )}
          </div>

          <span
            className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400 lg:inline-flex"
            title={connected ? 'Torrent engine online' : 'Torrent engine offline'}
          >
            {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-red-400" />}
            engine
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setDownloadsOpen(true)}
            aria-label={`Downloads (${activeTorrents} active)`}
          >
            <Download className="h-5 w-5" />
            {activeTorrents > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e50914] px-1 text-[10px] font-bold text-white">
                {activeTorrents}
              </span>
            ) : null}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTmdbOpen(true)} aria-label="TMDB settings">
            <Settings2 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAboutOpen(true)} aria-label="About OTAMA">
            <Info className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <TmdbDialog open={tmdbOpen} onOpenChange={setTmdbOpen} />

      {menuOpen ? (
        <nav className="border-t border-white/5 bg-[#141414]/95 px-4 py-3 md:hidden space-y-1 backdrop-blur-md" aria-label="Mobile">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setView(n.id)
                setMenuOpen(false)
              }}
              className={cn(
                'block w-full rounded px-2 py-2 text-left text-sm min-h-[44px]',
                view === n.id ? 'font-semibold text-white' : 'text-zinc-300',
              )}
            >
              {n.label}
            </button>
          ))}
          <form className="relative pt-1" role="search" onSubmit={(e) => { e.preventDefault(); setMenuOpen(false) }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search…"
              className="pl-9 bg-black/60 border-white/25"
              aria-label="Search"
            />
          </form>
        </nav>
      ) : null}
    </header>
  )
}
