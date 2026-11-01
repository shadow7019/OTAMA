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
  Captions,
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
import { useMediaStore, useMounted, isServerDead } from "@/hooks/use-media-store";
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
  /** audio/language tags parsed from the release name (sub / eng / hindi / dual…) */
  audioTags?: string[];
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
/** Switch when peers exist but no data ever arrives — dead/poisoned swarm. */
const NO_DATA_SWITCH_MS = 15000;
/** Switch when only a trickle arrives (never has the first playable MBs in time). */
const TRICKLE_SWITCH_MS = 25000;
/** Swarm reports alive (speed > 0, pack progress creeping) but the video
 * element has parsed zero media — the swarm is fetching pieces we don't play.
 * Don't sit out the 120s absolute ceiling; move on. */
const FIRST_DATA_SWITCH_MS = 30000;
/** Fail over when the download has made NO progress for this long. */
const STALL_SWITCH_MS = 40000;
/** Absolute start ceiling — even a creeping trickle can't hold the player longer. */
const HARD_START_MS = 120000;

const fmtSize = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : b > 0 ? `${Math.round(b / 1e3)} KB` : "—";
const fmtSpeed = (bps: number) =>
  bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : `${Math.round(bps / 1e3)} KB/s`;
const fmtSeeders = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** pretty labels for the language chips */
const LANG_LABEL: Record<string, string> = {
  auto: "All languages",
  sub: "Subbed",
  eng: "English",
  hindi: "Hindi",
  tamil: "Tamil",
  telugu: "Telugu",
  malayalam: "Malayalam",
  kannada: "Kannada",
  bengali: "Bengali",
  marathi: "Marathi",
  punjabi: "Punjabi",
  dual: "Dual audio",
  multi: "Multi audio",
  jap: "Japanese",
  raw: "Raw",
  spa: "Spanish",
  por: "Portuguese",
  chi: "Chinese",
  kor: "Korean",
  rus: "Russian",
  ukr: "Ukrainian",
  ita: "Italian",
  fre: "French",
  ger: "German",
  unknown: "Unknown",
};

/** one selectable subtitle language from /api/subtitles */
interface SubtitleRow {
  id: string;
  /** ISO code ("eng", "por"…) — doubles as the <track> language */
  lang: string;
  langName: string;
  /** same-origin /api/subtitles/file VTT proxy URL */
  src: string;
  fileName?: string;
}

/** one row in the CC dropdown */
function SubMenuItem({
  label, hint, active, onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold transition ${
        active ? "bg-violet-600/25 text-white" : "text-zinc-300 hover:bg-white/10"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-violet-400" : "bg-transparent"}`} />
        {label}
      </span>
      {hint && <span className="text-[10px] font-bold uppercase text-violet-300">{hint}</span>}
    </button>
  );
}

/**
 * CC button + subtitle-language dropdown, overlaid directly on the video —
 * reachable without scrolling, on both torrent and direct streams.
 * Mirrors the Subs chip row below the player ("Off / Auto / languages").
 */
function SubtitleMenu({
  subs, subState, subtitleLang, setSubtitleLang, activeSub, emptyText,
}: {
  subs: SubtitleRow[];
  subState: "loading" | "ready" | "error";
  subtitleLang: string;
  setSubtitleLang: (lang: string) => void;
  activeSub: SubtitleRow | null;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const on = !!activeSub;
  return (
    <div className="absolute right-3 top-3 z-30">
      {open && (
        <button
          type="button"
          aria-label="Close subtitle menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
      <button
        type="button"
        data-testid="cc-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Subtitle language"
        className={`relative z-40 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide backdrop-blur transition ${
          on ? "bg-violet-600/95 text-white" : "bg-black/70 text-zinc-200 hover:bg-black/85"
        }`}
      >
        <Captions className="h-4 w-4" />
        CC
        {on && <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />}
      </button>
      {open && (
        <div
          data-testid="cc-menu"
          role="menu"
          className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur"
        >
          <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Subtitle language
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <SubMenuItem
              label="Off"
              active={subtitleLang === "off"}
              onClick={() => {
                setSubtitleLang("off");
                setOpen(false);
              }}
            />
            <SubMenuItem
              label="Auto"
              hint={subtitleLang === "auto" && activeSub ? "on" : undefined}
              active={subtitleLang === "auto"}
              onClick={() => {
                setSubtitleLang("auto");
                setOpen(false);
              }}
            />
            {subs.map((r) => (
              <SubMenuItem
                key={r.lang}
                label={r.langName}
                active={subtitleLang === r.lang}
                onClick={() => {
                  setSubtitleLang(r.lang);
                  setOpen(false);
                }}
              />
            ))}
            {subState === "loading" && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading subtitles…
              </div>
            )}
            {subState !== "loading" && subs.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">{emptyText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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

  /* ---------------- subtitles (OpenSubtitles → our VTT proxy) ---------------- */
  const [subs, setSubs] = useState<SubtitleRow[]>([]);
  const [subState, setSubState] = useState<"loading" | "ready" | "error">("loading");

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
  const serverLang = useMediaStore((s) => s.serverLang);
  const setServerLang = useMediaStore((s) => s.setServerLang);
  const subtitleLang = useMediaStore((s) => s.subtitleLang);
  const setSubtitleLang = useMediaStore((s) => s.setSubtitleLang);
  const deadServers = useMediaStore((s) => s.deadServers);
  const markDeadServers = useMediaStore((s) => s.markDeadServers);
  const reviveServer = useMediaStore((s) => s.reviveServer);
  const sweepDeadServers = useMediaStore((s) => s.sweepDeadServers);

  // refs so callbacks/effects always read the latest values
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  // consecutive ticks that failed at the network level — while set, the
  // backend itself is unreachable and failover must not burn the server list
  const backendDownRef = useRef(0);
  // remounts issued to recover a flaked streaming pipe (edge proxy cutting
  // the long video response / status route while the origin itself is up).
  // One remount gets a fresh range request; a second failure means this
  // server's pipe is the problem — fail over instead of reconnect-looping.
  const pipeRemountsRef = useRef(0);
  const triedRef = useRef(tried);
  triedRef.current = tried;
  const videoStateRef = useRef(videoState);
  videoStateRef.current = videoState;
  const streamStartRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  /** server ids already sent to /api/torrent/warm (dedupe, and stop on close) */
  const warmedRef = useRef<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const serverLangRef = useRef(serverLang);
  serverLangRef.current = serverLang;
  /* scan key (type:id:se:ep) of the last torrent scan — lets a language
     re-scan of the same title keep the current swarm instead of wiping it */
  const lastScanKeyRef = useRef<string | null>(null);

  /* servers hidden because they already failed playback (auto-revive after
     DEAD_SERVER_TTL) */
  const deadIdxs = useMemo(() => {
    const s = new Set<number>();
    if (!mounted) return s;
    servers.forEach((sv, i) => {
      if (isServerDead(deadServers, sv.id)) s.add(i);
    });
    return s;
  }, [servers, deadServers, mounted]);

  /* play order: live servers first, matching the picked audio language;
     falls back to every live server when the filter would empty the list */
  const orderedIdxs = useMemo(() => {
    const all = servers.map((_, i) => i);
    const pick = (pool: number[]) => {
      if (serverLang === "auto") return pool;
      const matching = pool.filter((i) => {
        const tags = servers[i].audioTags ?? [];
        // dual/multi-audio releases may carry the chosen language (track lists
        // aren't in the release name) — they stay visible under any language
        return (
          tags.includes(serverLang) || tags.includes("dual") || tags.includes("multi")
        );
      });
      return matching.length ? matching : pool;
    };
    const alive = all.filter((i) => !deadIdxs.has(i));
    const chosen = pick(alive);
    // every server of this scan is dead-marked: swarms recover (that is why
    // the dead-mark TTL is short), so retry them instead of showing a dead
    // player with no way forward
    return chosen.length ? chosen : pick(all);
  }, [servers, serverLang, deadIdxs]);
  const orderedIdxsRef = useRef(orderedIdxs);
  orderedIdxsRef.current = orderedIdxs;

  /* language chips present in the current scan results */
  const langChips = useMemo(() => {
    const order = [
      "sub", "eng", "hindi", "tamil", "telugu", "malayalam", "kannada",
      "bengali", "marathi", "punjabi", "dual", "multi", "jap", "raw", "spa", "por",
      "chi", "kor", "rus", "ukr", "ita", "fre", "ger",
    ];
    const present = new Set<string>();
    for (const s of servers) for (const t of s.audioTags ?? []) present.add(t);
    return order.filter((t) => present.has(t));
  }, [servers]);

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

  /* ---------------- subtitle selection ----------------
   * "auto" turns English subs on only while a Japanese-audio server plays
   * (the default anime shape); a pinned language wins whenever it exists. */
  const japaneseAudio =
    !!activeServer &&
    (activeServer.audioTags ?? []).includes("jap") &&
    !(activeServer.audioTags ?? []).includes("eng");
  const activeSub = useMemo(() => {
    if (!subs.length) return null;
    if (subtitleLang !== "auto" && subtitleLang !== "off") {
      return subs.find((r) => r.lang === subtitleLang) ?? null;
    }
    if (subtitleLang === "off") return null;
    return japaneseAudio ? subs.find((r) => r.lang === "eng") ?? null : null;
  }, [subs, subtitleLang, japaneseAudio]);

  const trailer: Video | null = useMemo(() => (details ? trailerOf(details) : null), [details]);

  const stopId = useCallback((id: string | null, mode: "stop" | "idle" = "stop") => {
    if (!id) return;
    fetch("/api/torrent/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, mode }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const serverLabel = useCallback((s: TorrentServer) => `${s.quality} · ${s.provider}`, []);

  /* ---------------- failover ---------------- */
  const failover = useCallback(
    (reason: string) => {
      // backend unreachable: every request fails, so "every server failed"
      // is an illusion. Hold position — the watchdog reconnects and resumes.
      if (backendDownRef.current) return;
      const cur = activeIdxRef.current;
      const list = serversRef.current;
      const failed = cur !== null ? list[cur] : null;
      const triedNext = new Set(triedRef.current);
      if (cur !== null) triedNext.add(cur);
      triedRef.current = [...triedNext];
      setTried([...triedNext]);
      if (failed) {
        // idle (not destroy): metadata, peers and already-downloaded pieces
        // stay — if this server is revived later, or the title is reopened,
        // playback resumes without paying the bytes again
        stopId(failed.id, "idle");
        // a server that failed playback stays out of rotation for
        // DEAD_SERVER_TTL — then it re-enters automatically
        markDeadServers([failed.id]);
      }
      const next = orderedIdxsRef.current.find((i) => i !== cur && !triedNext.has(i));
      if (next !== undefined) {
        // new server, new pipe — the flake counter describes the old one
        pipeRemountsRef.current = 0;
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
    [stopId, serverLabel, markDeadServers]
  );

  /* ---------------- load servers for this title/episode ---------------- */
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const scanKey = `${type}:${target.item.id}:${type === "tv" ? `${season}:${episode}` : "m"}`;
    // same-title re-scan (language switch / "Search again"): keep the swarm
    // and the running stream alive while the indexers answer — an empty or
    // failed scan must never blank the server row or strand the player
    const rescan = lastScanKeyRef.current === scanKey;
    lastScanKeyRef.current = scanKey;
    const prevCount = rescan ? serversRef.current.length : 0;
    const langAtScan = serverLangRef.current;
    setServersState("loading");
    setTried([]);
    triedRef.current = [];
    setManualIdx(null);
    setExhausted(false);
    setStatus(null);
    setBanner(null);
    if (!rescan) {
      setServers([]);
      setActiveIdx(null);
      setVideoState("loading");
    }

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
    // a picked audio language steers the scan itself: indexers get an extra
    // dub-targeted query ("english dub", "hindi dubbed"…) for that language
    if (langAtScan !== "auto") params.set("lang", langAtScan);
    fetch(`/api/torrent/search?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { results?: TorrentServer[] }) => {
        if (cancelled) return;
        const results = Array.isArray(j.results) ? j.results : [];
        if (!results.length && prevCount > 0) {
          // keep the previous swarm and the stream that is already playing —
          // picking a language that no indexer serves must not empty the row
          setServersState("ready");
          setBanner(
            langAtScan !== "auto"
              ? `No ${LANG_LABEL[langAtScan] ?? langAtScan} servers found — showing all ${prevCount}`
              : `Re-scan found nothing new — keeping all ${prevCount} servers`,
          );
          return;
        }
        setServers(results);
        setServersState("ready");
        if (rescan) {
          // fresh result set for the same title: drop the current pick so the
          // auto-pick effect restarts playback on the best new server
          setActiveIdx(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (prevCount > 0) {
          setServersState("ready");
          setBanner("Re-scan failed — still playing the current server");
        } else {
          setServersState("error");
        }
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

  /* ---------------- subtitle tracks for this title / episode ---------------- */
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setSubs([]);
    setSubState("loading");
    const params = new URLSearchParams({ type, id: String(target.item.id) });
    if (type === "tv") {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    fetch(`/api/subtitles?${params.toString()}`)
      .then((r) => r.json())
      .then((j: { languages?: SubtitleRow[] }) => {
        if (cancelled) return;
        setSubs(Array.isArray(j.languages) ? j.languages : []);
        setSubState("ready");
      })
      .catch(() => {
        if (!cancelled) setSubState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [target, type, season, episode]);

  /* expired dead-server marks re-enter rotation silently */
  useEffect(() => {
    if (mounted) sweepDeadServers();
  }, [mounted, sweepDeadServers]);

  /* ---------------- auto-pick the best untried server ---------------- */
  useEffect(() => {
    if (serversState !== "ready") return;
    if (manualIdx !== null || activeIdx !== null || exhausted) return;
    const idx = orderedIdxs.find((i) => !tried.includes(i));
    if (idx !== undefined) {
      setActiveIdx(idx);
      setVideoState("loading");
      streamStartRef.current = Date.now();
    } else {
      setExhausted(true);
    }
  }, [serversState, orderedIdxs, tried, activeIdx, manualIdx, exhausted]);

  /* ---------------- pre-warm the next server candidates ----------------
   * Metadata resolution (15–25 s) is the entire startup cost. Resolving the
   * next candidates in parallel while the current server tries means every
   * failover lands on an already-resolved torrent and starts in seconds. */
  useEffect(() => {
    if (serversState !== "ready" || !servers.length) return;
    const cands = orderedIdxs
      .filter((i) => i !== activeIdx && !tried.includes(i))
      .slice(0, 2)
      .map((i) => servers[i])
      .filter((s) => s && !warmedRef.current.has(s.id));
    if (!cands.length) return;
    for (const s of cands) warmedRef.current.add(s.id);
    fetch("/api/torrent/warm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: cands.map((s) => ({ id: s.id, dn: s.releaseName })) }),
    }).catch(() => {});
  }, [serversState, servers, orderedIdxs, activeIdx, tried]);

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
    setStatus(null);
    setNeedsTap(false);
  }, [streamUrl, videoNonce]);

  /* ---------------- keep the chosen subtitle track showing ----------------
   * `default` covers a freshly mounted <video>; after switching languages
   * mid-playback (or an auto language flip on server change) the mode must
   * be forced, since browsers keep the previous track's mode. */
  useEffect(() => {
    if (!activeSub) return;
    const apply = () => {
      const v = videoRef.current;
      if (!v) return;
      for (const t of Array.from(v.textTracks)) {
        t.mode =
          t.kind === "subtitles" && t.language === activeSub.lang ? "showing" : "disabled";
      }
    };
    apply();
    const timer = setTimeout(apply, 500);
    return () => clearTimeout(timer);
  }, [activeSub, streamUrl, videoNonce]);

  /* ---------------- live status + watchdog failover ---------------- */
  // NB: videoNonce is a dependency on purpose — a remount (retry / revive /
  // backend-recovery) must reset the momentum state below, or a revived
  // server inherits the previous attempt's stale progress snapshot and is
  // failed over before it can start.
  useEffect(() => {
    if (!streamUrl || !activeServer) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    // the torrent registers in the engine only once the video's first request
    // lands — the first ticks can legitimately report found:false, so fail
    // over for a "dropped" stream only after we saw it alive at least once
    let seenAlive = false;
    // progress momentum: a server that keeps downloading — even slowly — is
    // alive and gets as long as it needs to deliver the first pieces. Failing
    // over on total elapsed time instead killed healthy-but-slow swarms mid-
    // download and every switch restarted the bytes from zero, so the player
    // cycled servers forever without ever starting.
    let lastProgress = -1;
    let lastProgressAt = Date.now();
    // playback momentum for the mid-stream stall detector (playing state)
    let lastCt = -1;
    let lastCtAt = Date.now();
    // When the whole backend is unreachable (dev server restart, machine
    // sleep) EVERY request fails at the network level. That is not 14 bad
    // servers — failing over would burn the whole strip and dead-mark it.
    // Instead: hold, show a reconnecting banner, and when the backend is
    // back remount the same stream (its torrent may even still be warm).
    const tick = async () => {
      if (cancelled) return;
      let j: TorrentStatus | null = null;
      try {
        const r = await fetch(`/api/torrent/status?id=${activeServer.id}`, {
          // a hung backend must register as down within a tick or two, not
          // hang the poller for the browser's default ~5 minute timeout
          signal: AbortSignal.timeout(8000),
        });
        j = await r.json();
      } catch {
        if (cancelled) return;
        // status failed — is the whole origin gone, or just this long-lived
        // route through the edge? Deployed behind proxies that cut idle
        // streaming responses, the video request can die while the server
        // itself is perfectly fine (the same cut briefly 502s the poll).
        let originAlive = false;
        try {
          await fetch("/", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(4000) });
          originAlive = true;
        } catch {
          /* origin unreachable — treat as a real outage below */
        }
        if (originAlive) {
          // stream pipe flaked: remount the video once for a fresh range
          // request; if the pipe keeps dropping, hand playback to the next
          // server instead of reconnect-looping into the same dead pipe
          if (videoStateRef.current === "error" || videoStateRef.current === "loading") {
            if (pipeRemountsRef.current >= 1) {
              pipeRemountsRef.current = 0;
              backendDownRef.current = 0;
              failover("Streaming connection kept dropping");
            } else {
              pipeRemountsRef.current += 1;
              setVideoState("loading");
              setVideoNonce((n) => n + 1);
              streamStartRef.current = Date.now();
            }
          }
          return;
        }
        backendDownRef.current = Math.min((backendDownRef.current ?? 0) + 1, 3);
        if (backendDownRef.current >= 2) {
          setBanner("Connection to the streaming server was lost — reconnecting…");
        }
        return; // transient — no failover, no dead marks while offline
      }
      if (cancelled || !j) return;
      if (backendDownRef.current) {
        // backend just came back: give the current stream another chance —
        // remount the video (the torrent may still be resolved and buffered).
        // But a server whose stream dies with every outage must not absorb
        // endless remounts either: after one, switch.
        backendDownRef.current = 0;
        setBanner(null);
        if (videoStateRef.current === "error") {
          if (pipeRemountsRef.current >= 1) {
            pipeRemountsRef.current = 0;
            failover("Streaming connection kept dropping");
            return;
          }
          pipeRemountsRef.current += 1;
          setVideoState("loading");
          setVideoNonce((n) => n + 1);
          streamStartRef.current = Date.now();
          return;
        }
      }
      setStatus(j);
      // mid-stream stall recovery: the element claims "playing" but frames
      // stopped arriving (backend restart without a media error, swarm
      // evaporated, range request died silently). Remount the same stream
      // once — a fresh video re-requests the range and playback resumes.
      if (videoStateRef.current === "playing" && videoRef.current) {
        const v = videoRef.current;
        if (v.currentTime !== lastCt) {
          lastCt = v.currentTime;
          lastCtAt = Date.now();
        } else if (!v.paused && !v.error && v.readyState < 3 && Date.now() - lastCtAt > 20000) {
          lastCtAt = Date.now();
          setVideoState("loading");
          setVideoNonce((n) => n + 1);
          streamStartRef.current = Date.now();
          return;
        }
      }
      if (j.found === false) {
        if (seenAlive) failover("This server dropped the stream");
        else if (Date.now() - streamStartRef.current > NO_DATA_SWITCH_MS)
          // the torrent never even registered (metadata timeout ahead) —
          // don't wait for the stream request's own timeout, move on now
          failover("This server is not responding");
        return;
      }
      seenAlive = true;
      // metadata still resolving: pieces cannot flow yet, so the no-data and
      // trickle rules below would kill slow-to-resolve swarms (anime fansubs
      // routinely take 20-40 s) long before they had a chance. Hold until the
      // server's own metadata timeout (40 s) plus slack, then move on.
      if (j.ready === false) {
        if (Date.now() - streamStartRef.current > 50_000)
          failover("This server is taking too long to resolve");
        return;
      }
      const p = j.progress ?? 0;
      if (p > lastProgress + 5e-6) {
        lastProgress = p;
        lastProgressAt = Date.now();
      }
      if (videoStateRef.current === "playing") return;
      const elapsed = Date.now() - streamStartRef.current;
      if (elapsed > NO_DATA_SWITCH_MS && (j.progress ?? 0) === 0 && (j.speed ?? 0) === 0) {
        failover("No data from this server");
      } else if (
        videoStateRef.current === "loading" &&
        elapsed > TRICKLE_SWITCH_MS &&
        (j.progress ?? 0) === 0 &&
        (j.speed ?? 0) < 25_000
      ) {
        // data flows but a few KB/s will not produce playable pieces in time
        failover("This server is too slow");
      } else if (
        videoStateRef.current === "loading" &&
        elapsed > FIRST_DATA_SWITCH_MS &&
        (videoRef.current?.readyState ?? 0) === 0
      ) {
        // the swarm looks alive (speed > 0, pack progress creeping) but zero
        // media reached the element in 30s — it is downloading the wrong
        // pieces; this video will not start no matter how long we wait
        failover("This server is not delivering video data");
      } else if (
        videoStateRef.current === "loading" &&
        Date.now() - lastProgressAt > STALL_SWITCH_MS
      ) {
        // download has gone quiet for 40s and the video still can't start
        failover("This server has stopped making progress");
      } else if (elapsed > HARD_START_MS && videoStateRef.current === "loading") {
        // absolute ceiling: creeping trickles never hold the player forever
        failover("This server can't start in time");
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [streamUrl, activeServer, failover, videoNonce]);

  /* ---------------- stop torrents on switch / unmount ---------------- */
  useEffect(() => {
    const id = activeServer?.id ?? null;
    if (currentIdRef.current && currentIdRef.current !== id) stopId(currentIdRef.current);
    currentIdRef.current = id;
  }, [activeServer?.id, stopId]);
  useEffect(() => {
    return () => {
      if (currentIdRef.current) stopId(currentIdRef.current);
      // pre-warmed fallbacks have no player attached — free them too
      for (const id of warmedRef.current) {
        if (id !== currentIdRef.current) stopId(id);
      }
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
    const sv = servers[idx];
    // clicking a server the user marked dead revives it explicitly
    if (sv && deadIdxs.has(idx)) reviveServer(sv.id);
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
              title={`${deadIdxs.has(i) ? "⚠ marked dead — tap to retry\n" : ""}${s.releaseName}\n${s.seeders} seeders · ${fmtSize(s.sizeBytes)} · ${s.provider}\n${matchBadge.hint}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-red-600 text-white"
                  : tried.includes(i)
                    ? "bg-white/5 text-zinc-600 hover:bg-white/10"
                    : "bg-white/8 text-zinc-300 hover:bg-white/15 hover:text-white"
              } ${deadIdxs.has(i) ? "opacity-40" : ""}`}
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

      {/* Server audio language — picking one re-scans the indexers for dubs of
          that language and ranks matching servers first. Stays mounted while a
          language is pinned so "All" is always reachable, even after a scan
          that found nothing for it. */}
      {mounted && (langChips.length > 0 || serverLang !== "auto") && (
        <div
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5"
          role="group"
          aria-label="Server audio language"
          data-testid="server-language-row"
        >
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Lang
          </span>
          <button
            type="button"
            data-testid="lang-all"
            aria-pressed={serverLang === "auto"}
            onClick={() => {
              setServerLang("auto");
              if (serverLang !== "auto") setSearchNonce((n) => n + 1);
            }}
            title="No language filter — always play the best server"
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              serverLang === "auto"
                ? "bg-sky-600 text-white"
                : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
            }`}
          >
            All
          </button>
          {langChips.map((tag) => {
            const count = servers.filter((s) => {
              const tags = s.audioTags ?? [];
              return tags.includes(tag) || tags.includes("dual") || tags.includes("multi");
            }).length;
            const active = serverLang === tag;
            return (
              <button
                key={tag}
                type="button"
                data-testid={`lang-${tag}`}
                aria-pressed={active}
                onClick={() => {
                  setServerLang(tag);
                  // picking a language re-scans the indexers for dubs of it —
                  // "All" simply clears the filter over the current results
                  if (tag !== serverLang) setSearchNonce((n) => n + 1);
                }}
                title={`Only ${LANG_LABEL[tag] ?? tag} servers (${count} found)`}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-sky-600 text-white"
                    : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
                }`}
              >
                {LANG_LABEL[tag] ?? tag}
                <span className="ml-1 text-[9px] font-normal opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Subtitle language — rendered natively by the player (<track>) on both
          torrent and direct streams. "Auto" = English subs on Japanese audio.
          The CC button over the video opens the same menu. */}
      <div
        className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5"
        role="group"
        aria-label="Subtitle language"
        data-testid="subtitle-row"
      >
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
          <Captions className="h-3 w-3" />
          Subs
        </span>
        <button
          type="button"
          data-testid="sub-off"
          aria-pressed={subtitleLang === "off"}
          onClick={() => setSubtitleLang("off")}
          title="No subtitles"
          className={`flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            subtitleLang === "off"
              ? "bg-violet-600 text-white"
              : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
          }`}
        >
          Off
        </button>
        <button
          type="button"
          data-testid="sub-auto"
          aria-pressed={subtitleLang === "auto"}
          onClick={() => setSubtitleLang("auto")}
          title="English subtitles only while a Japanese-audio server plays"
          className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            subtitleLang === "auto"
              ? "bg-violet-600 text-white"
              : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
          }`}
        >
          Auto
          {subtitleLang === "auto" && activeSub && <span className="text-[9px]">● on</span>}
        </button>
        {/* pinned language is always visible — when this episode has no such
            track the chip dims and says so, instead of vanishing (anime fansub
            episodes rarely have OpenSubtitles community tracks for every
            language, which read as a broken selector) */}
        {subtitleLang !== "auto" && subtitleLang !== "off" && !subs.some((r) => r.lang === subtitleLang) && (
          <button
            type="button"
            data-testid={`sub-${subtitleLang}`}
            aria-pressed={false}
            onClick={() => setSubtitleLang("auto")}
            title={`${LANG_LABEL[subtitleLang] ?? subtitleLang} subtitles are not available for this ${
              type === "tv" ? "episode" : "title"
            } yet — tapping returns to Auto`}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-violet-500/40 px-2.5 py-1 text-[11px] font-semibold text-zinc-500 transition hover:text-zinc-300"
          >
            {LANG_LABEL[subtitleLang] ?? subtitleLang}
            <span className="text-[9px] font-normal uppercase">unavailable</span>
          </button>
        )}
        {subs.map((r) => {
          const active = subtitleLang === r.lang;
          return (
            <button
              key={r.lang}
              type="button"
              data-testid={`sub-${r.lang}`}
              aria-pressed={active}
              onClick={() => setSubtitleLang(r.lang)}
              title={`${r.langName}${r.fileName ? ` · ${r.fileName}` : ""}`}
              className={`flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-violet-600 text-white"
                  : "bg-white/8 text-zinc-400 hover:bg-white/15 hover:text-zinc-200"
              }`}
            >
              {r.langName}
            </button>
          );
        })}
        {subState === "loading" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading subtitles…
          </span>
        )}
        {subState === "ready" && subs.length === 0 && (
          <span className="shrink-0 text-[11px] text-zinc-600">
            No subtitles found for this {type === "tv" ? "episode" : "title"} yet
          </span>
        )}
        {subState === "error" && (
          <span className="shrink-0 text-[11px] text-zinc-600">Subtitles unavailable</span>
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
                  >
                    {activeSub && (
                      <track
                        key={activeSub.id}
                        kind="subtitles"
                        src={activeSub.src}
                        srcLang={activeSub.lang}
                        label={activeSub.langName}
                        default
                      />
                    )}
                  </video>
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <ShieldCheck className="h-3 w-3" />{" "}
                    {archive.kind === "tv" ? "Ad-free · Direct episode" : "Ad-free · Public domain"}
                  </div>
                  <SubtitleMenu
                    subs={subs}
                    subState={subState}
                    subtitleLang={subtitleLang}
                    setSubtitleLang={setSubtitleLang}
                    activeSub={activeSub}
                    emptyText={
                      type === "tv" ? "No subtitles found for this episode yet" : "No subtitles found for this title yet"
                    }
                  />
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
                      // playback actually started — any pipe-flake recovery
                      // that got us here succeeded; start counting fresh
                      pipeRemountsRef.current = 0;
                      setVideoState("playing");
                      setNeedsTap(false);
                    }}
                    onError={() => {
                      // a dead backend produces this on every remount — the
                      // watchdog reconnects, only treat it as a bad server
                      // when the backend answered recently
                      if (backendDownRef.current) setVideoState("error");
                      else failover("Stream failed on this server");
                    }}
                    className="h-full w-full bg-black"
                  >
                    {activeSub && (
                      <track
                        key={activeSub.id}
                        kind="subtitles"
                        src={activeSub.src}
                        srcLang={activeSub.lang}
                        label={activeSub.langName}
                        default
                      />
                    )}
                  </video>
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <ShieldCheck className="h-3 w-3" /> Ad-free · P2P direct
                  </div>
                  <SubtitleMenu
                    subs={subs}
                    subState={subState}
                    subtitleLang={subtitleLang}
                    setSubtitleLang={setSubtitleLang}
                    activeSub={activeSub}
                    emptyText={
                      type === "tv" ? "No subtitles found for this episode yet" : "No subtitles found for this title yet"
                    }
                  />
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
                  {status && (status.progress ?? 0) === 0 && (status.peers ?? 0) > 0 && (
                    <p className="text-[11px] text-zinc-500">
                      Contacting {status.peers} peers — fetching first pieces…
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
