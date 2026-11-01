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
import { AnimeView } from "@/components/streaming/AnimeView";
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
        {view === "anime" && <AnimeView actions={actions} />}
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
                <span className="text-red-500">O</span>tama
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500">
                Your gateway to movies, TV shows and anime. Browse trending titles, watch official
                trailers and stream through your own built-in P2P player — all in one place.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400" aria-label="Footer">
              {(
                [
                  ["home", "Home"],
                  ["movies", "Movies"],
                  ["tv", "TV Shows"],
                  ["anime", "Anime"],
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

          {/* About Us */}
          <section className="mt-10 border-t border-white/5 pt-8" aria-labelledby="about-us-heading">
            <h2
              id="about-us-heading"
              className="text-sm font-bold uppercase tracking-wider text-zinc-300"
            >
              About Us
            </h2>
            <div className="mt-3 max-w-3xl space-y-3 text-xs leading-relaxed text-zinc-500">
              <p>
                Otama is a free, browser-based discovery and playback app for movies, TV shows and
                anime. The catalog, posters, ratings and episode guides are powered by The Movie
                Database (TMDB), and every title page gathers every way to watch it in one place —
                trailers, a built-in player, direct streams and third-party web servers — so you
                never have to dig through a dozen tabs again.
              </p>
              <p>
                Playback is organised into two clearly separated groups. The{" "}
                <span className="font-semibold text-emerald-400">Ad-free</span> group runs through
                our own player: sources are found on public peer-to-peer networks and streamed by
                the built-in player, and <span className="font-semibold text-emerald-400">
                Otama Direct</span> serves public-domain and freely licensed copies straight from
                archive.org. The <span className="font-semibold text-amber-400">Ads</span> group
                lists third-party web servers as an opt-in fallback — those pages carry the
                providers&apos; own advertising. The player always tries the best ad-free source
                first and only falls back to a web server if none of them can play, so there is
                always something on screen.
              </p>
              <p>
                There is nothing to install and nothing to pay. Pick up where you left off with
                Continue Watching, build a watchlist in My List, filter servers by audio language
                and switch subtitles — your list and progress are stored in your own browser, not
                on our servers.
              </p>
            </div>
          </section>

          {/* Legal Disclaimer — layout follows the user-supplied reference screenshot */}
          <section
            className="mt-10 border-t border-white/5 pt-8"
            aria-labelledby="legal-disclaimer-heading"
          >
            <h2
              id="legal-disclaimer-heading"
              className="text-lg font-bold tracking-tight text-white"
            >
              Legal Disclaimer
            </h2>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Effective date: November 1, 2026
            </p>
            <div className="mt-4 border-t border-white/5" />
            <div className="mt-5 max-w-3xl space-y-4 text-xs leading-relaxed text-zinc-500">
              <p>
                The following Legal Disclaimer governs your use of the Otama website and its
                associated services. By accessing our website, you acknowledge that you have read,
                understood, and agree to be bound by this disclaimer.
              </p>

              <p className="font-semibold text-zinc-300">
                1. Content Hosting &amp; Third-Party Indexing
              </p>
              <p>
                <span className="font-semibold text-zinc-300">
                  Otama does NOT host, upload, store, or transmit any video, audio, media, or other
                  copyrighted materials as part of a hosted library on our servers.
                </span>{" "}
                We operate strictly as an indexing service and player interface, aggregating
                publicly available metadata and publicly listed links to content hosted on
                third-party, non-affiliated platforms, peer-to-peer networks and cyberlockers. All
                media displayed, streamed, or embedded on this website is provided by external
                domains. Torrent data flows through the service only for the duration of an active
                playback session and is never stored, catalogued or redistributed as a hosted
                copy. We do not exercise any editorial or technical control over the content
                hosted on these external servers, and we do not monitor them for copyright
                infringement.
              </p>

              <p className="font-semibold text-zinc-300">
                2. DMCA &amp; Copyright Infringement (Safe Harbor)
              </p>
              <p>
                We strongly respect the intellectual property rights of others. However, because
                Otama does not host any media files,{" "}
                <span className="font-semibold text-zinc-300">
                  we cannot remove any content from the internet
                </span>
                . If you believe your copyrighted material is being distributed, you must issue a
                Digital Millennium Copyright Act (DMCA) takedown notice directly to the third-party
                video host or network (the server actually storing or serving the file). Removing a
                link or source from our website will not remove the infringing file from the
                underlying server. If you are a copyright owner and wish to have links to your
                content excluded from our results, please submit a notice with official
                verification of your copyright claim, and we will blacklist the source from our
                search results.
              </p>

              <p className="font-semibold text-zinc-300">
                3. Advertisements &amp; Intrusive Media
              </p>
              <p>
                Because we embed media players provided by third-party hosts, you may encounter
                advertisements, pop-ups, or redirects embedded within those external players.{" "}
                <span className="font-semibold text-zinc-300">
                  Otama has zero control over these third-party advertisements.
                </span>{" "}
                We highly recommend utilizing a robust adblocker (such as uBlock Origin) when
                browsing the internet to ensure a safe, uninterrupted viewing experience. We hold
                no liability for any malicious software, intrusive ads, or damages resulting from
                interaction with third-party video players.
              </p>

              <p className="font-semibold text-zinc-300">4. Limitation of Liability</p>
              <p>
                Under no circumstances shall Otama, its administrators, or its operators be held
                liable for any direct, indirect, incidental, consequential, or punitive damages
                arising from your use of the website. You access and use this service entirely at
                your own risk.
              </p>
            </div>
          </section>
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
