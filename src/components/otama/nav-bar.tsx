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
]

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
  const debounced = useDebounce(input, 450)

  useEffect(() => {
    setQuery(debounced)
  }, [debounced, setQuery])

  const activeTorrents = torrents.length

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <button onClick={() => setView('home')} aria-label="OTAMA home" className="shrink-0">
          <OtamaLogo />
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Primary">
          {NAV.map((n) => (
            <Button
              key={n.id}
              variant="ghost"
              size="sm"
              onClick={() => setView(n.id)}
              className={cn('text-sm font-medium', view === n.id ? 'text-amber-400' : 'text-zinc-300 hover:text-white')}
              aria-current={view === n.id ? 'page' : undefined}
            >
              {n.label}
            </Button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <form className="relative hidden sm:block w-44 lg:w-64" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search movies, TV, anime…"
              className="pl-9 h-10 bg-white/5 border-white/10"
              aria-label="Search"
            />
          </form>

          <span
            className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400"
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
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
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
        <nav className="border-t border-white/5 px-4 py-3 md:hidden space-y-1" aria-label="Mobile">
          {NAV.map((n) => (
            <Button
              key={n.id}
              variant="ghost"
              onClick={() => {
                setView(n.id)
                setMenuOpen(false)
              }}
              className={cn('w-full justify-start', view === n.id ? 'text-amber-400' : 'text-zinc-300')}
            >
              {n.label}
            </Button>
          ))}
          <form className="relative pt-1 sm:hidden" role="search" onSubmit={(e) => { e.preventDefault(); setMenuOpen(false) }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search…"
              className="pl-9 bg-white/5 border-white/10"
              aria-label="Search"
            />
          </form>
        </nav>
      ) : null}
    </header>
  )
}
