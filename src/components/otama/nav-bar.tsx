'use client'

import { useEffect, useState } from 'react'
import { Search, Download, Menu, X, Wifi, WifiOff, Settings2, Info, ChevronDown, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OtamaLogo } from '@/components/otama/logo'
import { TmdbDialog } from '@/components/otama/tmdb-dialog'
import { AboutDialog } from '@/components/otama/about-dialog'
import { useAppStore, type View } from '@/store/app-store'
import { useEngineState } from '@/hooks/use-engine-state'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'anime', label: 'Anime' },
  { id: 'tpb', label: 'Pirate Bay' },
  { id: 'favorites', label: 'My List' },
  { id: 'history', label: 'History' },
]

/**
 * Netflix 2025-style top bar: OTAMA wordmark, pill-shaped active nav item
 * (dark rounded-full like the reference), expanding search, bell with red
 * badge, and a profile avatar with caret that opens the account-style menu.
 */
export function NavBar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const setQuery = useAppStore((s) => s.setQuery)
  const setDownloadsOpen = useAppStore((s) => s.setDownloadsOpen)
  const { torrents, connected } = useEngineState()
  const [input, setInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [tmdbOpen, setTmdbOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const debounced = useDebounce(input, 450)

  useEffect(() => {
    setQuery(debounced)
  }, [debounced, setQuery])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
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
          ? 'border-white/5 bg-[#0b0b0b]/95 shadow-lg shadow-black/40 backdrop-blur-md'
          : 'bg-gradient-to-b from-black/90 via-black/55 to-black/20',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-3 md:gap-5 md:px-6">
        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <button onClick={() => setView('home')} aria-label="OTAMA home" className="mr-1 shrink-0 md:mr-2">
          <OtamaLogo />
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={cn(
                'rounded-full px-3.5 py-2 text-sm transition-colors lg:px-4',
                view === n.id
                  ? 'bg-white/15 font-semibold text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white',
              )}
              aria-current={view === n.id ? 'page' : undefined}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:gap-1.5">
          {/* Netflix-style expanding search */}
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
            className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400 xl:inline-flex"
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

          {/* profile avatar + caret → account-style menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md p-1 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                aria-label="Account menu"
              >
                <img
                  src="/logo-mark.png"
                  alt=""
                  className="h-8 w-8 rounded-md object-cover"
                  width={32}
                  height={32}
                />
                <ChevronDown className="hidden h-4 w-4 text-zinc-300 sm:block" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 border-white/10 bg-[#141414]/98 text-zinc-200 backdrop-blur">
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-zinc-400">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    connected ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  Engine {connected ? 'online' : 'offline'}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => setDownloadsOpen(true)} className="gap-2 focus:bg-white/10 focus:text-white">
                <Download className="h-4 w-4" aria-hidden /> Downloads
                {activeTorrents > 0 ? (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e50914] px-1 text-[10px] font-bold text-white">
                    {activeTorrents}
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTmdbOpen(true)} className="gap-2 focus:bg-white/10 focus:text-white">
                <Settings2 className="h-4 w-4" aria-hidden /> Metadata settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAboutOpen(true)} className="gap-2 focus:bg-white/10 focus:text-white">
                <Info className="h-4 w-4" aria-hidden /> About OTAMA
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem asChild className="gap-2 focus:bg-white/10 focus:text-white">
                <a
                  href="https://github.com/shadow7019/OTAMA/releases"
                  target="_blank"
                  rel="noreferrer"
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden /> Get the desktop app
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TmdbDialog open={tmdbOpen} onOpenChange={setTmdbOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {menuOpen ? (
        <nav className="border-t border-white/5 bg-[#0b0b0b]/95 px-4 py-3 md:hidden space-y-1 backdrop-blur-md" aria-label="Mobile">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                setView(n.id)
                setMenuOpen(false)
              }}
              className={cn(
                'block w-full rounded-full px-3 py-2.5 text-left text-sm min-h-[44px]',
                view === n.id ? 'bg-white/15 font-semibold text-white' : 'text-zinc-300',
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

