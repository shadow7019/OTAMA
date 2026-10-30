"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Menu, Clapperboard } from "lucide-react";
import { ViewType } from "./types";

interface HeaderProps {
  active: ViewType;
  query: string;
  onNavigate: (v: ViewType) => void;
  onSearch: (q: string) => void;
}

const NAV: { id: ViewType; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "movies", label: "Movies" },
  { id: "tv", label: "TV Shows" },
  { id: "mylist", label: "My List" },
];

export function Header({ active, query, onNavigate, onSearch }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [inputValue, setInputValue] = useState(query);
  const [searchOpenMobile, setSearchOpenMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const handleChange = (v: string) => {
    setInputValue(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      onSearch(v);
    }, 400);
  };

  const nav = (v: ViewType) => {
    onNavigate(v);
    setMenuOpen(false);
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[60] transition-all duration-300 ${
        scrolled
          ? "bg-[#0b0b10]/95 shadow-lg shadow-black/40 backdrop-blur-md"
          : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"
      }`}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:h-16 md:px-8">
        {/* Logo */}
        <button
          type="button"
          onClick={() => nav("home")}
          className="flex shrink-0 items-center gap-2 focus-visible:outline-none"
          aria-label="CineX home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-red-800 shadow-lg shadow-red-600/30">
            <Clapperboard className="h-4.5 w-4.5 text-white" />
          </span>
          <span className="text-xl font-black tracking-tight text-white">
            Cine<span className="text-red-500">X</span>
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => nav(n.id)}
              className={`rounded-md px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                active === n.id
                  ? "text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
              aria-current={active === n.id ? "page" : undefined}
            >
              {n.label}
              {active === n.id && (
                <span className="mx-auto mt-0.5 block h-0.5 w-5 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </nav>

        {/* Search + mobile buttons */}
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              type="search"
              value={inputValue}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim()) {
                  if (debounce.current) clearTimeout(debounce.current);
                  onSearch(inputValue.trim());
                }
              }}
              placeholder="Search movies & shows…"
              aria-label="Search movies and TV shows"
              className="w-44 rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-zinc-100 placeholder:text-zinc-500 transition-all focus:w-64 focus:border-red-600/60 focus:bg-black/60 focus:outline-none lg:w-56 lg:focus:w-80"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue("");
                  onSearch("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Mobile search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpenMobile((v) => !v)}
            aria-label="Toggle search"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-300 sm:hidden"
          >
            <Search className="h-4.5 w-4.5" />
          </button>

          {/* Mobile menu */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-300 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile search row */}
      {searchOpenMobile && (
        <div className="border-t border-white/5 px-4 py-2.5 sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              autoFocus
              value={inputValue}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Search movies & shows…"
              aria-label="Search movies and TV shows"
              className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-600/60 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <nav
          className="border-t border-white/5 bg-[#0b0b10]/98 px-4 py-2 backdrop-blur-md md:hidden"
          aria-label="Mobile navigation"
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => nav(n.id)}
              className={`block w-full rounded-md px-3 py-3 text-left text-sm font-semibold transition ${
                active === n.id ? "bg-red-600/15 text-red-400" : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
