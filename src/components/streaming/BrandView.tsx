"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Film, Tv } from "lucide-react";
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

    const movies: Catalog | null =
      brand.param === "with_companies"
        ? {
            id: "movies",
            label: "Movies",
            kind: "movie",
            note: `Feature films produced by ${brand.name}.`,
            params: { with_companies: brand.id },
          }
        : brand.watchProvider
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
            actions={actions}
          />
        </div>
      ))}
    </div>
  );
}
