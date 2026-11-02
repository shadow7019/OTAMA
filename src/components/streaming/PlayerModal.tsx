"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  List,
  Info,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Zap,
  Magnet,
  Play,
  FastForward,
} from "lucide-react";
import {
  MediaDetails,
  MediaItem,
  Episode,
  Video,
  getTitle,
  getMediaType,
  getYear,
  img,
  tmdb,
  trailerOf,
  formatDate,
} from "@/lib/tmdb";
import { useMediaStore, useMounted } from "@/hooks/use-media-store";
import { MediaActions } from "./types";

interface PlayerModalProps {
  target: { item: MediaItem; season?: number; episode?: number } | null;
  actions: MediaActions;
  onClose: () => void;
}

/**
 * A torrent "server" = one ranked source returned by /api/torrent/search
 * (ThePirateBay, Torrentio/1337x, YTS, EZTV …). We download it on our own
 * backend and stream it to the native <video> element — no third-party
 * iframe, therefore no pop-ups, no tab redirects, no injected ads.
 */
interface TorrentServer {
  id: string;
  releaseName: string;
  seeders: number;
  peers: number;
  sizeBytes: number;
  provider: string;
  quality: string;
  fileIdx: number | null;
  /** verified = exact title/episode match · pack = season pack (right file auto-picked) · weak = title-only match */
  match: "verified" | "pack" | "weak";
  score: number;
}

interface TorrentStatus {
  found: boolean;
  ready?: boolean;
  progress?: number;
  peers?: number;
  speed?: number;
}

interface ArchiveMatchClient {
  identifier: string;
  title: string;
  year: number | null;
  creator: string;
  description: string;
  license: string;
  fileUrl: string;
  fileSize: number;
  kind: "movie" | "tv";
}

const ARCHIVE_ID = "otama-direct";
/** Switch servers when the swarm gives us nothing at all. Trackers usually
 * announce within 10-30 s — a healthy server still looks peer-less at 18 s,
 * so the window must outlast the announce cycle before calling a server dead. */
const NO_PEER_SWITCH_MS = 45000;
/** Switch only when progress has not moved ONE BIT for this long. A slow
 * server that is still delivering data is working — torrent sites are slow,
 * and switching away from a buffering server is what breaks playback. */
const STALL_SWITCH_MS = 60000;

const fmtSize = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : b > 0 ? `${Math.round(b / 1e3)} KB` : "—";
const fmtSpeed = (bps: number) =>
  bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : `${Math.round(bps / 1e3)} KB/s`;
const fmtSeeders = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function PlayerModal({ target, actions, onClose }: PlayerModalProps) {
  // remounted per target via key — initial state is safe to derive from props
  const type = target ? getMediaType(target.item) : "movie";
  const itemId = target?.item.id ?? null;

  /* ---------------- servers (torrent sources) ---------------- */
  const [servers, setServers] = useState<TorrentServer[]>([]);
  const [serversState, setServersState] = useState<"loading" | "ready" | "error">("loading");
  const [searchNonce, setSearchNonce] = useState(0); // bump = manual re-search
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [manualIdx, setManualIdx] = useState<number | "archive" | "trailer" | null>(null);
  const [tried, setTried] = useState<number[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [videoState, setVideoState] = useState<"loading" | "playing" | "error">("loading");
  const [needsTap, setNeedsTap] = useState(false);
  const [status, setStatus] = useState<TorrentStatus | null>(null);
  const [videoNonce, setVideoNonce] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  /** automatic re-searches done for the CURRENT episode (reset on ep change) */
  const [autoRetries, setAutoRetries] = useState(0);

  /* ---------------- archive.org direct fallback (movies) ---------------- */
  const [archive, setArchive] = useState<ArchiveMatchClient | null>(null);
  const [archiveState, setArchiveState] = useState<"loading" | "found" | "none">("loading");

  /* ---------------- TV navigation ---------------- */
  const [season, setSeason] = useState(() => target?.season ?? 1);
  const [episode, setEpisode] = useState(() => target?.episode ?? 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [epLoading, setEpLoading] = useState(() => type === "tv");
  const [details, setDetails] = useState<MediaDetails | null>(null);
  const [showEpisodes, setShowEpisodes] = useState(false);

  const mounted = useMounted();
  const addContinue = useMediaStore((s) => s.addContinue);
  const toggleWatchlist = useMediaStore((s) => s.toggleWatchlist);
  const watchlist = useMediaStore((s) => s.watchlist);

  // refs so callbacks/effects always read the latest values
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const triedRef = useRef(tried);
  triedRef.current = tried;
  const videoStateRef = useRef(videoState);
  videoStateRef.current = videoState;
  const streamStartRef = useRef(0);
  /** last progress seen from the status poll — drives the stall clock */
  const lastProgressRef = useRef(0);
  /** when progress last moved — a server that moves data is never "too slow" */
  const lastProgressAtRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // When the browser blocks autoplay we surface a tap-to-play overlay instead
  // of a stuck black frame (video data is already buffered at that point).
  const handleCanPlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setVideoState((s) => (s === "loading" ? "playing" : s));
    const v = e.currentTarget;
    if (v.paused) {
      v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    }
  };

  const activeServer = activeIdx !== null ? servers[activeIdx] ?? null : null;
  const isArchive = manualIdx === "archive" && archiveState === "found" && !!archive;
  const showTrailer = manualIdx === "trailer";

  const trailer: Video | null = useMemo(() => (details ? trailerOf(details) : null), [details]);

  const stopId = useCallback((id: string | null) => {
    if (!id) return;
    fetch("/api/torrent/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const serverLabel = useCallback((s: TorrentServer) => `${s.quality} · ${s.provider}`, []);

  /* ---------------- failover ---------------- */
  const failover = useCallback(
    (reason: string) => {
      const cur = activeIdxRef.current;
      const list = serversRef.current;
      const next = list.findIndex((_, i) => i !== cur && !triedRef.current.includes(i));
      const triedNext = new Set(triedRef.current);
      if (cur !== null) triedNext.add(cur);
      triedRef.current = [...triedNext];
      setTried([...triedNext]);
      const failed = cur !== null ? serversRef.current[cur] : null;
      if (failed) stopId(failed.id);
      if (next >= 0) {
        setActiveIdx(next);
        setVideoState("loading");
        setStatus(null);
        streamStartRef.current = Date.now();
        setBanner(`${reason} — switching to server ${next + 1} (${serverLabel(list[next])})`);
      } else {
        setExhausted(true);
        setBanner(reason);
      }
    },
    [stopId, serverLabel]
  );

  /* ---------------- load servers for this title/episode ---------------- */
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setServers([]);
    setServersState("loading");
    setTried([]);
    triedRef.current = [];
    setActiveIdx(null);
    setManualIdx(null);
    setExhausted(false);
    setVideoState("loading");
    setStatus(null);
    setBanner(null);

    const params = new URLSearchParams({
      type,
      id: String(target.item.id),
      title: getTitle(target.item),
      year: getYear(target.item),
    });
    if (type === "tv") {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    fetch(`/api/torrent/search?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { results?: TorrentServer[] }) => {
        if (cancelled) return;
        const found = Array.isArray(j.results) ? j.results : [];
        setServers(found);
        setServersState("ready");
        // Pre-resolve metadata for the first candidates right now
        // (fire-and-forget). Metadata alone costs 15-90 s on a cold torrent,
        // and paying that while the video element is already waiting is what
        // looks like "stuck on buffering". Warmed, the stream starts
        // delivering the instant it opens — direct-player startup speed.
        const warmables = found.slice(0, 3).map((s) => ({ id: s.id, dn: s.releaseName }));
        if (warmables.length) {
          fetch("/api/torrent/warm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: warmables }),
            keepalive: true,
          }).catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setServersState("error");
      });

    // Otama Direct: movies → public-domain copy; TV episodes → episode lookup
    // (Indian daily shows surface on archive.org hours after broadcast, long
    // before the public trackers list them)
    setArchiveState("loading");
    const archiveUrl =
      type === "movie"
        ? `/api/archive?title=${encodeURIComponent(getTitle(target.item))}&year=${encodeURIComponent(getYear(target.item))}`
        : `/api/archive?type=tv&id=${target.item.id}&season=${season}&episode=${episode}&title=${encodeURIComponent(getTitle(target.item))}`;
    fetch(archiveUrl)
      .then((r) => r.json())
      .then((j: { match: ArchiveMatchClient | null }) => {
        if (cancelled) return;
        setArchive(j.match);
        setArchiveState(j.match ? "found" : "none");
      })
      .catch(() => {
        if (!cancelled) setArchiveState("none");
      });
    return () => {
      cancelled = true;
    };
  }, [target, type, season, episode, searchNonce]);
  // automatic retries are per-episode: a manual "Search again" must not reset them
  useEffect(() => {
    setAutoRetries(0);
  }, [target, type, season, episode]);

  /* ---------------- auto-pick the best untried server ---------------- */
  useEffect(() => {
    if (serversState !== "ready") return;
    if (manualIdx !== null || activeIdx !== null || exhausted) return;
    const idx = servers.findIndex((_, i) => !tried.includes(i));
    if (idx >= 0) {
      setActiveIdx(idx);
      setVideoState("loading");
      streamStartRef.current = Date.now();
    } else {
      setExhausted(true);
    }
  }, [serversState, servers, tried, activeIdx, manualIdx, exhausted]);

  /* ---------------- Otama Direct for episodes with no torrent sources ----------------
   * Daily-show episodes (Bigg Boss Hindi…) are usually absent from public
   * trackers but uploaded to archive.org within hours of broadcast. When the
   * torrent scan comes up empty and a direct episode stream exists, play it. */
  useEffect(() => {
    if (type !== "tv" || serversState !== "ready") return;
    if (servers.length > 0 || manualIdx !== null || exhausted) return;
    if (archiveState !== "found" || !archive) return;
    setManualIdx("archive");
    setVideoState("loading");
  }, [type, serversState, servers.length, manualIdx, exhausted, archiveState, archive]);

  /* ---------------- stream URL ---------------- */
  const streamUrl = useMemo(() => {
    if (!activeServer || !target) return null;
    const file = activeServer.fileIdx != null ? `&file=${activeServer.fileIdx}` : "";
    // season/episode steer file selection inside season packs and year
    // steers multi-year movie collections — so the exact requested content
    // plays instead of the pack's biggest file
    const hints =
      type === "tv"
        ? `&season=${season}&episode=${episode}`
        : `&year=${getYear(target.item)}`;
    return `/api/torrent/stream?id=${activeServer.id}&dn=${encodeURIComponent(activeServer.releaseName)}${file}${hints}`;
  }, [activeServer, type, season, episode, target?.item]);

  useEffect(() => {
    streamStartRef.current = Date.now();
    lastProgressRef.current = 0;
    lastProgressAtRef.current = Date.now();
    setStatus(null);
    setNeedsTap(false);
  }, [streamUrl, videoNonce]);

  /* ---------------- live status + watchdog failover ---------------- */
  useEffect(() => {
    if (!streamUrl || !activeServer) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/torrent/status?id=${activeServer.id}`);
        const j: TorrentStatus = await r.json();
        if (cancelled) return;
        setStatus(j);
        if (j.found === false) {
          // a freshly opened stream can poll before the backend registers the
          // torrent — that is transient, never a reason to switch. Trust it
          // only once the stream has been open long enough to mean a real drop.
          if (Date.now() - streamStartRef.current > 8000) {
            failover("This server dropped the stream");
          }
          return;
        }
        if (videoStateRef.current === "playing") return;
        const progress = j.progress ?? 0;
        // ANY forward movement proves the server is delivering and resets the
        // stall clock — buffering patiently beats switching into another
        // server that would start its download from zero
        if (progress > lastProgressRef.current) {
          lastProgressRef.current = progress;
          lastProgressAtRef.current = Date.now();
        }
        const elapsed = Date.now() - streamStartRef.current;
        if (elapsed > NO_PEER_SWITCH_MS && (j.peers ?? 0) === 0 && progress === 0) {
          failover("No peers on this server");
        } else if (Date.now() - lastProgressAtRef.current > STALL_SWITCH_MS) {
          // not one new piece for the whole window — the swarm is truly dead
          failover("This server is too slow to start");
        }
      } catch {
        /* transient — next tick retries */
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [streamUrl, activeServer, failover]);

  /* ---------------- stop torrents on switch / unmount ---------------- */
  useEffect(() => {
    const id = activeServer?.id ?? null;
    if (currentIdRef.current && currentIdRef.current !== id) stopId(currentIdRef.current);
    currentIdRef.current = id;
  }, [activeServer?.id, stopId]);
  useEffect(() => {
    return () => {
      if (currentIdRef.current) stopId(currentIdRef.current);
    };
  }, [stopId]);

  /* ---------------- record progress for Continue Watching ---------------- */
  useEffect(() => {
    if (!target || !mounted) return;
    const t = getMediaType(target.item);
    addContinue(target.item, t === "tv" ? season : undefined, t === "tv" ? episode : undefined);
  }, [target, mounted, addContinue, season, episode]);

  /* ---------------- details (season list + trailer fallback) ---------------- */
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

  /* ---------------- auto-refresh episodes while open ----------------
   * Daily shows (Bigg Boss…) publish a new episode every day: re-pull the
   * season when the tab regains focus and every few minutes, so the latest
   * episode appears on its own — no reload needed. */
  const epRefreshRef = useRef(0);
  useEffect(() => {
    if (!target || type !== "tv") return;
    const refresh = () => {
      if (Date.now() - epRefreshRef.current < 90_000) return; // throttle
      epRefreshRef.current = Date.now();
      tmdb<{ episodes: Episode[] }>(`tv/${target.item.id}/season/${season}`, { _fresh: 1 })
        .then((res) => setEpisodes(res.episodes ?? []))
        .catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const iv = setInterval(onVis, 3 * 60_000);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [target, type, season]);

  /* ---------------- banner auto-dismiss ---------------- */
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(t);
  }, [banner]);

  /* ---------------- scroll lock + escape ---------------- */
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

  const seasonsList = (details?.seasons ?? []).filter(
    (s) => s.season_number > 0 && s.episode_count > 0
  );
  const maxEpisode =
    episodes.length ||
    details?.seasons?.find((s) => s.season_number === season)?.episode_count ||
    1;

  /* -------- episode freshness (daily shows like Bigg Boss) -------- */
  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const epAired = (ep: Episode) => !!ep.air_date && ep.air_date <= todayYmd;
  const latestAired = useMemo(() => {
    for (let i = episodes.length - 1; i >= 0; i--) {
      if (epAired(episodes[i])) return episodes[i];
    }
    return null;
  }, [episodes]);
  const currentEpisode = episodes.find((ep) => ep.episode_number === episode);

  /* ---------------- auto-research when an episode has no sources yet ----------------
   * Brand-new daily-show episodes (Bigg Boss…) are often indexed only hours
   * after broadcast. When the first scan comes up empty and the episode has
   * already aired, re-scan automatically every 90s (max 5 tries) so the
   * torrent appears the moment indexers list it — no manual refresh needed. */
  const noSourcesYet = serversState === "ready" && servers.length === 0;
  const episodeAired =
    type !== "tv" || !currentEpisode?.air_date || currentEpisode.air_date <= todayYmd;
  useEffect(() => {
    if (!noSourcesYet || !episodeAired || autoRetries >= 5) return;
    // a direct episode stream that is already playing must not be interrupted
    if (manualIdx === "archive" && archiveState === "found") return;
    const t = setTimeout(() => {
      setAutoRetries((n) => n + 1);
      setSearchNonce((n) => n + 1);
    }, 90_000);
    return () => clearTimeout(t);
  }, [noSourcesYet, episodeAired, autoRetries, searchNonce, manualIdx, archiveState]);

  if (!target) return null;

  const item = target.item;
  const title = getTitle(item);

  const goEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    setShowEpisodes(false);
  };
  const nextEpisode = () => {
    // never step into episodes that haven't aired yet (TMDB publishes
    // placeholders days ahead for daily shows)
    const cap = latestAired?.episode_number ?? maxEpisode;
    if (episode < cap) goEpisode(season, episode + 1);
    else if (seasonsList.some((s) => s.season_number === season + 1)) goEpisode(season + 1, 1);
  };
  const prevEpisode = () => {
    if (episode > 1) goEpisode(season, episode - 1);
    else if (season > 1) goEpisode(season - 1, 1);
  };

  const inList = mounted
    ? watchlist.some((w) => w.id === item.id && w.media_type === type)
    : false;

  /* ---------------- user actions ---------------- */
  const selectTorrent = (idx: number) => {
    if (idx === activeIdx) {
      // re-selecting the active server = manual retry
      setVideoState("loading");
      setVideoNonce((n) => n + 1);
      return;
    }
    setManualIdx(idx);
    setExhausted(false);
    setVideoState("loading");
    setActiveIdx(idx);
    streamStartRef.current = Date.now();
  };

  const selectAuto = () => {
    setManualIdx(null);
    setExhausted(false);
    setTried([]);
    triedRef.current = [];
    setActiveIdx(null); // auto-pick effect chooses the best server again
  };

  const selectArchive = () => {
    if (archiveState !== "found" || !archive) return;
    if (manualIdx === "archive") {
      setVideoNonce((n) => n + 1);
      return;
    }
    if (activeServer) stopId(activeServer.id);
    setManualIdx("archive");
    setExhausted(false);
    setVideoState("loading");
  };

  const playTrailer = () => {
    if (!trailer) return;
    if (activeServer) stopId(activeServer.id);
    setManualIdx("trailer");
    setExhausted(false);
  };

  const retryAll = () => {
    setTried([]);
    triedRef.current = [];
    setExhausted(false);
    setManualIdx(null);
    setActiveIdx(null);
    setVideoState("loading");
    setBanner(null);
  };

  const retryCurrent = () => {
    setExhausted(false);
    setVideoState("loading");
    setVideoNonce((n) => n + 1);
  };

  /* ---------------- derived render state ---------------- */
  const noSources =
    (serversState === "ready" && servers.length === 0) || serversState === "error";
  // exhausted also becomes true when zero servers exist — in that case only
  // the no-source panel may show, never the "servers failed" panel too
  const showFailPanel =
    !noSources &&
    ((exhausted && !isArchive && !showTrailer) ||
      (videoState === "error" && exhausted && !isArchive && !showTrailer));
  const showNoSourcePanel =
    noSources && !isArchive && !showTrailer && archiveState !== "found";

  const downloading = status && (status.progress ?? 0) < 0.999;
  const videoKey = `${streamUrl ?? "none"}-${videoNonce}`;

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
            {type === "tv" && currentEpisode?.name && currentEpisode.name !== "TBD" && (
              <p className="truncate text-xs text-zinc-500">{currentEpisode.name}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() =>
              toggleWatchlist(item, type === "tv" ? season : undefined, type === "tv" ? episode : undefined)
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
        </div>
      </div>

      {/* Server strip — every chip is an ad-free torrent source */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
          Server
        </span>

        <button
          type="button"
          onClick={selectAuto}
          title="Automatically picks the best-seeded source and fails over if it stalls"
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            manualIdx === null
              ? "bg-red-600 text-white"
              : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
          }`}
        >
          <Zap className="h-3 w-3" />
          Auto{activeServer && manualIdx === null ? ` · S${activeIdx! + 1}` : ""}
        </button>

        <button
          type="button"
          onClick={selectArchive}
          disabled={archiveState !== "found"}
          title={
            archiveState === "found"
              ? type === "tv"
                ? "Built-in player, direct episode stream — 100% ad-free"
                : "Built-in player, direct public-domain stream — 100% ad-free"
              : archiveState === "loading"
                ? "Checking archive.org for a direct copy…"
                : "No direct copy found for this title"
          }
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            isArchive
              ? "bg-emerald-600 text-white"
              : archiveState === "found"
                ? "bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-600/40 hover:bg-emerald-600/25"
                : "bg-white/5 text-zinc-600"
          } ${archiveState !== "found" ? "cursor-not-allowed" : ""}`}
        >
          <ShieldCheck className="h-3 w-3" />
          Direct
          {archiveState === "loading" && <span className="animate-pulse">…</span>}
        </button>

        {servers.map((s, i) => {
          const active = activeIdx === i;
          const matchBadge =
            s.match === "verified"
              ? { label: "✓", hint: "Release verified for this exact title/episode" }
              : s.match === "pack"
                ? { label: "Season pack", hint: "Season pack — the requested episode is picked automatically" }
                : { label: "unverified", hint: "Could not verify the year/episode in this release name" };
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => selectTorrent(i)}
              title={`${s.releaseName}\n${s.seeders} seeders · ${fmtSize(s.sizeBytes)} · ${s.provider}\n${matchBadge.hint}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-red-600 text-white"
                  : tried.includes(i)
                    ? "bg-white/5 text-zinc-600 hover:bg-white/10"
                    : "bg-white/8 text-zinc-300 hover:bg-white/15 hover:text-white"
              }`}
            >
              <Magnet className="h-3 w-3" />
              S{i + 1} · {s.quality}
              <span
                className={`hidden text-[9px] font-normal md:inline ${
                  s.match === "verified"
                    ? "text-emerald-400"
                    : s.match === "pack"
                      ? "text-sky-400"
                      : "text-amber-400"
                }`}
              >
                {matchBadge.label}
              </span>
              <span className="hidden text-[9px] font-normal text-zinc-500 lg:inline">
                {s.provider} · 👤{fmtSeeders(s.seeders)}
              </span>
            </button>
          );
        })}

        {serversState === "loading" && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Scanning torrent networks…
          </span>
        )}
      </div>

      {/* every source found is dead — set expectations before playback stalls */}
      {serversState === "ready" && servers.length > 0 && servers.every((s) => s.seeders === 0) && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 md:mx-5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Only dead torrents found for this episode right now (0 seeders on every
          source). Playback will likely fail — check back later; daily-show
          episodes usually get seeded within days.
        </div>
      )}

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
          <div className="relative w-full bg-black lg:flex-1">
            <div className="relative mx-auto aspect-video max-h-[calc(100vh-160px)] w-full max-w-[calc((100vh-160px)*16/9)]">
              {/* ---------- trailer fallback ---------- */}
              {showTrailer && trailer ? (
                <iframe
                  key={trailer.key}
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1`}
                  title={`${title} trailer`}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : isArchive && archive ? (
                /* ---------- Otama Direct: public-domain native stream ---------- */
                <>
                  <video
                    key={`${archive.identifier}-${videoNonce}`}
                    src={archive.fileUrl}
                    poster={img(item.backdrop_path, "w1280") ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    onCanPlay={handleCanPlay}
                    onPlaying={() => {
                      setVideoState("playing");
                      setNeedsTap(false);
                    }}
                    onError={() => {
                      setVideoState("error");
                      setExhausted(true);
                    }}
                    className="h-full w-full bg-black"
                  />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <ShieldCheck className="h-3 w-3" />{" "}
                    {archive.kind === "tv" ? "Ad-free · Direct episode" : "Ad-free · Public domain"}
                  </div>
                  <p className="absolute inset-x-3 bottom-2 truncate text-[10px] text-zinc-500">
                    {archive.title}
                    {archive.year ? ` (${archive.year})` : ""} · archive.org
                    {archive.kind === "movie" ? ` · ${archive.license}` : ""}
                  </p>
                </>
              ) : streamUrl ? (
                /* ---------- torrent stream: native video, HTTP Range, no iframe ---------- */
                <>
                  <video
                    ref={videoRef}
                    key={videoKey}
                    src={streamUrl}
                    poster={img(item.backdrop_path, "w1280") ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    onCanPlay={handleCanPlay}
                    onPlaying={() => {
                      setVideoState("playing");
                      setNeedsTap(false);
                    }}
                    onError={() => failover("Stream failed on this server")}
                    className="h-full w-full bg-black"
                  />
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <ShieldCheck className="h-3 w-3" /> Ad-free · P2P direct
                  </div>
                  {videoState === "playing" && downloading && (
                    <div className="absolute bottom-2 left-3 flex items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-zinc-200 backdrop-blur">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      P2P ↓ {Math.round((status?.progress ?? 0) * 100)}% · {fmtSpeed(status?.speed ?? 0)} ·{" "}
                      {status?.peers ?? 0} peers
                    </div>
                  )}
                </>
              ) : null}

              {/* ---------- tap to play (browser blocked autoplay) ---------- */}
              {needsTap && !showTrailer && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                  <button
                    type="button"
                    onClick={() => {
                      videoRef.current?.play().catch(() => {});
                      setNeedsTap(false);
                    }}
                    aria-label="Play"
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl transition hover:scale-105 hover:bg-red-500"
                  >
                    <Play className="h-9 w-9" />
                  </button>
                </div>
              )}

              {/* ---------- connecting overlay ---------- */}
              {streamUrl && videoState === "loading" && !showTrailer && !isArchive && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                  <p className="text-sm text-zinc-400">
                    Connecting to{" "}
                    <span className="font-semibold text-zinc-200">
                      {activeServer ? `S${activeIdx! + 1} · ${serverLabel(activeServer)}` : "best server"}
                    </span>
                    …
                  </p>
                  {activeServer && (
                    <p className="max-w-md truncate text-[11px] text-zinc-600">
                      {activeServer.releaseName} · {fmtSize(activeServer.sizeBytes)}
                    </p>
                  )}
                  {status && (status.progress ?? 0) > 0 && (
                    <div className="w-56">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-red-600 transition-all"
                          style={{ width: `${Math.max(2, (status.progress ?? 0) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-zinc-400">
                        {Math.round((status.progress ?? 0) * 100)}% buffered ·{" "}
                        {fmtSpeed(status?.speed ?? 0)} · {status?.peers ?? 0} peers
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => failover("Skipped")}
                      className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      Next server
                    </button>
                    <button
                      type="button"
                      onClick={retryCurrent}
                      className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* ---------- no sources panel ---------- */}
              {showNoSourcePanel && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center">
                  <Magnet className="h-10 w-10 text-zinc-600" />
                  <div>
                    <p className="text-base font-bold text-white">
                      No playable source found for this episode yet
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-400">
                      We searched ThePirateBay, Torrentio, TorrentsCSV, BitSearch, EZTV and
                      archive.org — no healthy source for it right now. Brand-new episodes of
                      daily shows usually surface within hours to a few days. The episode list
                      and servers refresh automatically, so simply retry later.
                    </p>
                    {type === "tv" && noSourcesYet && autoRetries < 5 && episodeAired && (
                      <p
                        className="mx-auto mt-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-sky-300"
                        data-testid="auto-research-note"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Auto-checking again in ~90 s (attempt {autoRetries + 1} of 5) — the stream
                        will start on its own once a source appears
                      </p>
                    )}
                    {type === "tv" && latestAired && latestAired.episode_number !== episode && (
                      <button
                        type="button"
                        onClick={() =>
                          goEpisode(latestAired.season_number || season, latestAired.episode_number)
                        }
                        className="mx-auto mt-2 block text-[11px] font-semibold text-zinc-400 underline decoration-dotted transition hover:text-zinc-200"
                      >
                        Episode {latestAired.episode_number} (aired{" "}
                        {formatDate(latestAired.air_date) || "recently"}) — try it, older
                        episodes are usually seeded first
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSearchNonce((n) => n + 1)}
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Search again
                    </button>
                    {trailer && (
                      <button
                        type="button"
                        onClick={playTrailer}
                        className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500"
                      >
                        <Play className="h-3.5 w-3.5" /> Play trailer
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ---------- all servers exhausted ---------- */}
              {showFailPanel && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-amber-400" />
                  <div>
                    <p className="text-base font-bold text-white">
                      None of the {servers.length || "available"} servers could start
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-zinc-400">
                      Every source was tried automatically. Try again — swarms change by the
                      minute — or watch the trailer while the torrents get more seeders.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={retryAll}
                      className="flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/20"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Retry all
                    </button>
                    {trailer && (
                      <button
                        type="button"
                        onClick={playTrailer}
                        className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500"
                      >
                        <Play className="h-3.5 w-3.5" /> Play trailer
                      </button>
                    )}
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
                  <span className="font-semibold text-zinc-400">Auto</span> picks the best-seeded
                  source and fails over automatically. Playback is a direct P2P stream on our own
                  player — <span className="text-emerald-400">no ad networks, ever</span>.
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
              {latestAired && (
                <button
                  type="button"
                  onClick={() =>
                    goEpisode(latestAired.season_number || season, latestAired.episode_number)
                  }
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-600/40 transition hover:bg-red-600/30"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  Jump to latest · E{latestAired.episode_number}
                  {latestAired.air_date ? ` · ${formatDate(latestAired.air_date)}` : ""}
                </button>
              )}
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
                  const aired = epAired(ep);
                  // TMDB fills brand-new daily-show episodes with "TBD"
                  // (Bigg Boss S20E55 airs with no title yet) — show a real
                  // label and the broadcast date instead
                  const name =
                    ep.name && ep.name !== "TBD" ? ep.name : `Episode ${ep.episode_number}`;
                  const isNew =
                    !!ep.air_date &&
                    ep.air_date <= todayYmd &&
                    (Date.parse(todayYmd) - Date.parse(ep.air_date)) / 86400000 <= 2;
                  return (
                    <button
                      key={`${ep.id}-${ep.episode_number}`}
                      type="button"
                      onClick={() => goEpisode(season, ep.episode_number)}
                      disabled={!aired}
                      title={
                        aired
                          ? undefined
                          : `Airs ${formatDate(ep.air_date) || "TBA"} — not playable yet`
                      }
                      className={`mb-1.5 flex w-full items-start gap-3 rounded-lg p-2 text-left transition ${
                        active
                          ? "bg-red-600/20 ring-1 ring-red-600/60"
                          : aired
                            ? "ring-1 ring-transparent hover:bg-white/5"
                            : "cursor-not-allowed opacity-45 ring-1 ring-transparent"
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
                          {ep.episode_number}. {name}
                          {isNew && (
                            <span className="ml-1.5 rounded bg-red-600 px-1 py-0.5 align-middle text-[9px] font-bold uppercase text-white">
                              New
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                          {!aired
                            ? `Airs ${formatDate(ep.air_date) || "TBA"}`
                            : `Aired ${formatDate(ep.air_date) || "—"}${
                                ep.overview ? "" : " · details pending"
                              }`}
                        </p>
                        {aired && ep.overview && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-zinc-600">
                            {ep.overview}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              {!epLoading && !episodes.length && (
                <p className="p-4 text-center text-xs text-zinc-600">
                  No episode data for this season yet. New episodes appear here automatically
                  as soon as they are published.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
