"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Film, Search, Tv, X } from "lucide-react";
import { Brand, brandLogoUrl } from "@/lib/brands";
import { MediaActions } from "./types";
import { BrowseGrid } from "./BrowseGrid";

interface BrandViewProps {
  brand: Brand;
  actions: MediaActions;
  onBack: () => void;
  backLabel?: string;
}

type CatalogId = "movies" | "series";

interface Catalog {
  id: CatalogId;
  label: string;
  kind: "movie" | "tv";
  note: string;
  params: Record<string, string | number | boolean>;
}

/**
 * Full page for one studio or streaming service, in the spirit of each
 * brand's own site: a branded hero plus separate, independent catalogs for
 * Series and Movies (tabbed), each with its own genre / sort / year filters
 * and infinite scroll.
 *
 * - Movie studios: Movies via discover/movie?with_companies, Series via
 *   discover/tv?with_companies (many studios produce shows too).
 * - Streaming services: Series via discover/tv?with_networks, Movies via
 *   discover/movie?with_watch_providers (flatrate) — a network id alone
 *   only ever returns series.
 */
export function BrandView({ brand, actions, onBack, backLabel = "All studios" }: BrandViewProps) {
  const [tab, setTab] = useState<CatalogId>(brand.kind === "movie" ? "movies" : "series");
  // in-catalog search (like the brand's own site) — flagship titles that sit
  // deep in the popularity-sorted discover list are one query away
  const [search, setSearch] = useState("");
  const [searchQ, setSearchQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const catalogs = useMemo<Catalog[]>(() => {
    const series: Catalog =
      brand.param === "with_networks"
        ? {
            id: "series",
            label: "Series",
            kind: "tv",
            note: `Everything on ${brand.name} — originals, acquired shows and co-productions.`,
            params: { with_networks: brand.id },
          }
        : {
            id: "series",
            label: "Series",
            kind: "tv",
            note: `Series produced by ${brand.name}.`,
            params: { with_companies: brand.id },
          };

    // Movies catalog: a verified watch-provider id beats company credits —
    // it is what viewers mean by "films on <service>" (all existing provider
    // brands are with_networks, so behavior for them is unchanged); studios
    // without a provider fall back to discover/movie?with_companies.
    const movies: Catalog | null = brand.watchProvider
      ? {
          id: "movies",
          label: "Movies",
          kind: "movie",
          note: `Films streaming on ${brand.name} with a subscription${
            brand.watchRegion && brand.watchRegion !== "US" ? ` (${brand.watchRegion})` : ""
          }.`,
          params: {
            with_watch_providers: brand.watchProvider,
            watch_region: brand.watchRegion ?? "US",
            with_watch_monetization_type: "flatrate",
          },
        }
      : brand.param === "with_companies"
        ? {
            id: "movies",
            label: "Movies",
            kind: "movie",
            note: `Feature films produced by ${brand.name}.`,
            params: { with_companies: brand.id },
          }
        : null;

    return brand.kind === "movie" ? [movies as Catalog, series] : [series, ...(movies ? [movies] : [])];
  }, [brand]);

  const logo = brandLogoUrl(brand, "w500");

  return (
    <div className="pb-16">
      {/* Branded hero */}
      <div className="px-4 pt-24 md:px-8 md:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-red-400"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </button>
        <div className="flex items-center gap-4">
          {logo ? (
            <img
              src={logo}
              alt={brand.name}
              className="h-12 w-auto max-w-[60vw] object-contain md:h-20"
            />
          ) : (
            <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">{brand.name}</h1>
          )}
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-500">
          {brand.tagline ? `${brand.tagline}. ` : `Browse the ${brand.name} catalog. `}Series
          and movies live in their own tabs below, each with its own genre, sort and
          year filters.
        </p>
      </div>

      {/* Sticky catalog tabs */}
      <div
        className="sticky top-14 z-30 mt-6 border-b border-white/5 bg-[#0b0b10]/95 backdrop-blur-md md:top-16"
        role="tablist"
        aria-label={`${brand.name} catalogs`}
      >
        <div className="flex gap-1 px-4 md:px-8">
          {catalogs.map((c) => {
            const active = tab === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`tab-${c.id}`}
                onClick={() => setTab(c.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {c.id === "movies" ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
                {c.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center py-2">
            <label className="relative flex items-center" aria-label={`Search inside ${brand.name}`}>
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
                placeholder={`Search ${tab === "movies" ? "movies" : "series"}…`}
                aria-label={`Search ${brand.name} catalog`}
                data-testid="brand-search"
                className="w-36 rounded-full border border-white/10 bg-white/5 py-1.5 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-600 focus:w-48 focus:border-red-600 focus:outline-none sm:w-44 sm:focus:w-60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear catalog search"
                  className="absolute right-2 text-zinc-500 transition hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* Catalogs — both mounted so tab switches are instant; the hidden one
          stays idle (display:none never intersects the scroll sentinel). */}
      {catalogs.map((c) => (
        <div
          key={c.id}
          role="tabpanel"
          aria-label={`${brand.name} — ${c.label}`}
          className={tab === c.id ? "block" : "hidden"}
        >
          <BrowseGrid
            kind={c.kind}
            bare
            showGenreChips
            note={c.note}
            title={c.label}
            discoverParams={c.params}
            brandSearchQuery={tab === c.id ? searchQ : ""}
            actions={actions}
          />
        </div>
      ))}
    </div>
  );
}
