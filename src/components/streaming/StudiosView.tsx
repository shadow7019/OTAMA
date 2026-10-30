"use client";

import { Building2, Tv } from "lucide-react";
import { Brand, STUDIOS, NETWORKS, brandLogoUrl } from "@/lib/brands";

interface StudiosViewProps {
  onSelect: (brand: Brand) => void;
}

function BrandTile({ brand, onSelect }: { brand: Brand; onSelect: (b: Brand) => void }) {
  const logo = brandLogoUrl(brand);
  return (
    <button
      type="button"
      onClick={() => onSelect(brand)}
      aria-label={`Browse ${brand.name} ${brand.kind === "movie" ? "movies" : "shows"}`}
      title={`Browse ${brand.name}`}
      className="group flex aspect-[2.4/1] items-center justify-center rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10 transition hover:bg-white/[0.09] hover:ring-red-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
    >
      {logo ? (
        <img
          src={logo}
          alt={brand.name}
          loading="lazy"
          className="max-h-full max-w-[80%] object-contain opacity-80 transition group-hover:opacity-100"
        />
      ) : (
        <span className="text-center text-sm font-bold text-zinc-300">{brand.name}</span>
      )}
    </button>
  );
}

function BrandSection({
  icon,
  title,
  subtitle,
  brands,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  brands: Brand[];
  onSelect: (b: Brand) => void;
}) {
  return (
    <section className="mt-10" aria-label={title}>
      <div className="flex items-center gap-2">
        <span className="text-red-500">{icon}</span>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100 md:text-xl">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {brands.map((b) => (
          <BrandTile key={`${b.param}-${b.id}`} brand={b} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

export function StudiosView({ onSelect }: StudiosViewProps) {
  return (
    <div className="px-4 pb-16 pt-24 md:px-8 md:pt-28">
      <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
        Studios &amp; Streaming Services
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
        Browse each major studio&apos;s film library and every streaming service&apos;s
        catalog. Everything you open plays through the auto-selected best server — or
        ad-free when a public-domain copy exists.
      </p>

      <BrandSection
        icon={<Building2 className="h-5 w-5" />}
        title="Movie Studios"
        subtitle="Warner, Universal, Disney, Marvel, Ghibli and more — their films, ranked by popularity"
        brands={STUDIOS}
        onSelect={onSelect}
      />
      <BrandSection
        icon={<Tv className="h-5 w-5" />}
        title="Streaming Services &amp; Networks"
        subtitle="Netflix, HBO, Disney+, Prime Video, Apple TV+ and classic networks — their shows"
        brands={NETWORKS}
        onSelect={onSelect}
      />
    </div>
  );
}
