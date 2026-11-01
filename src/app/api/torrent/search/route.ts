import { NextRequest, NextResponse } from "next/server";
import { searchTorrentSources, type ProviderStat } from "@/lib/torrent-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CacheEntry {
  data: unknown;
  ts: number;
  /** per-entry TTL — empty results expire fast so retries actually re-scan */
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;
const EMPTY_TTL = 60 * 1000;
const MAX_CACHE = 300;

/**
 * GET /api/torrent/search?type=movie|tv&id=<tmdbId>&season=1&episode=1
 * Returns torrent "servers" ranked best-first. Every result is validated
 * against the title/year (movies) or season/episode (TV) so same-named
 * content never gets mixed.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const id = Number(sp.get("id"));
  const season = Math.max(1, Number(sp.get("season")) || 1);
  const episode = Math.max(1, Number(sp.get("episode")) || 1);

  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const cacheKey = `${type}:${id}:${type === "tv" ? `${season}:${episode}` : "m"}`;
  // a language-targeted scan is a different result set — never serve the
  // unfiltered one from cache (and vice versa)
  const langParam = (sp.get("lang") ?? "").trim().toLowerCase();
  const cacheKeyWithLang = langParam ? `${cacheKey}:${langParam}` : cacheKey;
  const cached = cache.get(cacheKeyWithLang);
  if (cached && Date.now() - cached.ts < cached.ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const title = (sp.get("title") ?? "").trim().slice(0, 120);
  const year = (sp.get("year") ?? "").trim().slice(0, 4);

  try {
    const providerStatus: ProviderStat[] = [];
    const results = await searchTorrentSources(
      {
        type,
        tmdbId: id,
        title,
        year,
        season,
        episode,
        audioLang: langParam || null,
      },
      (s) => providerStatus.push(s)
    );
    const payload = {
      results,
      providerStatus,
      searchedWith: { title, year, season, episode, lang: langParam },
    };
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(cacheKeyWithLang, {
      data: payload,
      ts: Date.now(),
      ttl: results.length ? TTL : EMPTY_TTL,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Torrent search failed", detail }, { status: 502 });
  }
}
