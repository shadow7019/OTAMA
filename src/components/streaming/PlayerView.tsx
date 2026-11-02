"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ListVideo,
  Gauge,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RotateCcw,
  BookmarkPlus,
  Check,
  Youtube,
  ExternalLink,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { type MediaItem } from "@/lib/tmdb-constants";
import { cn } from "@/lib/utils";

// ---------------- YouTube IFrame API (minimal typings) ----------------

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  getVolume(): number;
  setPlaybackRate(r: number): void;
  loadVideoById(opts: { videoId: string }): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYT(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YT API failed"));
    };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => reject(new Error("YT script blocked"));
      document.head.appendChild(s);
    }
    setTimeout(() => {
      if (!window.YT?.Player) reject(new Error("YT API timeout"));
    }, 10000);
  });
  return ytApiPromise;
}

// ---------------- Resolve response ----------------

type ResolveResponse = {
  kind: "file" | "youtube" | "none";
  url?: string;
  ytKey?: string;
  ytName?: string;
  sourceLabel: string;
  full: boolean;
  item: MediaItem | null;
  tagline?: string;
  runtime?: number;
  seasons?: { number: number; name: string; episodeCount: number }[];
  seasonNumber?: number;
  episodes?: {
    number: number;
    name: string;
    still: string;
    runtime?: number;
    airDate?: string;
    overview?: string;
  }[];
};

type MenuEpisode = {
  number: number;
  name: string;
  still: string;
  runtime?: number;
  airDate?: string;
  overview?: string;
};

type Props = {
  type: "movie" | "tv";
  id: string;
  season?: number;
  episode?: number;
};

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerView({ type, id, season, episode }: Props) {
  const navigate = useStore((s) => s.navigate);
  const saveProgress = useStore((s) => s.saveProgress);
  const clearProgress = useStore((s) => s.clearProgress);
  const toggleWatchlist = useStore((s) => s.toggleWatchlist);
  const progressMap = useStore((s) => s.progress);
  const toast = useStore((s) => s.toast);

  const [source, setSource] = useState<(ResolveResponse & { key: string }) | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // shared player state
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [epsOpen, setEpsOpen] = useState(false);

  // episode menu state
  const [menuSeason, setMenuSeason] = useState<number | null>(null);
  const [menuEps, setMenuEps] = useState<MenuEpisode[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);
  const resumedRef = useRef(false);

  const storeId = `${type}-${id}`;
  const isTv = type === "tv";
  const curSeason = season ?? source?.seasonNumber ?? 1;
  const curEpisode = episode ?? (isTv ? 1 : undefined);

  const inList = useStore((s) => s.watchlist.some((w) => w.id === storeId));
  const saved = progressMap[storeId];
  const resumeSeconds =
    saved &&
    saved.seconds > 5 &&
    (duration > 0 ? saved.seconds < duration * 0.95 : true) &&
    (!isTv || (saved.season === curSeason && saved.episode === curEpisode))
      ? saved.seconds
      : 0;

  // -------- resolve source --------
  const srcKey = `${type}-${id}-${season ?? ""}-${episode ?? ""}-${retryKey}`;
  const loading = !source || source.key !== srcKey;
  const failed = failedKey === srcKey;

  useEffect(() => {
    let cancelled = false;
    resumedRef.current = false;

    const qs = new URLSearchParams({ type, id });
    if (type === "tv") {
      qs.set("season", String(season ?? 1));
      qs.set("episode", String(episode ?? 1));
    }
    fetch(`/api/watch/resolve?${qs.toString()}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d: ResolveResponse) => {
        if (!cancelled) {
          setSource({ ...d, key: srcKey });
          setTime(0);
          setDuration(0);
          setBuffered(0);
          setError(false);
          setWaiting(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedKey(srcKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [type, id, season, episode, retryKey, srcKey]);

  // -------- controls visibility --------
  const poke = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3200);
  }, []);

  // -------- progress persistence --------
  const getTime = useCallback((): { t: number; d: number } | null => {
    if (source?.kind === "file") {
      const v = videoRef.current;
      if (v && v.duration > 0) return { t: v.currentTime, d: v.duration };
    } else if (source?.kind === "youtube" && ytRef.current) {
      try {
        const p = ytRef.current;
        const d = p.getDuration();
        if (d > 0) return { t: p.getCurrentTime(), d };
      } catch {
        // player not ready
      }
    }
    return null;
  }, [source?.kind]);

  const persist = useCallback(
    (force = false) => {
      const item = source?.item;
      if (!item) return;
      const got = getTime();
      if (!got) return;
      const now = Date.now();
      if (!force && now - lastSaved.current < 5000) return;
      lastSaved.current = now;
      saveProgress({
        id: `${item.type}-${item.id}`,
        type: item.type,
        tmdbId: item.id,
        name: item.name,
        year: item.year,
        rating: item.rating,
        poster: item.poster,
        backdrop: item.backdrop,
        full: item.full,
        season: isTv ? curSeason : undefined,
        episode: isTv ? curEpisode : undefined,
        episodeName: isTv
          ? source?.episodes?.find((e) => e.number === curEpisode)?.name
          : undefined,
        seconds: got.t,
        duration: got.d,
        updatedAt: now,
      });
    },
    [source, getTime, saveProgress, isTv, curSeason, curEpisode]
  );

  useEffect(() => {
    const onUnload = () => persist(true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
  }, [persist]);

  // -------- episode helpers --------
  const seasons = source?.seasons || [];

  const nextEpisode = useMemo((): { season: number; episode: number } | null => {
    if (!isTv || !source) return null;
    const inSeason = source.episodes?.some((e) => e.number === (curEpisode ?? 1) + 1);
    if (inSeason) return { season: curSeason, episode: (curEpisode ?? 1) + 1 };
    const idx = seasons.findIndex((s) => s.number === curSeason);
    if (idx >= 0 && idx < seasons.length - 1) {
      return { season: seasons[idx + 1].number, episode: 1 };
    }
    return null;
  }, [isTv, source, curSeason, curEpisode, seasons]);

  const prevEpisode = useMemo((): { season: number; episode: number } | null => {
    if (!isTv || !source) return null;
    if ((curEpisode ?? 1) > 1) return { season: curSeason, episode: (curEpisode ?? 1) - 1 };
    const idx = seasons.findIndex((s) => s.number === curSeason);
    if (idx > 0) {
      const prevS = seasons[idx - 1];
      return { season: prevS.number, episode: prevS.episodeCount };
    }
    return null;
  }, [isTv, source, curSeason, curEpisode, seasons]);

  const goEpisode = useCallback(
    (s: number, e: number) => {
      setEpsOpen(false);
      navigate({ name: "watch", type, id, season: s, episode: e });
    },
    [navigate, type, id]
  );

  // -------- end of playback --------
  const onEnded = useCallback(() => {
    persist(true);
    clearProgress(storeId);
    if (nextEpisode) {
      toast("Up next", `Season ${nextEpisode.season} · Episode ${nextEpisode.episode}`);
      goEpisode(nextEpisode.season, nextEpisode.episode);
      return;
    }
    toast("Thanks for watching", "This title has ended.");
  }, [persist, clearProgress, storeId, nextEpisode, toast, goEpisode]);

  // -------- shared transport --------
  const togglePlay = useCallback(() => {
    if (source?.kind === "file") {
      const v = videoRef.current;
      if (v) void (v.paused ? v.play() : v.pause());
    } else if (source?.kind === "youtube") {
      const p = ytRef.current;
      if (!p) return;
      try {
        if (p.getPlayerState() === 1) p.pauseVideo();
        else p.playVideo();
      } catch {
        // not ready
      }
    }
  }, [source?.kind]);

  const seekBy = useCallback(
    (delta: number) => {
      if (source?.kind === "file") {
        const v = videoRef.current;
        if (v) v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || Infinity);
      } else if (source?.kind === "youtube") {
        const p = ytRef.current;
        if (!p) return;
        try {
          p.seekTo(Math.min(Math.max(0, p.getCurrentTime() + delta), p.getDuration() || Infinity), true);
        } catch {
          // not ready
        }
      }
      poke();
    },
    [source?.kind, poke]
  );

  const seekTo = useCallback(
    (val: number) => {
      if (source?.kind === "file") {
        const v = videoRef.current;
        if (v) v.currentTime = val;
      } else if (source?.kind === "youtube") {
        try {
          ytRef.current?.seekTo(val, true);
        } catch {
          // not ready
        }
      }
      setTime(val);
    },
    [source?.kind]
  );

  const changeVolume = useCallback(
    (val: number) => {
      setVolume(val);
      if (source?.kind === "file") {
        const v = videoRef.current;
        if (v) {
          v.volume = val;
          v.muted = val === 0;
          setMuted(val === 0);
        }
      } else if (source?.kind === "youtube") {
        try {
          ytRef.current?.setVolume(Math.round(val * 100));
          if (val === 0) ytRef.current?.mute();
          else ytRef.current?.unMute();
          setMuted(val === 0);
        } catch {
          // not ready
        }
      }
    },
    [source?.kind]
  );

  const toggleMute = useCallback(() => {
    if (source?.kind === "file") {
      const v = videoRef.current;
      if (v) {
        v.muted = !v.muted;
        setMuted(v.muted);
      }
    } else if (source?.kind === "youtube") {
      try {
        const p = ytRef.current;
        if (!p) return;
        if (p.isMuted()) {
          p.unMute();
          setMuted(false);
        } else {
          p.mute();
          setMuted(true);
        }
      } catch {
        // not ready
      }
    }
  }, [source?.kind]);

  const changeRate = useCallback(
    (r: number) => {
      setRate(r);
      if (source?.kind === "file") {
        if (videoRef.current) videoRef.current.playbackRate = r;
      } else if (source?.kind === "youtube") {
        try {
          ytRef.current?.setPlaybackRate(r);
        } catch {
          // not ready
        }
      }
    },
    [source?.kind]
  );

  // -------- fullscreen --------
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // -------- keyboard --------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowright":
          e.preventDefault();
          seekBy(10);
          break;
        case "arrowleft":
          e.preventDefault();
          seekBy(-10);
          break;
        case "arrowup":
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case "arrowdown":
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "escape":
          if (!document.fullscreenElement) navigate({ name: "detail", type, id });
          break;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, changeVolume, volume, toggleMute, toggleFullscreen, navigate, type, id, poke]);

  // -------- YouTube lifecycle --------
  const ytStateHandler = useRef<(s: number) => void>(() => undefined);
  const ytErrorHandler = useRef<() => void>(() => undefined);

  useEffect(() => {
    ytStateHandler.current = (s: number) => {
      // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      if (s === 1) {
        setPlaying(true);
        setWaiting(false);
        if (!resumedRef.current && resumeSeconds > 5) {
          resumedRef.current = true;
          try {
            ytRef.current?.seekTo(resumeSeconds, true);
          } catch {
            // ignore
          }
          const mins = Math.floor(resumeSeconds / 60);
          toast(
            "Resumed",
            `Picked up around ${mins}:${String(Math.floor(resumeSeconds % 60)).padStart(2, "0")}`
          );
        }
      } else if (s === 2) {
        setPlaying(false);
        setWaiting(false);
        persist(true);
      } else if (s === 3) {
        setWaiting(true);
      } else if (s === 0) {
        setPlaying(false);
        onEnded();
      }
    };

    ytErrorHandler.current = () => {
      setError(true);
      setWaiting(false);
    };
  });

  useEffect(() => {
    if (source?.kind !== "youtube" || !source.ytKey) return;
    let destroyed = false;

    loadYT()
      .then((YT) => {
        if (destroyed || !ytHostRef.current) return;
        ytHostRef.current.innerHTML = "";
        const mount = document.createElement("div");
        ytHostRef.current.appendChild(mount);

        ytRef.current = new YT.Player(mount, {
          videoId: source.ytKey as string,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            autoplay: 1,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              try {
                const iframe = ytRef.current?.getIframe();
                if (iframe) {
                  iframe.style.width = "100%";
                  iframe.style.height = "100%";
                  iframe.style.position = "absolute";
                  iframe.style.inset = "0";
                }
                const d = ytRef.current?.getDuration() || 0;
                setDuration(d);
                setWaiting(false);
              } catch {
                // ignore
              }
            },
            onStateChange: (e) => ytStateHandler.current(e.data),
            onError: () => ytErrorHandler.current(),
          },
        });
      })
      .catch(() => {
        if (!destroyed) {
          setError(true);
          setWaiting(false);
        }
      });

    return () => {
      destroyed = true;
      try {
        ytRef.current?.destroy();
      } catch {
        // ignore
      }
      ytRef.current = null;
    };
  }, [source?.kind, source?.ytKey]);

  // YT time poll
  useEffect(() => {
    if (source?.kind !== "youtube") return;
    const iv = setInterval(() => {
      try {
        const p = ytRef.current;
        if (!p) return;
        const d = p.getDuration();
        if (d > 0) {
          setTime(p.getCurrentTime());
          setDuration(d);
          persist();
        }
      } catch {
        // not ready
      }
    }, 500);
    return () => clearInterval(iv);
  }, [source?.kind, persist]);

  // -------- episode menu data --------
  useEffect(() => {
    if (!epsOpen || !isTv || !source) return;
    const target = menuSeason ?? curSeason;
    if (target === source.seasonNumber && source.episodes) {
      const t = setTimeout(
        () => setMenuEps((source.episodes as MenuEpisode[]) || []),
        0
      );
      return () => clearTimeout(t);
    }
    let cancelled = false;
    fetch(`/api/tmdb/tv/${id}/season/${target}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(
        (d: {
          episodes?: (Partial<MenuEpisode> & { episode_number?: number })[];
        }) =>
          !cancelled &&
          setMenuEps(
            (d.episodes || []).map((e) => ({
              number: e.number ?? e.episode_number ?? 0,
              name: e.name || `Episode ${e.number ?? e.episode_number ?? ""}`,
              still: e.still || "",
              runtime: e.runtime,
              airDate: e.airDate,
              overview: e.overview,
            }))
          )
      )
      .catch(() => !cancelled && setMenuEps([]));
    return () => {
      cancelled = true;
    };
  }, [epsOpen, isTv, source, menuSeason, curSeason, id]);

  // -------- MediaSession --------
  useEffect(() => {
    if (!source?.item || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: source.item.name,
        artist: source.item.year ? String(source.item.year) : undefined,
        album: source.full ? "Full movie" : "Preview",
        artwork: source.item.poster ? [{ src: source.item.poster, sizes: "342x513" }] : [],
      });
    } catch {
      // ignore
    }
  }, [source]);

  // -------- render guards --------
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-white/70">Finding the best source to play…</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-center">
        <AlertTriangle className="h-10 w-10 text-primary" />
        <p className="text-lg font-semibold text-white">Could not resolve a source</p>
        <p className="max-w-md text-sm text-white/60">
          The catalog service didn&apos;t respond. Check your connection and try again.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
          <button
            onClick={() => navigate({ name: "home" })}
            className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!source || source.kind === "none" || (source.kind === "youtube" && !source.ytKey)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-center">
        <Youtube className="h-10 w-10 text-primary" />
        <p className="text-lg font-semibold text-white">No stream available yet</p>
        <p className="max-w-md text-sm text-white/60">
          This title has no trailer or public-domain source right now. Try again later or watch
          a related title.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate({ name: "detail", type, id })}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white"
          >
            Back to Details
          </button>
          <button
            onClick={() => navigate({ name: "home" })}
            className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-white"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const item = source.item;
  const epMeta = isTv ? source.episodes?.find((e) => e.number === curEpisode) : undefined;
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const menuTarget = menuSeason ?? curSeason;

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onTouchStart={poke}
      className="relative flex min-h-screen flex-col bg-black"
    >
      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/90 to-transparent p-4 transition-opacity duration-300 md:p-5",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          onClick={() => navigate({ name: "detail", type, id })}
          aria-label="Back to details"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white md:text-lg">
            {item?.name || "Now playing"}
          </h1>
          {isTv && epMeta ? (
            <p className="truncate text-xs text-white/70 md:text-sm">
              S{curSeason} · E{curEpisode} — {epMeta.name}
            </p>
          ) : (
            <p className="truncate text-xs text-white/70 md:text-sm">
              {item?.year ?? ""} {item?.year ? "·" : ""} {source.sourceLabel}
            </p>
          )}
        </div>
        {item ? (
          <button
            onClick={() => toggleWatchlist(item)}
            aria-label={inList ? "In My List" : "Add to My List"}
            className={cn(
              "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium backdrop-blur transition",
              inList ? "bg-primary/90 text-white" : "bg-white/10 text-white hover:bg-white/20"
            )}
          >
            {inList ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
            <span className="hidden sm:inline">{inList ? "In My List" : "My List"}</span>
          </button>
        ) : null}
      </div>

      {/* Video area */}
      <div className="relative flex flex-1 items-center justify-center">
        {source.kind === "file" && source.url ? (
          <video
            ref={videoRef}
            src={source.url}
            className={cn("h-full w-full object-contain", fullscreen ? "" : "max-h-[82vh]")}
            playsInline
            autoPlay
            preload="auto"
            onClick={() => {
              togglePlay();
              poke();
            }}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (!v) return;
              setDuration(v.duration || 0);
              if (!resumedRef.current && resumeSeconds > 5) {
                resumedRef.current = true;
                v.currentTime = resumeSeconds;
                const mins = Math.floor(resumeSeconds / 60);
                toast(
                  "Resumed",
                  `Picked up around ${mins}:${String(Math.floor(resumeSeconds % 60)).padStart(2, "0")}`
                );
              }
            }}
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (!v) return;
              setTime(v.currentTime);
              if (v.buffered.length) {
                setBuffered(v.buffered.end(v.buffered.length - 1));
              }
              persist();
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onWaiting={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}
            onError={() => {
              setError(true);
              setWaiting(false);
            }}
            onEnded={onEnded}
          />
        ) : (
          // YouTube embed mount + click catcher
          <div className="relative h-full w-full">
            <div ref={ytHostRef} className="absolute inset-0" aria-label="Video player" />
            <button
              aria-label="Toggle playback"
              onClick={() => {
                togglePlay();
                poke();
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent"
            />
          </div>
        )}

        {/* Loading spinner */}
        {waiting && !error ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <Loader2 className="h-14 w-14 animate-spin text-primary" />
          </div>
        ) : null}

        {/* Center play (paused) */}
        {!playing && !waiting && !error ? (
          <button
            onClick={() => {
              togglePlay();
              poke();
            }}
            aria-label="Play"
            className="absolute z-20 flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 text-white shadow-2xl shadow-primary/40 transition hover:scale-105"
          >
            <Play className="h-9 w-9 fill-white" />
          </button>
        ) : null}

        {/* Error state */}
        {error ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-primary" />
            <div>
              <p className="text-lg font-bold text-white">Playback error</p>
              <p className="mt-1 max-w-md text-sm text-white/70">
                {source.kind === "youtube"
                  ? "This video can't be embedded (the uploader disabled it) or YouTube is unreachable."
                  : "The stream could not be loaded. The source server may be busy — try again."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {source.kind === "youtube" && source.ytKey ? (
                <a
                  href={`https://www.youtube.com/watch?v=${source.ytKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <ExternalLink className="h-4 w-4" /> Watch on YouTube
                </a>
              ) : (
                <button
                  onClick={() => {
                    setError(false);
                    setWaiting(true);
                    setRetryKey((k) => k + 1);
                  }}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <RotateCcw className="h-4 w-4" /> Retry
                </button>
              )}
              <button
                onClick={() => navigate({ name: "detail", type, id })}
                className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Back to details
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300 md:px-6",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        {/* Seek bar */}
        <div className="group/seek relative flex h-6 items-center">
          <div className="absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/20 transition-all group-hover/seek:h-2.5">
            <div className="absolute h-full bg-white/25" style={{ width: `${bufPct}%` }} aria-hidden />
            <div className="absolute h-full bg-primary" style={{ width: `${pct}%` }} aria-hidden />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={time}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Seek"
            className="absolute inset-x-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125"
          />
        </div>

        <div className="mt-1 flex items-center gap-2 md:gap-3">
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 hover:text-primary"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-white" />}
          </button>

          <button
            onClick={() => seekBy(-10)}
            aria-label="Back 10 seconds"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:flex"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => seekBy(10)}
            aria-label="Forward 10 seconds"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 sm:flex"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          {/* Volume */}
          <div className="group/vol flex items-center gap-1">
            <button
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/25 transition-all duration-300 group-hover/vol:w-16 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white sm:w-16 md:group-hover/vol:w-24"
            />
          </div>

          <span className="ml-1 select-none font-mono text-xs text-white/85 md:text-sm">
            {fmt(time)} <span className="text-white/40">/ {fmt(duration)}</span>
          </span>

          {/* Source badge */}
          <span
            className={cn(
              "ml-1 hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider lg:block",
              source.full ? "bg-emerald-600/30 text-emerald-300" : "bg-white/10 text-white/60"
            )}
          >
            {source.full ? "Full" : "Preview"}
          </span>

          <div className="flex-1" />

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => setRateOpen((o) => !o)}
              aria-label="Playback speed"
              aria-expanded={rateOpen}
              className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Gauge className="h-5 w-5" />
              <span className="hidden md:inline">{rate}×</span>
            </button>
            {rateOpen ? (
              <div className="absolute bottom-full right-0 mb-2 w-28 rounded-xl border border-white/10 bg-black/90 p-1.5 backdrop-blur-xl">
                {RATES.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      changeRate(r);
                      setRateOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition",
                      r === rate ? "bg-primary/20 text-primary" : "text-white/80 hover:bg-white/10"
                    )}
                  >
                    {r}× {r === rate ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Episodes */}
          {isTv && seasons.length ? (
            <div className="relative">
              <button
                onClick={() => setEpsOpen((o) => !o)}
                aria-label="Episodes"
                aria-expanded={epsOpen}
                className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <ListVideo className="h-5 w-5" />
                <span className="hidden md:inline">Episodes</span>
              </button>
              {epsOpen ? (
                <div className="absolute bottom-full right-0 mb-2 max-h-[60vh] w-80 overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl scrollbar-thin">
                  <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 p-2 no-scrollbar">
                    {seasons.map((s) => (
                      <button
                        key={s.number}
                        onClick={() => setMenuSeason(s.number)}
                        className={cn(
                          "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition",
                          s.number === menuTarget
                            ? "bg-primary text-white"
                            : "bg-white/10 text-white/70 hover:bg-white/20"
                        )}
                      >
                        {s.number === 0 ? "Specials" : `S${s.number}`}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[calc(60vh-44px)] overflow-y-auto p-1.5 scrollbar-thin">
                    {menuEps?.map((e) => {
                      const active = e.number === curEpisode && menuTarget === curSeason;
                      return (
                        <button
                          key={e.number}
                          onClick={() => goEpisode(menuTarget, e.number)}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition",
                            active ? "bg-primary/20" : "hover:bg-white/10"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                              active ? "bg-primary text-white" : "bg-white/10 text-white/70"
                            )}
                          >
                            E{e.number}
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate text-sm font-medium",
                                active ? "text-primary" : "text-white"
                              )}
                            >
                              {e.name}
                            </span>
                            <span className="block text-[11px] text-white/50">
                              {e.runtime ? `${e.runtime} min` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {!menuEps?.length ? (
                      <p className="px-3 py-4 text-xs text-white/50">No episodes found.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Prev episode */}
          {prevEpisode ? (
            <button
              onClick={() => goEpisode(prevEpisode.season, prevEpisode.episode)}
              aria-label="Previous episode"
              className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <SkipBack className="h-4 w-4" />
              <span className="hidden md:inline">Prev</span>
            </button>
          ) : null}

          {/* Next episode quick */}
          {nextEpisode ? (
            <button
              onClick={() => goEpisode(nextEpisode.season, nextEpisode.episode)}
              aria-label="Next episode"
              className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              <SkipForward className="h-5 w-5" />
              <span className="hidden md:inline">Next Ep</span>
            </button>
          ) : null}

          {/* Fullscreen */}
          <button
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          >
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Episode name overlay for tv */}
      {isTv && epMeta && showControls ? (
        <div className="pointer-events-none absolute bottom-24 left-4 z-20 max-w-sm rounded-xl bg-black/70 px-4 py-3 backdrop-blur md:left-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            S{curSeason} E{curEpisode}
          </p>
          <p className="mt-0.5 text-sm font-bold text-white">{epMeta.name}</p>
          {epMeta.overview ? (
            <p className="mt-1 line-clamp-2 text-xs text-white/60">{epMeta.overview}</p>
          ) : null}
        </div>
      ) : null}

      {/* Footer note about source */}
      <p className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 select-none text-[10px] text-white/25">
        {source.full
          ? "Streaming in full from the Internet Archive (public domain)"
          : `Playing via YouTube · ${source.sourceLabel}`}
      </p>
    </div>
  );
}
