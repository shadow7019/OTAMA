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
  Globe,
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
  WEB_SOURCES,
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
 * (ThePirateBay, Torrentio, YTS, EZTV …). We download it on our own backend
 * and stream it to the native <video> element — no third-party iframe,
 * therefore no pop-ups, no tab redirects, no injected ads.
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
  /** verified = exact title/episode match · pack = season pack · weak = title-only */
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
  /** false = the host's streaming engine itself is broken — environment, not swarm */
  engineOk?: boolean;
  engineError?: string;
  /** false = not a single peer has connected since server start: the network
   *  blocks torrent peer traffic and every source will fail */
  everConnectedPeers?: boolean;
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

/**
 * REBUILT PLAYER — one deterministic state machine, three rules:
 *
 *  1. START AT 2%: the <video> plays as soon as the browser has the first
 *     playable data (canplay fires at roughly the 2% mark). No artificial
 *     waiting for "enough" buffer.
 *  2. STICKY SERVER: once content is on screen (the element reported
 *     "playing") or 2% of the file has buffered, the server is LOCKED.
 *     Automatic switching is disabled — not for stalls, not for slow speeds,
 *     not for engine blips. The ONLY legal automatic switch is a CONFIRMED
 *     hard death: the engine reports the torrent gone after a reconnect
 *     attempt, the video errors out after the reconnect budget is spent, or
 *     playback is frozen 60s+ while unpaused after a reconnect attempt.
 *     Everything else reconnects the SAME warm stream (its pieces are
 *     already on this server) and explains itself in the banner.
 *  3. SEQUENTIAL, SLOW-FRIENDLY: one server at a time, generous windows —
 *     torrent swarms routinely need 30-60s to resolve metadata before the
 *     first byte flows. No parallel server spam, no rapid cycling; a switch
 *     needs evidence the server cannot work, and switches are spaced out.
 */
/** metadata never resolved after this long (engine's own timeout is 90s) */
const RESOLVE_MS = 105_000;
/** zero progress AND zero speed for this long after metadata resolved */
const NO_DATA_MS = 60_000;
/** data trickling below 25 KB/s and still zero progress after this long */
const SLOW_MS = 90_000;
/** swarm downloads but the video element parsed zero media — wrong pieces */
const WRONG_PIECES_MS = 120_000;
/** torrent never even registered with the engine (dead swarm) */
const NOT_FOUND_GRACE_MS = 25_000;
/** playing but frames frozen this long while unpaused (after a reconnect) */
const HARD_STALL_MS = 60_000;
/** anti-spam floor between automatic switches */
const MIN_SWITCH_GAP_MS = 25_000;
/** reconnect budget for the SAME stream (media errors, pipe flakes) */
const REMOUNT_BUDGET = 3;
/** content lock engages at this share of the file buffered (user rule: 2%) */
const LOCK_BUFFER = 0.02;

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
  lang: string;
  langName: string;
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

  /* ---------------- servers (torrent sources) ---------------- */
  const [servers, setServers] = useState<TorrentServer[]>([]);
  const [serversState, setServersState] = useState<"loading" | "ready" | "error">("loading");
  const [searchNonce, setSearchNonce] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [manualIdx, setManualIdx] = useState<number | "archive" | "trailer" | "web" | null>(null);
  // web embed servers (restored by request): user-picked third-party players.
  const [webSourceId, setWebSourceId] = useState<string | null>(null);
  const [webReloadNonce, setWebReloadNonce] = useState(0);
  const [webFrame, setWebFrame] = useState<"loading" | "ready" | "timeout">("loading");
  const [webHealth, setWebHealth] = useState<Record<string, "up" | "popup" | "down">>({});
  const [tried, setTried] = useState<number[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [videoState, setVideoState] = useState<"loading" | "playing" | "error">("loading");
  const [needsTap, setNeedsTap] = useState(false);
  const [status, setStatus] = useState<TorrentStatus | null>(null);
  const [videoNonce, setVideoNonce] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  /** automatic re-searches done for the CURRENT episode */
  const [autoRetries, setAutoRetries] = useState(0);
  /** automatic retry waves after "every server was tried" */
  const [autoWaves, setAutoWaves] = useState(0);

  /* ---------------- subtitles ---------------- */
  const [subs, setSubs] = useState<SubtitleRow[]>([]);
  const [subState, setSubState] = useState<"loading" | "ready" | "error">("loading");

  /* ---------------- archive.org direct fallback ---------------- */
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

  /* ---------------- refs (latest values for callbacks/intervals) ---------------- */
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const exhaustedRef = useRef(exhausted);
  exhaustedRef.current = exhausted;
  const triedRef = useRef(tried);
  triedRef.current = tried;
  const videoStateRef = useRef(videoState);
  videoStateRef.current = videoState;
  const manualIdxRef = useRef(manualIdx);
  manualIdxRef.current = manualIdx;
  /** STICKY LOCK: server id whose content is on screen (or ≥2% buffered).
   *  While set for the active server, automatic server switching is OFF —
   *  only confirmed hard death may advance (see advance()). */
  const lockedIdRef = useRef<string | null>(null);
  /** reconnect budget for the CURRENT stream — refilled on every onPlaying */
  const remountsRef = useRef(0);
  /** one "staying on this server" note per lock episode */
  const stickyNoteRef = useRef(false);
  /** timestamp of the last automatic switch — enforces the anti-spam floor */
  const lastFailoverAtRef = useRef(0);
  /** consecutive network-failed status polls — while set, failover is frozen */
  const backendDownRef = useRef(0);
  const connNoteRef = useRef(false);
  const streamStartRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  /** server ids already sent to /api/torrent/warm */
  const warmedRef = useRef<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const serverLangRef = useRef(serverLang);
  serverLangRef.current = serverLang;
  /** scan key of the last torrent scan — keeps the swarm on re-scans */
  const lastScanKeyRef = useRef<string | null>(null);
  /** web ids the automatic chain already opened */
  const autoWebTriedRef = useRef<Set<string>>(new Set());

  /* ---------------- derived: dead marks, language order, chips ---------------- */
  const deadIdxs = useMemo(() => {
    const s = new Set<number>();
    if (!mounted) return s;
    servers.forEach((sv, i) => {
      if (isServerDead(deadServers, sv.id)) s.add(i);
    });
    return s;
  }, [servers, deadServers, mounted]);

  /** play order: live servers first, matching the picked audio language;
   *  falls back to every live server when the filter would empty the list —
   *  the language filter can NEVER blank the server row. */
  const orderedIdxs = useMemo(() => {
    const all = servers.map((_, i) => i);
    const pick = (pool: number[]) => {
      if (serverLang === "auto") return pool;
      const matching = pool.filter((i) => {
        const tags = servers[i].audioTags ?? [];
        return tags.includes(serverLang) || tags.includes("dual") || tags.includes("multi");
      });
      return matching.length ? matching : pool;
    };
    const alive = all.filter((i) => !deadIdxs.has(i));
    const chosen = pick(alive);
    // every server dead-marked: swarms recover, so retry instead of a dead row
    return chosen.length ? chosen : pick(all);
  }, [servers, serverLang, deadIdxs]);
  const orderedIdxsRef = useRef(orderedIdxs);
  orderedIdxsRef.current = orderedIdxs;

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

  const activeServer = activeIdx !== null ? servers[activeIdx] ?? null : null;
  const isArchive = manualIdx === "archive" && archiveState === "found" && !!archive;
  const showTrailer = manualIdx === "trailer";
  const isWeb = manualIdx === "web" && !!webSourceId;

  /* ---------------- subtitle selection ---------------- */
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

  /* ---------------- core actions ---------------- */
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

  /** Reconnect the CURRENT server's warm stream — a fresh range request picks
   *  up from the pieces already downloaded. Used for every recovery; never
   *  switches servers. Returns false when the reconnect budget is spent. */
  const recoverSameStream = useCallback((why: string): boolean => {
    if (remountsRef.current >= REMOUNT_BUDGET) return false;
    remountsRef.current += 1;
    setVideoState("loading");
    setVideoNonce((n) => n + 1);
    streamStartRef.current = Date.now();
    return true;
  }, []);

  /**
   * The ONLY path an automatic server change can take. While the sticky lock
   * is engaged, every call without `hard: true` just shows a banner — the
   * user decides via the server chips. Hard death (confirmed by a failed
   * reconnect attempt) is the single exception.
   */
  const advance = useCallback(
    (reason: string, opts?: { hard?: boolean }) => {
      if (lockedIdRef.current !== null && !opts?.hard) {
        if (!stickyNoteRef.current) {
          stickyNoteRef.current = true;
          setBanner(
            `${reason} — staying on this server. Auto-switch is off while content is playing; pick another server below to switch.`
          );
        }
        return;
      }
      // backend unreachable: "every server failed" would be an illusion
      if (backendDownRef.current) return;
      if (exhaustedRef.current) return;
      if (Date.now() - lastFailoverAtRef.current < MIN_SWITCH_GAP_MS) return;
      const cur = activeIdxRef.current;
      const list = serversRef.current;
      const failed = cur !== null ? list[cur] : null;
      const triedNext = new Set(triedRef.current);
      if (cur !== null) triedNext.add(cur);
      triedRef.current = [...triedNext];
      setTried([...triedNext]);
      if (failed) {
        // idle (not destroy): pieces stay — a revived server resumes instantly
        stopId(failed.id, "idle");
        markDeadServers([failed.id]);
      }
      const next = orderedIdxsRef.current.find((i) => i !== cur && !triedNext.has(i));
      if (next !== undefined) {
        remountsRef.current = 0;
        stickyNoteRef.current = false;
        lastFailoverAtRef.current = Date.now();
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
    if (langAtScan !== "auto") params.set("lang", langAtScan);
    fetch(`/api/torrent/search?${params.toString()}`)
      .then((r) => r.json())
      .then(
        (j: {
          results?: TorrentServer[];
          providerStatus?: { name: string; ms: number; count: number; ok: boolean; error?: string }[];
        }) => {
          if (cancelled) return;
          let results = Array.isArray(j.results) ? j.results : [];
          if (!results.length && prevCount > 0) {
            // keep the previous swarm and the stream that is already playing —
            // a language no indexer serves must not empty the row
            setServersState("ready");
            setBanner(
              langAtScan !== "auto"
                ? `No ${LANG_LABEL[langAtScan] ?? langAtScan} servers found — showing all ${prevCount}`
                : `Re-scan found nothing new — keeping all ${prevCount} servers`,
            );
            return;
          }
          if (!results.length) {
            const stats = Array.isArray(j.providerStatus) ? j.providerStatus : [];
            const dead = stats.filter((s) => !s.ok);
            if (stats.length && dead.length > 0 && dead.length >= stats.length - dead.length) {
              setBanner(
                `${dead.length} of ${stats.length} torrent sources were unreachable from this network (${dead
                  .map((s) => s.name)
                  .join(", ")}) — the rest found nothing for this title.`,
              );
            }
          }
          // a re-scan must never yank a stream that works: keep the current
          // server unless it vanished AND the user explicitly changed language
          const cur = activeIdxRef.current;
          const curSv = cur !== null ? serversRef.current[cur] : null;
          let keepIdx: number | null = null;
          const stillWatching =
            videoStateRef.current === "playing" || videoStateRef.current === "loading";
          if (rescan && curSv && stillWatching) {
            const tags = curSv.audioTags ?? [];
            const langOk =
              langAtScan === "auto" ||
              tags.includes(langAtScan) ||
              tags.includes("dual") ||
              tags.includes("multi");
            const idx = langOk ? results.findIndex((r) => r.id === curSv.id) : -1;
            if (idx >= 0) {
              keepIdx = idx;
            } else if (langOk) {
              // re-scan dropped our server (indexer flake) but it is mid-watch
              // — keep it at the end of the row instead of killing it
              results = [...results, curSv];
              keepIdx = results.length - 1;
            }
          }
          // identical swarm: keep the chip order the user already sees
          if (rescan) {
            const prev = serversRef.current;
            const nextById = new Map(results.map((s) => [s.id, s]));
            if (
              prev.length > 0 &&
              prev.length === results.length &&
              prev.every((s) => nextById.has(s.id))
            ) {
              results = prev.map((old) => nextById.get(old.id) ?? old);
              if (curSv && keepIdx !== null) keepIdx = results.findIndex((s) => s.id === curSv.id);
            }
          }
          setServers(results);
          setServersState("ready");
          if (rescan) setActiveIdx(keepIdx);
        }
      )
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

  /* ---------------- web embed health probes ---------------- */
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    for (const s of WEB_SOURCES) {
      const probe = type === "tv" ? s.tv(target.item.id, 1, 1) : s.movie(target.item.id);
      fetch(`/api/embed-check?url=${encodeURIComponent(probe)}`)
        .then((r) => r.json())
        .then((j: { ok?: boolean; frameable?: boolean }) => {
          if (cancelled) return;
          setWebHealth((prev) => ({
            ...prev,
            [s.id]: !j.ok ? "down" : j.frameable === false ? "popup" : "up",
          }));
        })
        .catch(() => {
          if (!cancelled) setWebHealth((prev) => ({ ...prev, [s.id]: "down" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [target, type]);

  /* per-episode reset for the automatic retry counters */
  useEffect(() => {
    setAutoRetries(0);
    setAutoWaves(0);
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

  /* ---------------- auto-pick the best untried server (BEFORE playback) ---
   * This is the only automatic chooser, and it only runs while nothing is
   * connected yet. Once a stream is locked, restoration — never re-choice. */
  useEffect(() => {
    if (serversState !== "ready") return;
    if (manualIdx !== null || activeIdx !== null || exhausted) return;
    if (lockedIdRef.current) {
      // content lock engaged but activeIdx was nulled by a re-scan landing on
      // a transient state: restore THAT server — picking a different one here
      // is exactly the "random switch" this player must never do
      const id = lockedIdRef.current;
      const idx = serversRef.current.findIndex((s) => s.id === id);
      if (idx >= 0) {
        setActiveIdx(idx);
        return;
      }
      lockedIdRef.current = null;
    }
    const idx = orderedIdxs.find((i) => !tried.includes(i));
    if (idx !== undefined) {
      setActiveIdx(idx);
      setVideoState("loading");
      remountsRef.current = 0;
      streamStartRef.current = Date.now();
    } else {
      setExhausted(true);
    }
  }, [serversState, orderedIdxs, tried, activeIdx, manualIdx, exhausted]);

  /* ---------------- pre-warm exactly ONE next candidate ----------------
   * Metadata resolution (15–25 s) is the whole startup cost. Warming the
   * single next-in-line (idled — pulls no data) keeps failover fast without
   * the parallel server spam the player used to do. Frozen while locked. */
  useEffect(() => {
    if (serversState !== "ready" || !servers.length) return;
    if (lockedIdRef.current) return;
    const cand = orderedIdxs.find((i) => i !== activeIdx && !tried.includes(i));
    const s = cand !== undefined ? servers[cand] : undefined;
    if (!s || warmedRef.current.has(s.id)) return;
    warmedRef.current.add(s.id);
    fetch("/api/torrent/warm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [{ id: s.id, dn: s.releaseName }] }),
    }).catch(() => {});
  }, [serversState, servers, orderedIdxs, activeIdx, tried]);

  /* ---------------- Otama Direct for episodes with no torrent sources ---- */
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
    const hints =
      type === "tv"
        ? `&season=${season}&episode=${episode}`
        : `&year=${getYear(target.item)}`;
    return `/api/torrent/stream?id=${activeServer.id}&dn=${encodeURIComponent(activeServer.releaseName)}${file}${hints}`;
  }, [activeServer, type, season, episode, target]);

  useEffect(() => {
    streamStartRef.current = Date.now();
    setStatus(null);
    setNeedsTap(false);
  }, [streamUrl, videoNonce]);

  /* seconds counter while connecting — makes the patient check visible */
  const [checkTick, setCheckTick] = useState(0);
  useEffect(() => {
    setCheckTick(0);
    if (videoState !== "loading") return;
    const iv = setInterval(() => setCheckTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [videoState, streamUrl, videoNonce]);

  /* ---------------- keep the chosen subtitle track showing ---------------- */
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

  /* ---------------- live status + watchdog (THE RULES) ----------------
   * 2s poll. One effect, two clearly separated phases:
   *  · LOCKED (content on screen / ≥2% buffered): UI updates + same-stream
   *    recovery. Automatic switching is off; only CONFIRMED hard death
   *    (reconnect already tried and failed) may advance.
   *  · CONNECTING: patient sequential checks — every threshold only fires on
   *    evidence the server cannot work. Slow is normal; only death switches. */
  useEffect(() => {
    if (!streamUrl || !activeServer || manualIdxRef.current === "web") {
      setStatus(null);
      return;
    }
    let cancelled = false;
    let seenAlive = false;
    let notFoundPolls = 0;
    let remountedOnNotFound = false;
    let lastProgress = -1;
    let readyAt: number | null = null;
    let lastCt = -1;
    let lastCtAt = Date.now();
    let ctStallHandled = false;

    const tick = async () => {
      if (cancelled) return;
      let j: TorrentStatus | null = null;
      try {
        const r = await fetch(`/api/torrent/status?id=${activeServer.id}`, {
          signal: AbortSignal.timeout(8000),
        });
        j = await r.json();
      } catch {
        if (cancelled) return;
        // status failed — is the whole origin gone, or just this response?
        let originAlive = false;
        try {
          await fetch("/", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(4000) });
          originAlive = true;
        } catch {
          /* origin unreachable — real outage below */
        }
        if (originAlive) {
          // pipe flake: reconnect the SAME stream, never switch servers
          if (videoStateRef.current !== "playing") recoverSameStream("pipe");
          return;
        }
        backendDownRef.current = Math.min(backendDownRef.current + 1, 3);
        if (backendDownRef.current >= 2) {
          setBanner("Connection to the streaming server was lost — reconnecting…");
        }
        return; // transient outage — no failover, no dead marks
      }
      if (cancelled || !j) return;
      // engine broken on this host: every server would report not-found and
      // switching would burn the strip. Say what is wrong; hold position.
      if (j.engineOk === false) {
        setBanner(
          j.engineError
            ? `Streaming engine unavailable on this host — ${j.engineError}`
            : "Streaming engine unavailable on this host — torrent playback cannot start here",
        );
        return;
      }
      if (backendDownRef.current) {
        backendDownRef.current = 0;
        setBanner(null);
      }
      setStatus(j);

      /* lock engagement: content on screen, or ≥2% of the file buffered */
      if (
        lockedIdRef.current === null &&
        ((j.progress ?? 0) >= LOCK_BUFFER || videoStateRef.current === "playing")
      ) {
        lockedIdRef.current = activeServer.id;
      }
      const locked = lockedIdRef.current === activeServer.id;

      if (locked && videoStateRef.current === "playing") {
        /* ================= PLAYING: sticky phase ================= */
        const v = videoRef.current;
        if (v && !v.paused && !v.error) {
          if (v.currentTime !== lastCt) {
            lastCt = v.currentTime;
            lastCtAt = Date.now();
            ctStallHandled = false;
          } else if (v.readyState < 3 && Date.now() - lastCtAt > HARD_STALL_MS && !ctStallHandled) {
            // frozen 60s+ unpaused: reconnect the same warm stream first —
            // switching only if the reconnect budget is spent (hard death)
            ctStallHandled = true;
            if (!recoverSameStream("stall")) {
              advance("Stream stalled and could not recover", { hard: true });
            }
            return;
          }
        }
        if (j.found === false) {
          // engine lost the torrent (restart): 3 polls ≈ 6s, then ONE reconnect
          // — the stream request re-creates the torrent. Still gone after that:
          // confirmed death, the single legal mid-content switch.
          notFoundPolls += 1;
          if (notFoundPolls >= 3) {
            if (!remountedOnNotFound) {
              remountedOnNotFound = true;
              recoverSameStream("stream lost");
              return;
            }
            advance("This server lost the stream", { hard: true });
          }
        } else {
          notFoundPolls = 0;
          remountedOnNotFound = false;
        }
        return;
      }

      /* ================= CONNECTING: patient phase ================= */
      if (j.found === false) {
        if (
          j.everConnectedPeers === false &&
          !connNoteRef.current &&
          Date.now() - streamStartRef.current > 60_000
        ) {
          connNoteRef.current = true;
          setBanner(
            "Torrent peers cannot be reached from this server's network (no peer connection since startup) — every source will fail here. Playback needs a host or network that allows peer connections.",
          );
        }
        if (seenAlive) {
          notFoundPolls += 1;
          if (notFoundPolls >= 2) advance("This server dropped the stream");
        } else if (Date.now() - streamStartRef.current > NOT_FOUND_GRACE_MS) {
          // never registered at all — the swarm is dead, not slow
          advance("This server is not responding");
        }
        return;
      }
      seenAlive = true;
      notFoundPolls = 0;
      // metadata still resolving: pieces cannot flow yet. Thin swarms take
      // 30-60s+ — killing slow-to-resolve torrents just cycled the player.
      if (j.ready === false) {
        if (Date.now() - streamStartRef.current > RESOLVE_MS) {
          advance("This server is taking too long to resolve");
        }
        return;
      }
      if (readyAt === null) readyAt = Date.now();
      const p = j.progress ?? 0;
      if (p > lastProgress + 5e-6) lastProgress = p;
      if (videoStateRef.current === "playing") return; // lock branch next tick
      const dataElapsed = Date.now() - (readyAt ?? streamStartRef.current);
      if (p === 0 && (j.speed ?? 0) === 0 && dataElapsed > NO_DATA_MS) {
        advance("No data from this server");
      } else if (p === 0 && (j.speed ?? 0) > 0 && (j.speed ?? 0) < 25_000 && dataElapsed > SLOW_MS) {
        advance("This server is too slow");
      } else if (p > 0 && (videoRef.current?.readyState ?? 0) === 0 && dataElapsed > WRONG_PIECES_MS) {
        // downloading but zero media parsed — reconnect once for a fresh range
        if (!recoverSameStream("wrong pieces")) {
          advance("This server is not delivering video data");
        }
      }
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [streamUrl, activeServer, advance, recoverSameStream, videoNonce]);

  /* ---------------- stop torrents on switch / unmount ---------------- */
  useEffect(() => {
    const id = activeServer?.id ?? null;
    if (currentIdRef.current && currentIdRef.current !== id) stopId(currentIdRef.current);
    currentIdRef.current = id;
  }, [activeServer?.id, stopId]);
  // the lock describes the CURRENT stream: a new server starts unlocked with
  // a fresh recovery budget
  useEffect(() => {
    lockedIdRef.current = null;
    remountsRef.current = 0;
    stickyNoteRef.current = false;
  }, [activeServer?.id]);
  useEffect(() => {
    return () => {
      if (currentIdRef.current) stopId(currentIdRef.current);
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

  /* ---------------- auto-refresh episodes while open ---------------- */
  const epRefreshRef = useRef(0);
  useEffect(() => {
    if (!target || type !== "tv") return;
    const refresh = () => {
      if (Date.now() - epRefreshRef.current < 90_000) return;
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

  /* ---------------- web embed frame bookkeeping ----------------
   * key change → overlay back to "loading"; 20s without onLoad → timeout */
  const webKey = useMemo(
    () =>
      target
        ? `${target.item.id}-${webSourceId ?? "none"}-${type === "tv" ? `${season}-${episode}` : "m"}-${webReloadNonce}`
        : "none",
    [target, webSourceId, type, season, episode, webReloadNonce]
  );
  useEffect(() => {
    setWebFrame("loading");
  }, [webKey]);
  useEffect(() => {
    if (!isWeb || webFrame !== "loading") return;
    const t = setTimeout(() => setWebFrame((s) => (s === "loading" ? "timeout" : s)), 20_000);
    return () => clearTimeout(t);
  }, [isWeb, webKey, webFrame]);

  /* ---------------- auto-research when an episode has no sources yet ------ */
  const seasonsList = (details?.seasons ?? []).filter(
    (s) => s.season_number > 0 && s.episode_count > 0
  );
  const maxEpisode =
    episodes.length ||
    details?.seasons?.find((s) => s.season_number === season)?.episode_count ||
    1;
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
  const noSourcesYet = serversState === "ready" && servers.length === 0;
  const episodeAired =
    type !== "tv" || !currentEpisode?.air_date || currentEpisode.air_date <= todayYmd;
  useEffect(() => {
    if (!noSourcesYet || !episodeAired || autoRetries >= 5) return;
    if (manualIdx === "archive" && archiveState === "found") return;
    if (manualIdx === "web") return;
    const t = setTimeout(() => {
      setAutoRetries((n) => n + 1);
      setSearchNonce((n) => n + 1);
    }, 90_000);
    return () => clearTimeout(t);
  }, [noSourcesYet, episodeAired, autoRetries, manualIdx, archiveState]);

  /* ---------------- derived: no-sources flag ---------------- */
  const noSources =
    (serversState === "ready" && servers.length === 0) || serversState === "error";
  /** name of the active web embed (null when none) — for the timeout chain */
  const webSourceName = webSourceId
    ? WEB_SOURCES.find((s) => s.id === webSourceId)?.name ?? null
    : null;

  /* ---------------- auto-open the best web embed (only before playback) ---
   * Fires when every torrent server was tried or none were found, and ONLY
   * while nothing is locked/playing — a playing torrent is never yanked. */
  const autoOpenNextWeb = (reason: string) => {
    if (lockedIdRef.current) return false;
    const rank = (h?: "up" | "popup" | "down") =>
      h === "up" ? 0 : h === "popup" ? 1 : h === "down" ? 2 : 1.5;
    const candidates = WEB_SOURCES.map((s, i) => ({ s, i, r: rank(webHealth[s.id]) }))
      .filter((c) => !autoWebTriedRef.current.has(c.s.id) && c.r < 2)
      .sort((a, b) => a.r - b.r || a.i - b.i);
    const next = candidates[0];
    if (!next) return false;
    autoWebTriedRef.current.add(next.s.id);
    if (activeServer) stopId(activeServer.id);
    setManualIdx("web");
    setWebSourceId(next.s.id);
    setExhausted(false);
    setWebFrame("loading");
    setBanner(`${reason} — auto-opened ${next.s.name} (web). Ads play on their page.`);
    return true;
  };
  useEffect(() => {
    if (serversState === "loading" || isWeb || isArchive || showTrailer) return;
    if (exhausted) autoOpenNextWeb("Every torrent server was tried");
    else if (noSources && mounted) autoOpenNextWeb("No torrent server found for this title");
  }, [exhausted, noSources, serversState, isWeb, isArchive, showTrailer, mounted]);
  // chain within web servers: an embed that never loaded hands playback on
  useEffect(() => {
    if (webFrame !== "timeout" || !isWeb) return;
    autoOpenNextWeb(`${webSourceName ?? "This web server"} did not load`);
  }, [webFrame, isWeb, webHealth]);

  /* ---------------- exhausted → one patient retry wave ---------------- */
  useEffect(() => {
    if (!exhausted || !target || manualIdx !== null || autoWaves >= 2) return;
    setBanner(
      `Every server was tried — retrying all of them automatically in 75 s (round ${autoWaves + 2} of 3). Swarms change by the minute…`,
    );
    const t = setTimeout(() => {
      setAutoWaves((w) => w + 1);
      setTried([]);
      triedRef.current = [];
      setExhausted(false);
      setManualIdx(null);
      setActiveIdx(null);
      setVideoState("loading");
      setStatus(null);
      setBanner(`Retrying all servers (round ${autoWaves + 2} of 3)…`);
    }, 75_000);
    return () => clearTimeout(t);
  }, [exhausted, target, manualIdx, autoWaves]);

  if (!target) return null;

  /* ---------------- user actions ---------------- */
  const item = target.item;
  const title = getTitle(item);
  const webSource = WEB_SOURCES.find((s) => s.id === webSourceId) ?? null;
  const webSrc = webSource
    ? type === "tv"
      ? webSource.tv(item.id, season, episode)
      : webSource.movie(item.id)
    : null;

  const goEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    setShowEpisodes(false);
  };
  const nextEpisode = () => {
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

  const selectTorrent = (idx: number) => {
    const sv = servers[idx];
    if (sv && deadIdxs.has(idx)) reviveServer(sv.id);
    if (idx === activeIdx) {
      setVideoState("loading");
      setVideoNonce((n) => n + 1);
      remountsRef.current = 0;
      streamStartRef.current = Date.now();
      return;
    }
    setManualIdx(idx);
    setExhausted(false);
    setVideoState("loading");
    setActiveIdx(idx);
    remountsRef.current = 0;
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

  const selectWeb = (id: string) => {
    autoWebTriedRef.current.add(id);
    if (manualIdx === "web" && webSourceId === id) {
      setWebReloadNonce((n) => n + 1);
      return;
    }
    if (activeServer) stopId(activeServer.id);
    setManualIdx("web");
    setWebSourceId(id);
    setExhausted(false);
    setBanner(null);
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
    remountsRef.current = 0;
    streamStartRef.current = Date.now();
  };

  /* ---------------- derived render state ---------------- */
  const showFailPanel =
    !noSources &&
    !isWeb &&
    ((exhausted && !isArchive && !showTrailer) ||
      (videoState === "error" && exhausted && !isArchive && !showTrailer));
  const showNoSourcePanel =
    noSources && !isWeb && !isArchive && !showTrailer && archiveState !== "found";

  const downloading = !!status && (status.progress ?? 0) < 0.999;
  const videoKey = `${streamUrl ?? "none"}-${videoNonce}`;

  /* 2% START: canplay = the browser has the first playable chunk (≈2%).
     Fire play() immediately — no artificial waiting for a bigger buffer. */
  const handleCanPlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setVideoState((s) => (s === "loading" ? "playing" : s));
    const v = e.currentTarget;
    if (v.paused) {
      v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
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

      {/* Server strip — group 1: AD-FREE sources */}
      <div
        className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5"
        role="group"
        aria-label="Ad-free servers (torrent sources and direct streams)"
      >
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-600/40">
          <ShieldCheck className="h-3 w-3" /> Ad-free
        </span>

        <button
          type="button"
          onClick={selectAuto}
          title="Automatically picks the best-seeded source; once content plays it stays on that server"
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

      {/* Server strip — group 2: AD-SUPPORTED web embeds (opt-in) */}
      <div
        className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2 md:px-5"
        role="group"
        aria-label="Ad-supported web servers (contain ads)"
      >
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-600/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-600/40">
          <Globe className="h-3 w-3" /> Ads
        </span>
        {WEB_SOURCES.map((ws) => {
          const active = isWeb && webSourceId === ws.id;
          const h = webHealth[ws.id];
          return (
            <button
              key={ws.id}
              type="button"
              onClick={() => selectWeb(ws.id)}
              title={
                h === "up"
                  ? `${ws.name} — reachable and embeddable (contains ads)`
                  : h === "popup"
                    ? `${ws.name} — reachable but may open pop-ups instead of embedding`
                    : h === "down"
                      ? `${ws.name} — unreachable right now`
                      : `${ws.name} — ad-supported web player (contains ads)`
              }
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-amber-600 text-white"
                  : "bg-white/8 text-zinc-300 hover:bg-white/15 hover:text-white"
              } ${h === "down" ? "opacity-40" : ""}`}
            >
              <Globe className="h-3 w-3" />
              {ws.name}
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  h === "up"
                    ? "bg-emerald-400"
                    : h === "popup"
                      ? "bg-amber-400"
                      : h === "down"
                        ? "bg-zinc-600"
                        : "bg-zinc-700"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Server audio language — re-scans for dubs of that language and ranks
          matching servers first. NEVER yanks a playing stream and can never
          empty the server row. */}
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
                  if (tag !== serverLang) setSearchNonce((n) => n + 1);
                }}
                title={`Prefer ${LANG_LABEL[tag] ?? tag} servers (${count} found) — the stream keeps playing while servers re-rank`}
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

      {/* Subtitle language row */}
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

      {/* banner */}
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
              {/* ---------- web embed servers ---------- */}
              {isWeb && webSrc && webSource ? (
                <div className="absolute inset-0">
                  <iframe
                    key={webKey}
                    src={webSrc}
                    title={`${title} — ${webSource.name}`}
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full border-0 bg-black"
                    onLoad={() => setWebFrame((s) => (s === "loading" ? "ready" : s))}
                  />
                  {webFrame === "loading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90">
                      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                      <p className="text-xs text-zinc-400">Loading {webSource.name}…</p>
                    </div>
                  )}
                  {webFrame === "timeout" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center">
                      <AlertTriangle className="h-8 w-8 text-amber-400" />
                      <p className="text-sm font-bold text-white">{webSource.name} did not load</p>
                      <p className="max-w-sm text-xs text-zinc-400">
                        The provider may be down or blocking embedding. Pick another server
                        below, or re-tap the same chip to reload it.
                      </p>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-amber-600/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Globe className="h-3 w-3" /> Web · {webSource.name} · ads play on their page
                  </div>
                </div>
              ) : showTrailer && trailer ? (
                <iframe
                  key={trailer.key}
                  src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1`}
                  title={`${title} trailer`}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : isArchive && archive ? (
                /* ---------- Otama Direct ---------- */
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
                /* ---------- torrent stream ---------- */
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
                      // content is on screen: the sticky lock engages, the
                      // reconnect budget refills — no automatic switching now
                      lockedIdRef.current = activeServer?.id ?? null;
                      remountsRef.current = 0;
                      stickyNoteRef.current = false;
                      setVideoState("playing");
                      setNeedsTap(false);
                    }}
                    onError={() => {
                      // a dead backend produces this on every remount — the
                      // watchdog reconnects; treat as a bad server only when
                      // the backend answered recently
                      if (backendDownRef.current) {
                        setVideoState("error");
                      } else if (!recoverSameStream("media error")) {
                        // reconnect budget spent with content on screen:
                        // confirmed hard death — the one legal switch
                        advance("Stream failed on this server", { hard: true });
                      }
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

              {/* ---------- tap to play (autoplay blocked) ---------- */}
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
                  {checkTick > 0 && (
                    <p className="text-[11px] text-zinc-500">
                      {status && status.found && status.ready === false
                        ? `Resolving this torrent's swarm — ${checkTick}s (quiet swarms can take up to 90s; it only switches if this one is truly dead)`
                        : `Checking this server — ${checkTick}s · playback starts at ~2% buffer and the server will not be switched while you watch`}
                    </p>
                  )}
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
                      onClick={() => advance("Skipped", { hard: true })}
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
                      We searched ThePirateBay, Torrentio, TorrentsCSV, BitSearch, SolidTorrents, EZTV,
                      YTS and archive.org — no healthy source for it right now. Brand-new episodes of
                      daily shows usually surface within hours to a few days. The episode list and
                      servers refresh automatically, so simply retry later.
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
                        {formatDate(latestAired.air_date) || "recently"}) — try it, older episodes
                        are usually seeded first
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
                  Playback starts at ~2% buffer and <span className="font-semibold text-zinc-400">stays on the
                  server that delivered it</span> — no automatic switching while you watch. Direct P2P
                  stream on our own player —{" "}
                  <span className="text-emerald-400">no ad networks, ever</span>.
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
