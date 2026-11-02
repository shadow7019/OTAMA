"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Play,
  Plus,
  Check,
  Star,
  Clock,
  Globe,
  Share2,
  ArrowLeft,
  Film,
  Clapperboard,
  Users,
  ExternalLink,
  CalendarDays,
  Loader2,
  RefreshCw,
  Award,
  TrendingUp,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  img,
  mediaId,
  runtimeFmt,
  type MediaItem,
  type MediaType,
} from "@/lib/tmdb-constants";
import { MediaCard } from "./MediaCard";
import { ContentRow } from "./ContentRow";
import { cn } from "@/lib/utils";

// ---------------- Types (subset of TMDB detail + append_to_response) ----------------

type CastMember = { id: number; name: string; character?: string; profile_path?: string | null };
type CrewMember = { id: number; name: string; job?: string };
type VideoResult = { key: string; name: string; site: string; type: string; official?: boolean };

type DetailResponse = {
  id: number;
  name?: string;
  title?: string;
  overview?: string;
  tagline?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  status?: string;
  genres?: { id: number; name: string }[];
  homepage?: string;
  original_language?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  created_by?: { id: number; name: string }[];
  seasons?: { season_number: number; name: string; episode_count: number; air_date?: string }[];
  credits?: { cast?: CastMember[]; crew?: CrewMember[] };
  videos?: { results?: VideoResult[] };
  recommendations?: { results?: RawTmdbItem[] };
  similar?: { results?: RawTmdbItem[] };
  external_ids?: { imdb_id?: string | null };
};

type RawTmdbItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
};

type SeasonEpisodes = {
  episodes?: {
    episode_number: number;
    name: string;
    overview?: string;
    still_path?: string | null;
    air_date?: string;
    runtime?: number | null;
    vote_average?: number;
  }[];
};

function normalizeRelated(list: RawTmdbItem[] | undefined): MediaItem[] {
  return (list || [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv" || r.title || r.name)
    .map((r) => ({
      id: r.id,
      type: (r.media_type === "tv" ? "tv" : r.media_type === "movie" ? "movie" : undefined) as MediaType | undefined,
      name: r.title || r.name || "",
      year: Number((r.release_date || r.first_air_date || "").slice(0, 4)) || null,
      rating: Math.round((r.vote_average ?? 0) * 10) / 10,
      poster: img(r.poster_path, "w342"),
      backdrop: img(r.backdrop_path, "w780"),
      overview: r.overview || "",
    }))
    .filter((x): x is MediaItem => Boolean(x.type && x.name));
}

export function DetailView({ type, id }: { type: MediaType; id: string }) {
  const navigate = useStore((s) => s.navigate);
  const goBack = useStore((s) => s.goBack);
  const toggleWatchlist = useStore((s) => s.toggleWatchlist);
  const watchlist = useStore((s) => s.watchlist);
  const progressMap = useStore((s) => s.progress);
  const toast = useStore((s) => s.toast);

  const [data, setData] = useState<DetailResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [seasonSel, setSeasonSel] = useState(1);
  const [episodes, setEpisodes] = useState<NonNullable<SeasonEpisodes["episodes"]> | null>(null); // null = loading
  const [epFailed, setEpFailed] = useState(false);

  const numericId = Number(id);
  const loading = data === null && !failed;

  const load = useCallback(() => {
    if (!Number.isFinite(numericId)) {
      setTimeout(() => setFailed(true), 0);
      return;
    }
    fetch(`/api/tmdb/${type}/${numericId}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: DetailResponse) => {
        setData(d);
        if (type === "tv" && d.seasons?.length) {
          const first = d.seasons.find((s) => s.season_number > 0 && s.episode_count > 0) || d.seasons[0];
          setSeasonSel(first.season_number);
        }
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [type, numericId]);

  useEffect(load, [load, retryKey]);

  // Fetch episodes for the selected season (TV only)
  useEffect(() => {
    if (type !== "tv" || !Number.isFinite(numericId)) return;
    let cancelled = false;
    fetch(`/api/tmdb/tv/${numericId}/season/${seasonSel}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: SeasonEpisodes) => {
        if (!cancelled) {
          setEpisodes(d.episodes || []);
          setEpFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodes([]);
          setEpFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [type, numericId, seasonSel, retryKey]);

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center gap-2 pt-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading details…
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 pt-24 text-center">
        <Film className="h-12 w-12 text-primary" />
        <p className="text-xl font-bold">Title not found</p>
        <p className="text-sm text-muted-foreground">
          TMDB may be unreachable, or this title doesn&apos;t exist.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setFailed(false);
              setRetryKey((k) => k + 1);
            }}
            className="mt-2 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
          <button
            onClick={() => navigate({ name: "home" })}
            className="mt-2 rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-white"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const name = data.title || data.name || "Untitled";
  const year = (data.release_date || data.first_air_date || "").slice(0, 4);
  const tagline = data.tagline || "";
  const runtime =
    type === "movie" ? data.runtime : data.episode_run_time?.[0] || undefined;
  const storeId = mediaId(type, data.id);
  const inList = watchlist.some((w) => w.id === storeId);
  const progress = progressMap[storeId];
  const imdb = data.external_ids?.imdb_id;

  const cast = (data.credits?.cast || []).slice(0, 12);
  const directors =
    type === "movie"
      ? (data.credits?.crew || []).filter((c) => c.job === "Director").map((c) => c.name)
      : (data.created_by || []).map((c) => c.name);
  const writers = (data.credits?.crew || [])
    .filter((c) => c.job === "Screenplay" || c.job === "Writer" || c.job === "Story")
    .map((c) => c.name);
  const videos = (data.videos?.results || [])
    .filter((v) => v.site === "YouTube" && v.key)
    .slice(0, 8);
  const recommendations = normalizeRelated(data.recommendations?.results).slice(0, 18);
  const similar = normalizeRelated(data.similar?.results).slice(0, 18);

  const resumeSeason = progress?.season;
  const resumeEpisode = progress?.episode;

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "Share it with a friend.");
    } catch {
      toast("Could not copy link", "Copy it from the address bar instead.");
    }
  };

  return (
    <div className="pb-10">
      {/* Backdrop */}
      <div className="relative h-[46vh] min-h-[380px] w-full overflow-hidden md:h-[60vh]">
        {data.backdrop_path ? (
          <img
            src={img(data.backdrop_path, "w1280")}
            alt={`${name} backdrop`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : data.poster_path ? (
          <img
            src={img(data.poster_path, "w780")}
            alt=""
            className="h-full w-full scale-110 object-cover blur-md"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-zinc-800 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        <button
          onClick={goBack}
          aria-label="Go back"
          className="absolute left-4 top-20 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 md:left-8"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      {/* Info */}
      <div className="relative z-10 mx-auto -mt-40 max-w-[1600px] px-4 md:-mt-52 md:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:gap-10">
          {/* Poster */}
          <div className="w-40 shrink-0 md:w-60">
            <div className="overflow-hidden rounded-xl ring-1 ring-white/10 shadow-2xl shadow-black/60">
              {data.poster_path ? (
                <img
                  src={img(data.poster_path, "w342")}
                  alt={`${name} poster`}
                  className="w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-muted">
                  <Film className="h-10 w-10 text-muted-foreground/40" />
                </div>
              )}
            </div>
            {progress && progress.duration > 0 ? (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (progress.seconds / progress.duration) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Watched {Math.floor((progress.seconds / progress.duration) * 100)}%
                </p>
              </div>
            ) : null}
          </div>

          {/* Meta */}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                {type === "tv" ? "TV Series" : "Movie"}
              </span>
              {data.status && data.status !== "Released" ? (
                <span className="rounded border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                  {data.status.replace(/_/g, " ")}
                </span>
              ) : null}
              {imdb ? (
                <a
                  href={`https://www.imdb.com/title/${imdb}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[11px] font-semibold text-foreground/70 transition hover:text-primary"
                >
                  IMDb <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
            </div>

            <h1 className="text-3xl font-black leading-tight tracking-tight text-foreground md:text-5xl">
              {name}
            </h1>
            {tagline ? (
              <p className="mt-1.5 text-sm font-medium italic text-muted-foreground">
                “{tagline}”
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-foreground/75">
              {data.vote_average ? (
                <span className="flex items-center gap-1.5 font-bold text-amber-400">
                  <Star className="h-4 w-4 fill-amber-400" /> {data.vote_average.toFixed(1)}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({data.vote_count?.toLocaleString?.() ?? 0} votes)
                  </span>
                </span>
              ) : null}
              {runtime ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 opacity-60" /> {runtimeFmt(runtime)}
                  {type === "tv" ? <span className="text-xs">/ episode</span> : null}
                </span>
              ) : null}
              {type === "tv" && data.number_of_seasons ? (
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 opacity-60" /> {data.number_of_seasons} season
                  {data.number_of_seasons === 1 ? "" : "s"} · {data.number_of_episodes} episodes
                </span>
              ) : null}
              {data.original_language ? (
                <span className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4 opacity-60" /> {data.original_language.toUpperCase()}
                </span>
              ) : null}
              {year ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 opacity-60" /> {year}
                </span>
              ) : null}
            </div>

            {/* Genres */}
            {data.genres?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.genres.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => navigate({ name: "browse", kind: type, genre: g.id })}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-foreground/80 transition hover:border-primary/50 hover:text-primary"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() =>
                  navigate({
                    name: "watch",
                    type,
                    id: String(data.id),
                    season: resumeSeason,
                    episode: resumeEpisode,
                  })
                }
                className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-bold text-white shadow-xl shadow-primary/25 transition hover:scale-[1.02] hover:bg-primary/90"
              >
                <Play className="h-5 w-5 fill-white" />
                {progress
                  ? "Resume"
                  : type === "tv"
                    ? "Play S1 E1"
                    : "Play Now"}
              </button>
              <button
                onClick={() =>
                  toggleWatchlist({
                    id: data.id,
                    type,
                    name,
                    year: year ? Number(year) : null,
                    rating: data.vote_average ?? 0,
                    poster: img(data.poster_path, "w342"),
                    backdrop: img(data.backdrop_path, "w780"),
                    overview: data.overview || "",
                  })
                }
                className="flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-semibold text-foreground transition hover:bg-white/10"
              >
                {inList ? (
                  <>
                    <Check className="h-5 w-5 text-primary" /> In My List
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" /> Add to My List
                  </>
                )}
              </button>
              <button
                onClick={() => void share()}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition hover:bg-white/10"
                aria-label="Share"
              >
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Synopsis + details */}
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Clapperboard className="h-5 w-5 text-primary" /> Storyline
            </h2>
            <p className="mt-3 leading-relaxed text-foreground/80">
              {data.overview || "No synopsis available for this title yet."}
            </p>

            {/* Trailers */}
            {videos.length ? (
              <div className="mt-8">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Play className="h-5 w-5 text-primary" /> Videos &amp; Trailers
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {videos.map((v) => (
                    <button
                      key={v.key}
                      onClick={() =>
                        navigate({ name: "watch", type, id: String(data.id) })
                      }
                      className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-foreground/85 transition hover:border-primary/50 hover:text-primary"
                      title={`Play “${v.name}” in the player`}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span className="max-w-[220px] truncate">{v.name}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground group-hover:text-primary">
                        {v.type}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Previews play in the built-in player via YouTube.
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
            {directors.length ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {type === "tv" ? "Created By" : "Director"}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {directors.slice(0, 3).join(", ")}
                </p>
              </div>
            ) : null}
            {writers.length ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Writers
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {[...new Set(writers)].slice(0, 3).join(", ")}
                </p>
              </div>
            ) : null}
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Starring
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {cast.slice(0, 5).map((c) => c.name).join(", ") || "—"}
              </p>
            </div>
            {data.genres?.length ? (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Genres
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {data.genres.map((g) => g.name).join(", ")}
                </p>
              </div>
            ) : null}
            <p className="border-t border-white/5 pt-3 text-[11px] leading-relaxed text-muted-foreground/70">
              Metadata &amp; artwork from The Movie Database (TMDB). Playback uses official
              trailers and public-domain sources.
            </p>
          </div>
        </div>

        {/* Cast */}
        {cast.length ? (
          <div className="mt-10">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Users className="h-5 w-5 text-primary" /> Top Billed Cast
            </h2>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin" style={{ scrollbarWidth: "thin" }}>
              {cast.map((c) => (
                <div
                  key={c.id}
                  className="w-[130px] shrink-0 overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]"
                >
                  <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
                    {c.profile_path ? (
                      <img
                        src={img(c.profile_path, "w185")}
                        alt={c.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Users className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-bold text-foreground">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.character}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Episodes (TV) */}
        {type === "tv" && data.seasons?.length ? (
          <div className="mt-10">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">Episodes</h2>
              <div className="flex flex-wrap gap-1.5">
                {data.seasons
                  .filter((s) => s.episode_count > 0)
                  .map((s) => (
                    <button
                      key={s.season_number}
                      onClick={() => setSeasonSel(s.season_number)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        s.season_number === seasonSel
                          ? "bg-primary text-white"
                          : "bg-white/5 text-foreground/70 hover:bg-white/10"
                      )}
                    >
                      {s.season_number === 0 ? "Specials" : `Season ${s.season_number}`}
                    </button>
                  ))}
              </div>
            </div>

            {episodes === null ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading episodes…
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {episodes.map((e) => {
                  const isCurrent =
                    progress?.season === seasonSel && progress?.episode === e.episode_number;
                  return (
                    <button
                      key={e.episode_number}
                      onClick={() =>
                        navigate({
                          name: "watch",
                          type: "tv",
                          id: String(data.id),
                          season: seasonSel,
                          episode: e.episode_number,
                        })
                      }
                      className="group flex items-start gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-primary/40 hover:bg-white/[0.06]"
                    >
                      <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted md:w-40">
                        {e.still_path ? (
                          <img
                            src={img(e.still_path, "w300")}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition group-hover:scale-105"
                            draggable={false}
                          />
                        ) : (
                          <Film className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground/80">
                            S{seasonSel} E{e.episode_number}
                          </span>
                          {e.runtime ? (
                            <span className="text-xs text-muted-foreground">{e.runtime} min</span>
                          ) : null}
                          {e.air_date ? (
                            <span className="text-xs text-muted-foreground">{e.air_date}</span>
                          ) : null}
                          {isCurrent ? (
                            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              Resume
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-1 truncate text-sm font-bold text-foreground">
                          {e.name || `Episode ${e.episode_number}`}
                        </h3>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {e.overview || "No description available."}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-foreground transition group-hover:bg-primary group-hover:text-white">
                        <Play className="h-4 w-4 fill-current" />
                      </div>
                    </button>
                  );
                })}
                {!episodes.length ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    No episode data available for this season.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {/* Related */}
        {recommendations.length ? (
          <div className="mt-12">
            <ContentRow
              title="More Like This"
              subtitle="Recommended for fans of this title"
              items={recommendations}
              action={<TrendingUp className="h-5 w-5 text-primary/50" />}
            />
          </div>
        ) : null}
        {similar.length ? (
          <div className="mt-6">
            <ContentRow title="Similar Titles" items={similar} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
