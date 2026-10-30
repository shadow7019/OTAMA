import { NextResponse } from "next/server";
import type { MediaItem } from "@/lib/tmdb";
import { getImdbId, tmdbServer } from "@/lib/tmdb-server";
import { quickAvailability } from "@/lib/torrent-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auto-content
 *
 * Automatically discovers NEW content that is actually playable:
 *   1. every 30 min it rebuilds a candidate queue from TMDB
 *      (trending / now playing / on the air);
 *   2. every request verifies the next small batch of candidates against the
 *      torrent networks (Torrentio) and keeps only titles with real sources;
 *   3. returns the verified list so the home page row always shows items you
 *      can actually press play on.
 */
interface PlayableItem extends MediaItem {
  sources: number;
}

interface AutoState {
  items: PlayableItem[];
  queue: MediaItem[];
  checked: Set<string>;
  rebuiltAt: number;
  cursor: number;
}

const g = globalThis as unknown as { __cinexAutoContent?: AutoState };
const REBUILD_MS = 30 * 60 * 1000;
const VERIFY_BUDGET_MS = 12_000; // per-request verification budget
const CANDIDATES = 24;
const MAX_ITEMS = 40;

function normalize(items: MediaItem[], fallbackType: "movie" | "tv"): MediaItem[] {
  return items
    .filter((r) => r && !r.adult && r.poster_path && (r.media_type === undefined || r.media_type === "movie" || r.media_type === "tv"))
    .map((r) => ({ ...r, media_type: r.media_type ?? fallbackType }));
}

async function rebuild(): Promise<AutoState> {
  const [trending, nowPlaying, onAir] = await Promise.all([
    tmdbServer<{ results: MediaItem[] }>("trending/all/week"),
    tmdbServer<{ results: MediaItem[] }>("movie/now_playing"),
    tmdbServer<{ results: MediaItem[] }>("tv/on_the_air"),
  ]);

  const merged = new Map<string, MediaItem>();
  for (const item of [
    ...normalize(trending.results, "movie"),
    ...normalize(nowPlaying.results, "movie"),
    ...normalize(onAir.results, "tv"),
  ]) {
    const key = `${item.media_type}-${item.id}`;
    if (!merged.has(key)) merged.set(key, item);
  }

  const queue = [...merged.values()]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, CANDIDATES);

  const st: AutoState = {
    items: [],
    queue,
    checked: new Set(),
    rebuiltAt: Date.now(),
    cursor: 0,
  };
  g.__cinexAutoContent = st;
  return st;
}

export async function GET() {
  let st = g.__cinexAutoContent;
  if (!st || Date.now() - st.rebuiltAt > REBUILD_MS) {
    try {
      st = await rebuild();
    } catch {
      // rebuild failed — serve whatever we verified earlier, if anything
      if (!st) {
        return NextResponse.json({ results: [], verified: 0, total: 0, refreshedAt: null });
      }
    }
  }

  const deadline = Date.now() + VERIFY_BUDGET_MS;
  while (st.cursor < st.queue.length && Date.now() < deadline) {
    const item = st.queue[st.cursor];
    st.cursor += 1;
    const type = item.media_type === "tv" ? "tv" : "movie";
    const key = `${type}-${item.id}`;
    if (st.checked.has(key)) continue;
    st.checked.add(key);

    try {
      const imdbId = await getImdbId(type, item.id);
      if (!imdbId) continue;
      const season = 1;
      const episode = 1;
      const n = await quickAvailability(type, imdbId, season, episode);
      if (n > 0) st.items.push({ ...item, sources: n });
    } catch {
      // unreachable provider — skip this candidate this cycle
    }
  }

  return NextResponse.json({
    results: st.items.slice(0, MAX_ITEMS),
    verified: st.checked.size,
    total: st.queue.length,
    refreshedAt: st.rebuiltAt,
  });
}
