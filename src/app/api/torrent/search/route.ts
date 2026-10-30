import { NextRequest, NextResponse } from "next/server";
import { searchTorrentSources } from "@/lib/torrent-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;
const MAX_CACHE = 300;

/**
 * GET /api/torrent/search?type=movie|tv&id=<tmdbId>&season=1&episode=1
 * Returns torrent "servers" ranked best-first (seeders, codec, quality, size).
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
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data, { headers: { "X-Cache": "HIT" } });
  }

  const title = (sp.get("title") ?? "").trim().slice(0, 120);
  const year = (sp.get("year") ?? "").trim().slice(0, 4);

  try {
    const results = await searchTorrentSources({ type, tmdbId: id, title, year, season, episode });
    const payload = { results, searchedWith: { title, year, season, episode } };
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(cacheKey, { data: payload, ts: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Torrent search failed", detail }, { status: 502 });
  }
}
