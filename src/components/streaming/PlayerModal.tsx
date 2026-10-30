"use client";

import { useEffect, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  List,
  Info,
  Server,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  MediaDetails,
  MediaItem,
  Episode,
  getTitle,
  getMediaType,
  img,
  tmdb,
  PLAYER_SOURCES,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";

interface PlayerModalProps {
  target: { item: MediaItem; season?: number; episode?: number } | null;
  actions: MediaActions;
  onClose: () => void;
}

type Health = "checking" | "up" | "popup" | "down";
type FrameState = "loading" | "ready" | "timeout";

/** How long to wait for the embed iframe before offering fallbacks. */
const LOAD_TIMEOUT_MS = 10000;

const HEALTH_DOT: Record<Health, string> = {
  checking: "bg-zinc-600 animate-pulse",
  up: "bg-emerald-400",
  popup: "bg-amber-400",
  down: "bg-red-500",
};

const HEALTH_TIP: Record<Health, string> = {
  checking: "Checking server…",
  up: "Server is up",
  popup: "Server is up but may block embedding — use Pop out",
  down: "Server not responding right now",
};

export function PlayerModal({ target, actions, onClose }: PlayerModalProps) {
  // remounted per target via key — initial state is safe to derive from props
  const type = target ? getMediaType(target.item) : "movie";
  const itemId = target?.item.id ?? null;
  const [sourceIdx, setSourceIdx] = useState(() => {
    const saved = useMediaStore.getState().sourceId;
    const idx = PLAYER_SOURCES.findIndex((s) => s.id === saved);
    return idx >= 0 ? idx : 0;
  });
  const [season, setSeason] = useState(() => target?.season ?? 1);
  const [episode, setEpisode] = useState(() => target?.episode ?? 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [epLoading, setEpLoading] = useState(() => type === "tv");
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [frameState, setFrameState] = useState<FrameState>("loading");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [healthMap, setHealthMap] = useState<Record<string, Health>>({});
  const [healthFor, setHealthFor] = useState<number | null>(null);
  const [autoSwitchedFor, setAutoSwitchedFor] = useState<number | null>(null);
  const mounted = useMounted();
  const addContinue = useMediaStore((s) => s.addContinue);
  const toggleWatchlist = useMediaStore((s) => s.toggleWatchlist);
  const setSourceId = useMediaStore((s) => s.setSourceId);
  const watchlist = useMediaStore((s) => s.watchlist);

  // identity of the current embed; resetting to "loading" is done at render time
  const srcKey = `${itemId ?? "none"}-${sourceIdx}-${season}-${episode}-${reloadNonce}`;
  const [prevSrcKey, setPrevSrcKey] = useState(srcKey);
  if (prevSrcKey !== srcKey) {
    setPrevSrcKey(srcKey);
    setFrameState("loading");
  }

  // record progress for "Continue Watching" (external system write);
  // re-records as the user navigates seasons/episodes so we resume at the latest spot
  useEffect(() => {
    if (!target || !mounted) return;
    const t = getMediaType(target.item);
    addContinue(
      target.item,
      t === "tv" ? season : undefined,
      t === "tv" ? episode : undefined
    );
  }, [target, mounted, addContinue, season, episode]);

  // fetch details (for season list)
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    tmdb<MediaDetails>(`${type}/${target.item.id}`)
      .then((d) => !cancelled && setDetails(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [target, type]);

  // fetch episodes when season changes (TV only)
  useEffect(() => {
    if (!target || type !== "tv") return;
    let cancelled = false;
    tmdb<{ episodes: Episode[] }>(`tv/${target.item.id}/season/${season}`)
      .then((res) => {
        if (!cancelled) {
          setEpisodes(res.episodes ?? []);
          setEpLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEpisodes([]);
          setEpLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [target, type, season]);

  // loading watchdog: if the iframe never fires onLoad before the timeout,
  // surface fallback actions (next server / retry / pop out)
  useEffect(() => {
    if (!target) return;
    const t = setTimeout(() => {
      setFrameState((s) => (s === "loading" ? "timeout" : s));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [srcKey, target]);

  // probe every server once per title so the strip shows live status dots
  useEffect(() => {
    if (itemId === null) return;
    let cancelled = false;
    PLAYER_SOURCES.forEach((s) => {
      const probe = type === "movie" ? s.movie(itemId) : s.tv(itemId, 1, 1);
      fetch(`/api/embed-check?url=${encodeURIComponent(probe)}`)
        .then((r) => r.json())
        .then((j: { ok?: boolean; frameable?: boolean }) => {
          if (cancelled) return;
          const h: Health = !j.ok ? "down" : j.frameable === false ? "popup" : "up";
          setHealthMap((prev) => ({ ...prev, [s.id]: h }));
          setHealthFor(itemId);
        })
        .catch(() => {
          if (!cancelled) {
            setHealthMap((prev) => ({ ...prev, [s.id]: "down" }));
            setHealthFor(itemId);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, type]);

  // persist the chosen server for future sessions (external store write)
  useEffect(() => {
    setSourceId(PLAYER_SOURCES[sourceIdx].id);
  }, [sourceIdx, setSourceId]);

  // lock scroll + escape
  useEffect(() => {
    if (!target) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [target, onClose]);

  const seasonsList = (
    details?.seasons ?? []
  ).filter((s) => s.season_number > 0 && s.episode_count > 0);

  const maxEpisode =
    episodes.length ||
    details?.seasons?.find((s) => s.season_number === season)?.episode_count ||
    1;

  if (!target) return null;

  const item = target.item;
  const title = getTitle(item);
  const source = PLAYER_SOURCES[sourceIdx];
  const src =
    type === "movie" ? source.movie(item.id) : source.tv(item.id, season, episode);

  // self-heal (once per title): if the browser failed to load the embed within
  // the timeout AND the probe confirms the server is down, silently move to the
  // first healthy server instead of leaving the user stuck on a dead one
  if (
    healthFor === item.id &&
    frameState === "timeout" &&
    autoSwitchedFor !== item.id &&
    healthMap[source.id] === "down"
  ) {
    const firstUp = PLAYER_SOURCES.findIndex((s) => healthMap[s.id] === "up");
    if (firstUp >= 0 && firstUp !== sourceIdx) {
      setAutoSwitchedFor(item.id);
      setSourceIdx(firstUp);
    }
  }

  const goEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    setShowEpisodes(false);
  };

  const nextEpisode = () => {
    if (episode < maxEpisode) goEpisode(season, episode + 1);
    else if (seasonsList.some((s) => s.season_number === season + 1)) goEpisode(season + 1, 1);
  };

  const prevEpisode = () => {
    if (episode > 1) goEpisode(season, episode - 1);
    else if (season > 1) goEpisode(season - 1, 1);
  };

  const inList = mounted
    ? watchlist.some((w) => w.id === item.id && w.media_type === type)
    : false;

  const switchSource = (i: number) => {
    if (i === sourceIdx) {
      // re-selecting the active server = manual retry
      setFrameState("loading");
      setReloadNonce((n) => n + 1);
      return;
    }
    setSourceIdx(i);
  };

  const retryServer = () => {
    setFrameState("loading");
    setReloadNonce((n) => n + 1);
  };

  const tryNextServer = () => switchSource((sourceIdx + 1) % PLAYER_SOURCES.length);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${title}`}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-red-600"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white md:text-base">
              {title}
              {type === "tv" && (
                <span className="ml-2 font-normal text-zinc-400">
                  S{season}:{episode < 10 ? `0${episode}` : episode}
                </span>
              )}
            </h2>
            {type === "tv" && episodes.find((ep) => ep.episode_number === episode)?.name && (
              <p className="truncate text-xs text-zinc-500">
                {episodes.find((ep) => ep.episode_number === episode)?.name}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              toggleWatchlist(
                item,
                type === "tv" ? season : undefined,
                type === "tv" ? episode : undefined
              )
            }
            className={`hidden h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold sm:flex ${
              inList
                ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/50"
                : "bg-white/10 text-zinc-200 hover:bg-white/20"
            }`}
          >
            {inList ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {inList ? "Saved" : "Save"}
          </button>
          {type === "tv" && (
            <button
              type="button"
              onClick={() => setShowEpisodes((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/20 lg:hidden"
            >
              <List className="h-4 w-4" /> Episodes
            </button>
          )}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open stream in a new tab"
            title="Open this server in a new tab (works even when embedding is blocked)"
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pop out</span>
          </a>
          <button
            type="button"
            onClick={() => switchSource((sourceIdx + 1) % PLAYER_SOURCES.length)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
            aria-label="Switch streaming source"
          >
            <Server className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{source.name}</span>
            <span className="sm:hidden">Src {sourceIdx + 1}</span>
          </button>
        </div>
      </div>

      {/* Server strip with live health dots */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
          Server
        </span>
        {PLAYER_SOURCES.map((s, i) => {
          const h: Health = healthFor === item.id ? (healthMap[s.id] ?? "checking") : "checking";
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => switchSource(i)}
              title={`${s.name} — ${HEALTH_TIP[h]}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                i === sourceIdx
                  ? "bg-red-600 text-white"
                  : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[h]}`} aria-hidden />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Main area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Video */}
          <div className="relative w-full bg-black lg:flex-1">
            <div className="relative mx-auto aspect-video max-h-[calc(100vh-160px)] w-full max-w-[calc((100vh-160px)*16/9)]">
              <iframe
                key={`${src}-${reloadNonce}`}
                src={src}
                title={`${title} player`}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="origin"
                onLoad={() => setFrameState((s) => (s === "loading" ? "ready" : s))}
                className="h-full w-full border-0"
              />

              {/* Connecting overlay */}
              {frameState === "loading" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                  <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                  <p className="text-sm text-zinc-400">
                    Connecting to{" "}
                    <span className="font-semibold text-zinc-200">{source.name}</span>…
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={tryNextServer}
                      className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      Next server
                    </button>
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      <ExternalLink className="h-3 w-3" /> Open in new tab
                    </a>
                  </div>
                </div>
              )}

              {/* Timeout fallback overlay */}
              {frameState === "timeout" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-400" />
                  <div>
                    <p className="text-base font-bold text-white">
                      &ldquo;{source.name}&rdquo; didn&rsquo;t respond
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-400">
                      This server may be down, blocked by your ad-blocker, or unavailable in
                      your region. Try another server — green dots are healthy — or open the
                      stream in a new tab.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={retryServer}
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry
                    </button>
                    <button
                      type="button"
                      onClick={tryNextServer}
                      className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500"
                    >
                      Next server <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> New tab
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls under player */}
          <div className="flex items-center justify-center gap-3 border-t border-white/5 px-4 py-3">
            {type === "tv" ? (
              <>
                <button
                  type="button"
                  onClick={prevEpisode}
                  disabled={season === 1 && episode === 1}
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20 disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev Ep
                </button>
                <span className="text-xs text-zinc-500">
                  Season {season} · Episode {episode}
                </span>
                <button
                  type="button"
                  onClick={nextEpisode}
                  disabled={
                    episode === maxEpisode &&
                    !seasonsList.some((s) => s.season_number === season + 1)
                  }
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20 disabled:opacity-30"
                >
                  Next Ep <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <p className="flex items-center gap-2 text-center text-xs text-zinc-600">
                <Info className="h-3.5 w-3.5 shrink-0" />
                If the video doesn&apos;t load, switch server above (green dot = healthy) or
                use Pop out. Ad-blockers can block some servers.
              </p>
            )}
          </div>
        </div>

        {/* Episode sidebar (TV) */}
        {type === "tv" && (
          <aside
            className={`${
              showEpisodes ? "flex" : "hidden"
            } max-h-full w-full shrink-0 flex-col border-t border-white/10 bg-[#0d0d14] lg:flex lg:w-[340px] lg:border-l lg:border-t-0`}
          >
            <div className="border-b border-white/5 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Episodes</h3>
                <button
                  type="button"
                  onClick={() => setShowEpisodes(false)}
                  className="text-zinc-500 hover:text-white lg:hidden"
                  aria-label="Hide episode list"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <select
                value={season}
                onChange={(e) => {
                  setSeason(Number(e.target.value));
                  setEpLoading(true);
                }}
                aria-label="Select season"
                className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 focus:border-red-600 focus:outline-none"
              >
                {seasonsList.length > 0
                  ? seasonsList.map((s) => (
                      <option key={s.id} value={s.season_number} className="bg-[#12121a]">
                        {s.name} ({s.episode_count} eps)
                      </option>
                    ))
                  : [...Array(20)].map((_, i) => (
                      <option key={i + 1} value={i + 1} className="bg-[#12121a]">
                        Season {i + 1}
                      </option>
                    ))}
              </select>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {epLoading && (
                <div className="space-y-2 p-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-zinc-800/60" />
                  ))}
                </div>
              )}
              {!epLoading &&
                episodes.map((ep) => {
                  const active = ep.episode_number === episode;
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => goEpisode(season, ep.episode_number)}
                      className={`mb-1.5 flex w-full items-start gap-3 rounded-lg p-2 text-left transition ${
                        active
                          ? "bg-red-600/20 ring-1 ring-red-600/60"
                          : "hover:bg-white/5 ring-1 ring-transparent"
                      }`}
                    >
                      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                        {img(ep.still_path, "w300") ? (
                          <img
                            src={img(ep.still_path, "w300") as string}
                            alt={ep.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                            E{ep.episode_number}
                          </div>
                        )}
                        {active && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-red-400">
                            <ChevronRight className="h-5 w-5" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xs font-semibold ${
                            active ? "text-red-400" : "text-zinc-200"
                          }`}
                        >
                          {ep.episode_number}. {ep.name}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                          {ep.overview || "No description available."}
                        </p>
                      </div>
                    </button>
                  );
                })}
              {!epLoading && !episodes.length && (
                <p className="p-4 text-center text-xs text-zinc-600">
                  No episode data for this season.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
