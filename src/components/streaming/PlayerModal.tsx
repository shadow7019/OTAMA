"use client";

import { useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  MediaDetails,
  MediaItem,
  Episode,
  getTitle,
  getMediaType,
  getYear,
  img,
  tmdb,
  PLAYER_SOURCES,
  AUTO_SOURCE_ID,
  ARCHIVE_SOURCE_ID,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";

interface PlayerModalProps {
  target: { item: MediaItem; season?: number; episode?: number } | null;
  actions: MediaActions;
  onClose: () => void;
}

type HealthState = "checking" | "up" | "popup" | "down";
interface Health {
  state: HealthState;
  ms?: number;
}
type FrameState = "loading" | "ready" | "timeout";

interface ArchiveMatchClient {
  identifier: string;
  title: string;
  year: number | null;
  creator: string;
  description: string;
  license: string;
  fileUrl: string;
  fileSize: number;
}

/** How long to wait for the embed iframe before auto-failing-over. */
const LOAD_TIMEOUT_MS = 12000;

const HEALTH_DOT: Record<HealthState, string> = {
  checking: "bg-zinc-600 animate-pulse",
  up: "bg-emerald-400",
  popup: "bg-amber-400",
  down: "bg-red-500",
};

const HEALTH_TIP: Record<HealthState, string> = {
  checking: "Checking server…",
  up: "Server is up",
  popup: "Server is up but may block embedding — use Pop out",
  down: "Server not responding right now",
};

export function PlayerModal({ target, actions, onClose }: PlayerModalProps) {
  // remounted per target via key — initial state is safe to derive from props
  const type = target ? getMediaType(target.item) : "movie";
  const itemId = target?.item.id ?? null;

  // Auto mode is the default every session: the player health-checks all servers
  // and picks the fastest healthy one (ad-free direct stream first when available).
  // The persisted manual choice is honoured as auto's preferred-first hint, not as
  // a forced pick — so a dead saved server can never break playback again.
  const [selectedId, setSelectedId] = useState<string>(AUTO_SOURCE_ID);
  const [autoPreferred, setAutoPreferred] = useState<string | null>(() => {
    const saved = useMediaStore.getState().sourceId;
    return PLAYER_SOURCES.some((s) => s.id === saved) ? saved : null;
  });
  const [healthMap, setHealthMap] = useState<Record<string, Health>>({});
  const [archive, setArchive] = useState<ArchiveMatchClient | null>(null);
  const [archiveState, setArchiveState] = useState<"loading" | "found" | "none">("loading");
  const [videoError, setVideoError] = useState(false);
  const [autoPickId, setAutoPickId] = useState<string | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [season, setSeason] = useState(() => target?.season ?? 1);
  const [episode, setEpisode] = useState(() => target?.episode ?? 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [epLoading, setEpLoading] = useState(() => type === "tv");
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [frameState, setFrameState] = useState<FrameState>("loading");
  const [reloadNonce, setReloadNonce] = useState(0);
  const mounted = useMounted();
  const addContinue = useMediaStore((s) => s.addContinue);
  const toggleWatchlist = useMediaStore((s) => s.toggleWatchlist);
  const setSourceId = useMediaStore((s) => s.setSourceId);
  const watchlist = useMediaStore((s) => s.watchlist);

  const nameOf = (id: string) =>
    id === ARCHIVE_SOURCE_ID
      ? "CineX Direct"
      : PLAYER_SOURCES.find((s) => s.id === id)?.name ?? "Server";

  // Healthy embed servers, fastest first (frameable ones outrank popup-ish ones;
  // the user's preferred server goes first while it stays healthy)
  const rankedHealthy = useMemo(() => {
    const score = (s: Health) => (s.state === "up" ? 0 : s.state === "popup" ? 1 : 2);
    const list = PLAYER_SOURCES.filter((s) => {
      const h = healthMap[s.id];
      return h && (h.state === "up" || h.state === "popup");
    }).sort(
      (a, b) =>
        score(healthMap[a.id]) - score(healthMap[b.id]) ||
        (healthMap[a.id].ms ?? 9e9) - (healthMap[b.id].ms ?? 9e9)
    );
    if (!autoPreferred) return list;
    const prefIdx = list.findIndex((s) => s.id === autoPreferred);
    if (prefIdx < 0) return list;
    const pref = list.splice(prefIdx, 1)[0];
    return [pref, ...list];
  }, [healthMap, autoPreferred]);

  // Which source is actually on screen right now
  const effectiveId = (() => {
    if (selectedId === AUTO_SOURCE_ID) {
      if (type === "movie" && archiveState === "found" && archive && !videoError)
        return ARCHIVE_SOURCE_ID;
      if (autoPickId) return autoPickId;
      return rankedHealthy[0]?.id ?? PLAYER_SOURCES[0].id;
    }
    if (selectedId === ARCHIVE_SOURCE_ID && archiveState === "found" && !videoError)
      return ARCHIVE_SOURCE_ID;
    return PLAYER_SOURCES.some((s) => s.id === selectedId) ? selectedId : PLAYER_SOURCES[0].id;
  })();

  // identity of the current embed; resetting to "loading" is done at render time
  const srcKey = `${itemId ?? "none"}-${effectiveId}-${season}-${episode}-${reloadNonce}`;
  const [prevSrcKey, setPrevSrcKey] = useState(srcKey);
  if (prevSrcKey !== srcKey) {
    setPrevSrcKey(srcKey);
    setFrameState("loading");
    setVideoError(false);
  }

  // failover: move to the next healthy server we haven't tried yet
  const failover = (fromId: string, reason: string) => {
    const next =
      rankedHealthy.map((s) => s.id).find((id) => id !== fromId && !tried.includes(id)) ??
      null;
    if (next) {
      setTried((t) => [...t, fromId]);
      setAutoPickId(next);
      setSelectedId(AUTO_SOURCE_ID);
      if (autoPreferred && autoPreferred !== next) setAutoPreferred(null); // it just proved unreliable
      setBanner(reason.replace("{next}", nameOf(next)));
    }
    return next;
  };

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

  // probe every server once per title so the strip shows live status dots + latency
  useEffect(() => {
    if (itemId === null) return;
    let cancelled = false;
    PLAYER_SOURCES.forEach((s) => {
      const probe = type === "movie" ? s.movie(itemId) : s.tv(itemId, 1, 1);
      fetch(`/api/embed-check?url=${encodeURIComponent(probe)}`)
        .then((r) => r.json())
        .then((j: { ok?: boolean; ms?: number; frameable?: boolean }) => {
          if (cancelled) return;
          const h: Health = !j.ok
            ? { state: "down", ms: j.ms }
            : j.frameable === false
              ? { state: "popup", ms: j.ms }
              : { state: "up", ms: j.ms };
          setHealthMap((prev) => ({ ...prev, [s.id]: h }));
        })
        .catch(() => {
          if (!cancelled) setHealthMap((prev) => ({ ...prev, [s.id]: { state: "down" } }));
        });
    });

    // CineX Direct: look for a public-domain copy (movies only)
    if (type === "movie" && target) {
      const q = getTitle(target.item);
      const y = getYear(target.item);
      fetch(`/api/archive?title=${encodeURIComponent(q)}&year=${encodeURIComponent(y)}`)
        .then((r) => r.json())
        .then((j: { match: ArchiveMatchClient | null }) => {
          if (cancelled) return;
          setArchive(j.match);
          setArchiveState(j.match ? "found" : "none");
        })
        .catch(() => {
          if (!cancelled) setArchiveState("none");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [itemId, type]);

  // watchdog: if the current embed never loads, fail over automatically
  // (the native direct player has its own error/stall handling — skip it there)
  useEffect(() => {
    if (!target || effectiveId === ARCHIVE_SOURCE_ID) return;
    const t = setTimeout(() => {
      setFrameState((s) => {
        if (s !== "loading") return s;
        // auto mode: hop to the next healthy server
        if (selectedId === AUTO_SOURCE_ID) {
          failover(effectiveId, `{name} didn't respond — switched to {next}`);
        } else if (
          rankedHealthy.length &&
          healthMap[selectedId]?.state !== "up" &&
          healthMap[selectedId]?.state !== "checking"
        ) {
          // manual mode on a dead server: switch to auto once per title
          setTried((tt) => [...tt, effectiveId]);
          setAutoPickId(rankedHealthy[0].id);
          setSelectedId(AUTO_SOURCE_ID);
          setBanner(`${nameOf(selectedId)} didn't respond — switched to ${nameOf(rankedHealthy[0].id)}`);
        }
        return s;
      });
    }, LOAD_TIMEOUT_MS);
  }, [srcKey, frameState]);

  // transient banner auto-dismiss
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(t);
  }, [banner]);

  // persist the preferred server for future sessions (external store write);
  // "auto" when the user hasn't expressed a preference
  useEffect(() => {
    setSourceId(autoPreferred ?? AUTO_SOURCE_ID);
  }, [autoPreferred, setSourceId]);

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
  const isDirect = effectiveId === ARCHIVE_SOURCE_ID;
  const currentServer = PLAYER_SOURCES.find((s) => s.id === effectiveId);
  const src = currentServer
    ? type === "movie"
      ? currentServer.movie(item.id)
      : currentServer.tv(item.id, season, episode)
    : "";

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

  const switchSource = (id: string) => {
    if (id === effectiveId) {
      // re-selecting the active source = manual retry
      setFrameState("loading");
      setReloadNonce((n) => n + 1);
      if (id === ARCHIVE_SOURCE_ID) setVideoError(false);
      return;
    }
    setTried((t) => [...t, effectiveId]);
    if (id === ARCHIVE_SOURCE_ID) setVideoError(false);
    setSelectedId(id);
    if (PLAYER_SOURCES.some((s) => s.id === id)) {
      setAutoPreferred(id); // remember the user's preference
      setAutoPickId(id);
    } else if (id === AUTO_SOURCE_ID) {
      setAutoPickId(null); // recompute from live health ranking
    }
  };

  const retryServer = () => {
    setFrameState("loading");
    setReloadNonce((n) => n + 1);
    if (isDirect) setVideoError(false);
  };

  const tryNextServer = () => {
    if (selectedId === AUTO_SOURCE_ID || isDirect) {
      if (!failover(effectiveId, `{name} failed — switching to {next}`)) {
        // nothing left to try — cycle manually through the registry
        const i = PLAYER_SOURCES.findIndex((s) => s.id === effectiveId);
        switchSource(PLAYER_SOURCES[(i + 1) % PLAYER_SOURCES.length].id);
      }
    } else {
      const i = PLAYER_SOURCES.findIndex((s) => s.id === selectedId);
      switchSource(PLAYER_SOURCES[(i + 1) % PLAYER_SOURCES.length].id);
    }
  };

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
            href={isDirect && archive ? archive.fileUrl : src}
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
            onClick={tryNextServer}
            className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
            aria-label="Switch streaming source"
          >
            <Server className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isDirect ? "CineX Direct" : selectedId === AUTO_SOURCE_ID ? "Auto" : nameOf(selectedId)}
            </span>
            <span className="sm:hidden">Src</span>
          </button>
        </div>
      </div>

      {/* Server strip with live health dots + latency */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
          Server
        </span>

        {/* Auto (best) */}
        <button
          type="button"
          onClick={() => switchSource(AUTO_SOURCE_ID)}
          title="Automatically picks the fastest healthy server and fails over when one dies"
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            selectedId === AUTO_SOURCE_ID
              ? "bg-red-600 text-white"
              : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
          }`}
        >
          <Zap className="h-3 w-3" />
          Auto{autoPickId ? ` · ${nameOf(autoPickId)}` : ""}
        </button>

        {/* CineX Direct — ad-free public-domain player (movies) */}
        {type === "movie" && (
          <button
            type="button"
            onClick={() => archiveState === "found" && switchSource(ARCHIVE_SOURCE_ID)}
            disabled={archiveState !== "found"}
            title={
              archiveState === "found"
                ? "Built-in player, direct public-domain stream — 100% ad-free"
                : archiveState === "loading"
                  ? "Checking archive.org for a public-domain copy…"
                  : "No public-domain copy found for this title"
            }
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              isDirect
                ? "bg-emerald-600 text-white"
                : archiveState === "found"
                  ? "bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-600/40 hover:bg-emerald-600/25"
                  : "bg-white/5 text-zinc-600"
            } ${archiveState !== "found" ? "cursor-not-allowed" : ""}`}
          >
            <ShieldCheck className="h-3 w-3" />
            Ad-Free
            {archiveState === "loading" && <span className="animate-pulse">…</span>}
          </button>
        )}

        {PLAYER_SOURCES.map((s) => {
          const h: Health = healthMap[s.id] ?? { state: "checking" as HealthState };
          const active = !isDirect && s.id === effectiveId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => switchSource(s.id)}
              title={`${s.name} — ${HEALTH_TIP[h.state]}${h.ms ? ` (${h.ms}ms)` : ""}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-red-600 text-white"
                  : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[h.state]}`} aria-hidden />
              {s.name}
              {h.state === "up" && h.ms ? (
                <span className="hidden text-[9px] font-normal text-zinc-500 md:inline">
                  {h.ms}ms
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* failover banner */}
      {banner && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 md:mx-5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {banner}
        </div>
      )}

      {/* Main area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Video */}
          <div className="relative w-full bg-black lg:flex-1">
            <div className="relative mx-auto aspect-video max-h-[calc(100vh-160px)] w-full max-w-[calc((100vh-160px)*16/9)]">
              {isDirect && archive ? (
                /* CineX Direct — native HTML5 video, no third-party embed, no ads */
                <>
                  <video
                    key={`${archive.identifier}-${reloadNonce}`}
                    src={archive.fileUrl}
                    poster={img(item.backdrop_path, "w1280") ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    onCanPlay={() => setFrameState((s) => (s === "loading" ? "ready" : s))}
                    onPlaying={() => setFrameState("ready")}
                    onError={() => {
                      setVideoError(true);
                      failover(ARCHIVE_SOURCE_ID, "Direct stream failed — switched to {next}");
                    }}
                    className="h-full w-full bg-black"
                  />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <ShieldCheck className="h-3 w-3" /> Ad-free · Public domain
                  </div>
                  <p className="absolute inset-x-3 bottom-2 truncate text-[10px] text-zinc-500">
                    {archive.title}
                    {archive.year ? ` (${archive.year})` : ""} · archive.org · {archive.license}
                  </p>
                </>
              ) : (
                <iframe
                  key={`${src}-${reloadNonce}`}
                  src={src}
                  title={`${title} player`}
                  /* sandbox deliberately omits allow-popups & allow-top-navigation:
                     blocks popup ads and tab-hijacking redirects used by embed networks */
                  sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => setFrameState((s) => (s === "loading" ? "ready" : s))}
                  className="h-full w-full border-0"
                />
              )}

              {/* Connecting overlay */}
              {frameState === "loading" && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                  <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                  <p className="text-sm text-zinc-400">
                    {selectedId === AUTO_SOURCE_ID && !isDirect ? (
                      <>
                        <span className="font-semibold text-zinc-200">Auto</span>{" "}
                        connecting to{" "}
                        <span className="font-semibold text-zinc-200">{nameOf(effectiveId)}</span>…
                      </>
                    ) : (
                      <>
                        Connecting to{" "}
                        <span className="font-semibold text-zinc-200">{nameOf(effectiveId)}</span>…
                      </>
                    )}
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
                      href={isDirect && archive ? archive.fileUrl : src}
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
                      &ldquo;{nameOf(effectiveId)}&rdquo; didn&rsquo;t respond
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-400">
                      No healthy fallback left on this connection. Retry, pick any server
                      below, or open the stream in a new tab.
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
                      href={isDirect && archive ? archive.fileUrl : src}
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
                <span>
                  <span className="font-semibold text-zinc-400">Auto</span> picks the fastest
                  healthy server and skips dead ones.{" "}
                  {archiveState === "found"
                    ? "Ad-Free plays a direct public-domain copy."
                    : "Servers with a green dot are verified working."}
                </span>
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
