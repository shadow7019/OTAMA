import { NextRequest, NextResponse } from "next/server";
import { getImdbId } from "@/lib/tmdb-server";
import { getSubtitles } from "@/lib/subtitles-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/subtitles?type=movie|tv&id=<tmdbId>&season=1&episode=1
 * Resolves the title's IMDb id and returns one selectable subtitle track per
 * language: { languages: [{ id, lang, langName, src, fileName }] }.
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

  try {
    const imdbId = await getImdbId(type, id);
    if (!imdbId) return NextResponse.json({ languages: [] });
    const languages = await getSubtitles(type, imdbId, season, episode);
    return NextResponse.json(
      { languages },
      { headers: { "Cache-Control": "public, max-age=600" } }
    );
  } catch {
    return NextResponse.json({ languages: [] });
  }
}
