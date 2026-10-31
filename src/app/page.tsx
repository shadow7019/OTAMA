"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { MediaItem } from "@/lib/tmdb";
import { Header } from "@/components/streaming/Header";
import { HeroCarousel } from "@/components/streaming/HeroCarousel";
import { HomeView } from "@/components/streaming/HomeView";
import { BrowseGrid } from "@/components/streaming/BrowseGrid";
import { StudiosView } from "@/components/streaming/StudiosView";
import { BrandView } from "@/components/streaming/BrandView";
import { DetailModal } from "@/components/streaming/DetailModal";
import { PlayerModal } from "@/components/streaming/PlayerModal";
import { ViewType, MediaActions, PlayerTarget } from "@/components/streaming/types";
import { Brand } from "@/lib/brands";

interface TrailerState {
  item: MediaItem;
  key: string;
}

export default function Home() {
  const [view, setView] = useState<ViewType>("home");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [player, setPlayer] = useState<PlayerTarget | null>(null);
  const [trailer, setTrailer] = useState<TrailerState | null>(null);

  const openDetail = useCallback((item: MediaItem) => setDetail(item), []);
  const openPlayer = useCallback(
    (item: MediaItem, s?: number, e?: number) => {
      setPlayer({ item, season: s, episode: e });
    },
    []
  );

  const actions: MediaActions = useMemo(
    () => ({ openDetail, openPlayer }),
    [openDetail, openPlayer]
  );

  const navigate = useCallback((v: ViewType) => {
    setView(v);
    if (v === "studios") setBrand(null); // Studios nav always returns to the hub
    if (v !== "search") setQuery("");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const openBrand = useCallback((b: Brand) => {
    setBrand(b);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const search = useCallback((q: string) => {
    setQuery(q);
    setView(q.trim() ? "search" : "home");
    if (q.trim()) window.scrollTo({ top: 0 });
  }, []);

  // ESC closes topmost layer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (trailer) setTrailer(null);
      else if (detail) setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trailer, detail]);

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b10] text-zinc-100">
      <Header active={view} query={query} onNavigate={navigate} onSearch={search} />

      <main className="min-h-[60vh] flex-1">
        {view === "home" && <HomeView actions={actions} onTrailer={(item, key) => setTrailer({ item, key })} />}
        {view === "movies" && <BrowseGrid kind="movie" title="Movies" actions={actions} />}
        {view === "tv" && <BrowseGrid kind="tv" title="TV Shows" actions={actions} />}
        {view === "studios" &&
          (brand ? (
            <BrandView
              key={`${brand.param}-${brand.id}`}
              brand={brand}
              actions={actions}
              onBack={() => setBrand(null)}
            />
          ) : (
            <StudiosView onSelect={openBrand} />
          ))}
        {view === "search" && (
          <BrowseGrid kind="search" query={query} title={query ? `Results for "${query}"` : "Search"} actions={actions} />
        )}
        {view === "mylist" && <BrowseGrid kind="mylist" title="My List" actions={actions} />}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 bg-black/40 px-4 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <p className="text-lg font-black tracking-tight text-white">
                Cine<span className="text-red-500">X</span>
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">
                Your gateway to movies and TV shows. Browse trending titles, watch official
                trailers and stream through your own built-in P2P player — all in one place.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400" aria-label="Footer">
              {(
                [
                  ["home", "Home"],
                  ["movies", "Movies"],
                  ["tv", "TV Shows"],
                  ["studios", "Studios"],
                  ["mylist", "My List"],
                ] as [ViewType, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(id)}
                  className="transition hover:text-red-400"
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="mt-8 space-y-2 border-t border-white/5 pt-6 text-[11px] leading-relaxed text-zinc-600">
            <p>
              This product uses the TMDB API but is not endorsed or certified by TMDB. Data and
              images courtesy of The Movie Database (www.themoviedb.org).
            </p>
            <p>
              Otama does not host any media files. Playback streams directly from public
              peer-to-peer networks through the built-in ad-free player; availability depends on
              the public swarm.
            </p>
          </div>
        </div>
      </footer>

      {/* Modals — keyed so each target gets fresh state on open */}
      <DetailModal
        key={`detail-${detail?.id ?? "none"}`}
        item={detail}
        actions={actions}
        onClose={() => setDetail(null)}
      />
      <PlayerModal
        key={`player-${player?.item.id ?? "none"}-${player?.season ?? ""}-${player?.episode ?? ""}`}
        target={player}
        actions={actions}
        onClose={() => setPlayer(null)}
      />

      {/* Trailer overlay */}
      {trailer && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setTrailer(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Trailer player"
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-[#12121a] px-4 py-2.5">
              <p className="truncate text-sm font-bold text-white">{trailer.item.title || trailer.item.name} — Trailer</p>
              <button
                type="button"
                onClick={() => setTrailer(null)}
                aria-label="Close trailer"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
