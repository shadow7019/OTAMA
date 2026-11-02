import { NextResponse } from "next/server";
import { tmdbServer } from "@/lib/tmdb-server";

export const dynamic = "force-dynamic";

type Raw = Record<string, unknown>;
type Paged = { results?: Raw[] };

/** tag movie/tv rows so the client's getMediaType() knows what it got */
const tag = (items: Raw[] | undefined, type: "movie" | "tv") =>
  (items ?? []).slice(0, 20).map((r) => ({ ...r, media_type: type }));

const genreMovie = (id: number) =>
  tmdbServer<Paged>(`discover/movie?with_genres=${id}&sort_by=popularity.desc&vote_count.gte=50`);

export async function GET() {
  try {
    const [trending, nowPlaying, popularMovies, topMovies, popularTv, topTv, onAir, animation, scifi, horror, comedy, classics] =
      await Promise.all([
        tmdbServer<Paged>("trending/all/week"),
        tmdbServer<Paged>("movie/now_playing"),
        tmdbServer<Paged>("movie/popular"),
        tmdbServer<Paged>("movie/top_rated"),
        tmdbServer<Paged>("tv/popular"),
        tmdbServer<Paged>("tv/top_rated"),
        tmdbServer<Paged>("tv/on_the_air"),
        genreMovie(16),
        genreMovie(878),
        genreMovie(27),
        genreMovie(35),
        tmdbServer<Paged>(
          "discover/movie?release_date.lte=2005-01-01&sort_by=vote_average.desc&vote_count.gte=2000"
        ),
      ]);
    const data = {
      hero: tag(trending.results, "movie"),
      trending: tag(trending.results, "movie"),
      nowPlaying: tag(nowPlaying.results, "movie"),
      popularMovies: tag(popularMovies.results, "movie"),
      topMovies: tag(topMovies.results, "movie"),
      popularTv: tag(popularTv.results, "tv"),
      topTv: tag(topTv.results, "tv"),
      onAir: tag(onAir.results, "tv"),
      animation: tag(animation.results, "movie"),
      scifi: tag(scifi.results, "movie"),
      horror: tag(horror.results, "movie"),
      comedy: tag(comedy.results, "movie"),
      classics: tag(classics.results, "movie"),
    };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build home rows";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
