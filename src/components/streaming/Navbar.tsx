"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Menu,
  X,
  Dices,
  Film,
  Tv,
  House,
  Bookmark,
  Globe,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";
import { useStore, type View } from "@/lib/store";
import { LANGUAGES, TMDB_MOVIE_GENRES, TMDB_TV_GENRES, type MediaType } from "@/lib/tmdb-constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { label: string; view: View; icon: React.ElementType }[] = [
  { label: "Home", view: { name: "home" }, icon: House },
  { label: "Movies", view: { name: "browse", kind: "movie" }, icon: Film },
  { label: "TV Shows", view: { name: "browse", kind: "tv" }, icon: Tv },
];

export function Navbar() {
  const view = useStore((s) => s.view);
  const navigate = useStore((s) => s.navigate);
  const random = useStore((s) => s.random);
  const auth = useStore((s) => s.auth);
  const signOut = useStore((s) => s.signOut);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const mobileOpen = useStore((s) => s.mobileMenuOpen);
  const setMobileOpen = useStore((s) => s.setMobileMenuOpen);
  const setLegal = useStore((s) => s.setLegalModal);

  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [genreOpen, setGenreOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const submitSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed) {
      navigate({ name: "search", query: trimmed });
      setSearchOpen(false);
      setQuery("");
    }
  };

  const isActive = (v: View) => {
    if (v.name === "home") return view.name === "home";
    if (v.name === "browse" && view.name === "browse") return v.kind === view.kind;
    if (v.name === "mylist") return view.name === "mylist";
    return false;
  };

  const genreNavigate = (kind: MediaType, id: number) => {
    navigate({ name: "browse", kind, genre: id });
    setGenreOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/95 shadow-lg shadow-black/40 backdrop-blur-md"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      )}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 md:h-[68px] md:gap-4 md:px-8"
      >
        {/* Logo */}
        <button
          onClick={() => navigate({ name: "home" })}
          className="flex items-center gap-2 focus-visible:outline-none"
          aria-label="Cineora home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-black text-white shadow-md shadow-primary/40">
            C
          </span>
          <span className="hidden text-lg font-black tracking-[0.18em] text-foreground sm:block">
            CINEORA
          </span>
        </button>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.view)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none",
                isActive(item.view) ? "text-primary" : "text-foreground/70"
              )}
            >
              {item.label}
            </button>
          ))}

          {/* Genres dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setGenreOpen((o) => !o);
                setLangOpen(false);
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none",
                view.name === "browse" && view.genre ? "text-primary" : "text-foreground/70"
              )}
              aria-expanded={genreOpen}
              aria-haspopup="menu"
            >
              Genres <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", genreOpen && "rotate-180")} />
            </button>
            {genreOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full mt-2 w-[560px] rounded-xl border border-white/10 bg-popover/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Movies
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {TMDB_MOVIE_GENRES.map((g) => (
                        <button
                          key={g.id}
                          role="menuitem"
                          onClick={() => genreNavigate("movie", g.id)}
                          className="rounded-lg px-2.5 py-1.5 text-left text-xs text-popover-foreground/80 transition-colors hover:bg-white/10 hover:text-popover-foreground"
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      TV Shows
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {TMDB_TV_GENRES.map((g) => (
                        <button
                          key={g.id}
                          role="menuitem"
                          onClick={() => genreNavigate("tv", g.id)}
                          className="rounded-lg px-2.5 py-1.5 text-left text-xs text-popover-foreground/80 transition-colors hover:bg-white/10 hover:text-popover-foreground"
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Languages dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setLangOpen((o) => !o);
                setGenreOpen(false);
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none",
                view.name === "browse" && view.language ? "text-primary" : "text-foreground/70"
              )}
              aria-expanded={langOpen}
              aria-haspopup="menu"
            >
              <Globe className="h-3.5 w-3.5" /> Languages
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", langOpen && "rotate-180")} />
            </button>
            {langOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-popover/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
              >
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    role="menuitem"
                    onClick={() => {
                      navigate({ name: "browse", kind: "movie", language: l.code });
                      setLangOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground/80 transition-colors hover:bg-white/10 hover:text-popover-foreground"
                  >
                    <Globe className="h-3.5 w-3.5 opacity-60" /> {l.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1" />

        {/* Random dice */}
        <button
          onClick={() => void random()}
          title="Random title"
          aria-label="Play a random title"
          className="hidden h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-medium text-foreground/80 transition-all hover:border-primary/60 hover:text-primary sm:flex"
        >
          <Dices className="h-4 w-4" />
          <span className="hidden xl:inline">Random</span>
        </button>

        {/* Search */}
        <div className="relative">
          <div
            className={cn(
              "flex h-9 items-center overflow-hidden rounded-full border transition-all duration-300",
              searchOpen
                ? "w-44 border-white/20 bg-black/60 px-3 sm:w-64"
                : "w-9 justify-center border-transparent bg-white/5"
            )}
          >
            <button
              onClick={() => (searchOpen ? submitSearch(query) : setSearchOpen(true))}
              aria-label={searchOpen ? "Submit search" : "Open search"}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-foreground/80 hover:text-foreground"
            >
              <Search className="h-4 w-4" />
            </button>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch(query);
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Movies, shows, people…"
              aria-label="Search titles"
              className={cn(
                "w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground",
                searchOpen ? "block" : "hidden"
              )}
            />
            {searchOpen ? (
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
                className="flex h-9 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* My List (desktop quick link) */}
        <button
          onClick={() => navigate({ name: "mylist" })}
          aria-label="My List"
          className={cn(
            "hidden h-9 w-9 items-center justify-center rounded-full bg-white/5 transition-colors hover:text-primary md:flex",
            isActive({ name: "mylist" }) ? "text-primary" : "text-foreground/80"
          )}
        >
          <Bookmark className="h-4 w-4" />
        </button>

        {/* Auth */}
        {auth ? (
          <div className="relative">
            <button
              onClick={() => setUserOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-rose-700 text-sm font-bold text-white shadow-md shadow-primary/30"
              aria-label={`Account menu for ${auth.name}`}
              aria-expanded={userOpen}
              aria-haspopup="menu"
            >
              {auth.name.charAt(0).toUpperCase()}
            </button>
            {userOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-popover/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
              >
                <div className="border-b border-white/10 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-popover-foreground">
                    <User className="h-3.5 w-3.5" /> {auth.name}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Signed in</p>
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    navigate({ name: "mylist" });
                    setUserOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground/80 hover:bg-white/10 hover:text-popover-foreground"
                >
                  <Bookmark className="h-3.5 w-3.5" /> My List
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    void signOut();
                    setUserOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-md shadow-primary/30 transition hover:bg-primary/90"
          >
            Sign In
          </button>
        )}

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-foreground lg:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen ? (
        <div className="border-t border-white/10 bg-background/98 px-4 pb-6 pt-2 shadow-2xl backdrop-blur-xl lg:hidden">
          <div className="grid gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.view)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium",
                  isActive(item.view)
                    ? "bg-white/10 text-primary"
                    : "text-foreground/80 hover:bg-white/5"
                )}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </button>
            ))}
            <button
              onClick={() => void random()}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground/80 hover:bg-white/5"
            >
              <Dices className="h-4 w-4" /> Random Title
            </button>
          </div>
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Movie Genres
            </p>
            <div className="flex flex-wrap gap-1.5 px-3">
              {TMDB_MOVIE_GENRES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => genreNavigate("movie", g.id)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-foreground/80 hover:border-primary/50 hover:text-primary"
                >
                  {g.name}
                </button>
              ))}
            </div>
            <p className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Languages
            </p>
            <div className="flex flex-wrap gap-1.5 px-3">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    navigate({ name: "browse", kind: "movie", language: l.code });
                    setMobileOpen(false);
                  }}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-foreground/80 hover:border-primary/50 hover:text-primary"
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex gap-2 border-t border-white/10 px-3 pt-4 text-xs text-muted-foreground">
            <button onClick={() => setLegal("dmca")} className="hover:text-foreground">
              DMCA
            </button>
            <button onClick={() => setLegal("privacy")} className="hover:text-foreground">
              Privacy
            </button>
            <button onClick={() => setLegal("terms")} className="hover:text-foreground">
              Terms
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
