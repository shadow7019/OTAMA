/**
 * Server-side BitTorrent engine (singleton across hot reloads).
 *
 * Downloads happen on the Node server (full DHT + TCP + UDP trackers, so we
 * reach normal BitTorrent swarms, not just WebRTC peers) and are re-served to
 * the browser as ordinary progressive HTTP video with Range support.
 * The browser never touches an ad-serving third party — zero iframes.
 */
import WebTorrent from "webtorrent";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* ---------- minimal structural types (webtorrent ships no usable types) ---------- */

export interface TorrentFile {
  name: string;
  /** path inside the torrent including folders (may contain S01/Season 2) */
  path?: string;
  length: number;
  index: number;
  /** byte offset of this file inside the torrent */
  offset: number;
  createReadStream(opts: { start: number; end: number }): NodeJS.ReadableStream;
}

export interface Torrent {
  infoHash: string;
  name: string;
  ready: boolean;
  progress: number;
  numPeers: number;
  downloadSpeed: number;
  pieceLength: number;
  files: TorrentFile[];
  destroy(opts?: { destroyStore?: boolean }, cb?: () => void): void;
  on(ev: string, cb: () => void): void;
  /** mark pieces as critical so they are fetched first (used for instant-start) */
  critical(start: number, end: number): void;
}

interface TorrentClient {
  torrents: Torrent[];
  add(magnet: string, opts: { path: string; announce?: string[] }, cb: (t: Torrent) => void): Torrent;
  get(infoHash: string): Torrent | null;
  on(ev: string, cb: (e?: unknown) => void): void;
  destroyed?: boolean;
}

/* ---------- config ---------- */

const TRACKERS = [
  // top public trackers (ngosang/trackerslist best) — obscure swarms (Indian
  // daily-show releases) only announce here, so broad coverage matters
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.skynetcloud.site:6969/announce",
  "udp://tracker.qu.ax:6969/announce",
  "udp://tracker.corpscorp.online:80/announce",
  "udp://tracker.ducks.party:1984/announce",
  "udp://tracker-udp.gbitt.info:80/announce",
  "udp://explodie.org:6969/announce",
  "udp://tracker.nyaa.vc:6969/announce",
  "udp://tracker.gmi.gd:6969/announce",
  "udp://tracker.peerfect.org:6969/announce",
  "http://tracker.dler.org:6969/announce",
  "http://tracker.openbittorrent.com/announce",
  "http://tracker.renfei.net:8080/announce",
  "https://tracker.tiny-vps.com:443/announce",
  "wss://tracker.openwebtorrent.com",
];

const DOWNLOAD_DIR = path.join(os.tmpdir(), "cinex-torrents");
const MAX_TORRENTS = 4;
const IDLE_DESTROY_MS = 30 * 60 * 1000;
const METADATA_TIMEOUT_MS = 40_000;

try {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
} catch {
  /* tmp dir may already exist */
}

/* ---------- engine state (survives Next.js hot reloads) ---------- */

interface EngineState {
  client: TorrentClient | null;
  meta: Map<string, { addedAt: number; lastAccess: number }>;
  sweeper: ReturnType<typeof setInterval> | null;
}

const g = globalThis as unknown as { __cinexTorrentEngine?: EngineState };

function state(): EngineState {
  if (!g.__cinexTorrentEngine) {
    g.__cinexTorrentEngine = { client: null, meta: new Map(), sweeper: null };
  }
  return g.__cinexTorrentEngine;
}

function getClient(): TorrentClient {
  const st = state();
  if (!st.client || st.client.destroyed) {
    st.client = new WebTorrent({ maxConns: 120 }) as unknown as TorrentClient;
    st.client.on("error", () => {
      /* per-torrent errors are handled where they surface */
    });
    if (!st.sweeper) {
      st.sweeper = setInterval(() => {
        try {
          sweep();
        } catch {
          /* keep the interval alive no matter what */
        }
      }, 60_000);
      st.sweeper.unref?.();
    }
  }
  return st.client;
}

function buildMagnet(infoHash: string, name: string): string {
  // NB: build manually — URLSearchParams percent-encodes the colons in
  // "urn:btih:" and webtorrent v3 then rejects the magnet as invalid.
  const parts = [`xt=urn:btih:${infoHash}`];
  if (name) parts.push(`dn=${encodeURIComponent(name)}`);
  for (const tr of TRACKERS) parts.push(`tr=${encodeURIComponent(tr)}`);
  return `magnet:?${parts.join("&")}`;
}

function waitForMetadata(client: TorrentClient, magnet: string): Promise<Torrent> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, torrent?: Torrent) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err || !torrent) reject(err ?? new Error("failed to add torrent"));
      else resolve(torrent);
    };
    const timer = setTimeout(
      () => finish(new Error("No peers responded for this torrent — it may have no seeders right now")),
      METADATA_TIMEOUT_MS
    );
    try {
      // webtorrent v3 returns the Torrent synchronously from add()
      const added = client.add(magnet, { path: DOWNLOAD_DIR, announce: TRACKERS }, (t) => {
        state().meta.set(t.infoHash, { addedAt: Date.now(), lastAccess: Date.now() });
        finish(null, t);
      }) as Torrent | null | undefined;
      if (added && typeof added.on === "function") {
        added.on("error", (e?: unknown) =>
          finish(e instanceof Error ? e : new Error("Torrent client error"))
        );
      }
    } catch (err) {
      finish(err instanceof Error ? err : new Error("failed to add torrent"));
    }
  });
}

/** Free capacity by destroying the least-recently-used torrents. */
function evictIfNeeded(client: TorrentClient, keepHash?: string) {
  const st = state();
  while (client.torrents.length >= MAX_TORRENTS) {
    let oldest: Torrent | null = null;
    let oldestTs = Infinity;
    for (const t of client.torrents) {
      if (t.infoHash === keepHash) continue;
      const ts = st.meta.get(t.infoHash)?.lastAccess ?? 0;
      if (ts < oldestTs) {
        oldestTs = ts;
        oldest = t;
      }
    }
    if (!oldest) break;
    try {
      oldest.destroy({ destroyStore: true });
    } catch {
      /* already gone */
    }
    st.meta.delete(oldest.infoHash);
  }
}

export function isValidInfoHash(id: string): boolean {
  return /^[0-9a-f]{40}$/i.test(id);
}

export function findTorrent(infoHash: string): Torrent | null {
  const torrents = state().client?.torrents ?? [];
  // NB: webtorrent v3's client.get() returns a Promise — scan the array instead
  return torrents.find((t) => t.infoHash === infoHash) ?? null;
}

/** Add (or reuse) a torrent and wait until its metadata is ready. */
export async function ensureTorrent(infoHash: string, displayName: string): Promise<Torrent> {
  if (!isValidInfoHash(infoHash)) throw new Error("Invalid torrent id");
  const client = getClient();
  const existing = findTorrent(infoHash);
  if (existing) {
    const m = state().meta.get(infoHash);
    if (m) m.lastAccess = Date.now();
    if (!existing.ready) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for torrent metadata")), 30_000);
        existing.on("ready", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return existing;
  }
  evictIfNeeded(client, infoHash);
  return waitForMetadata(client, buildMagnet(infoHash, displayName));
}

const VIDEO_EXT_SCORE: Record<string, number> = {
  mp4: 6,
  m4v: 5,
  webm: 5,
  mkv: 4,
  mov: 3,
  avi: 2,
  mpg: 1,
  mpeg: 1,
  wmv: 1,
  ts: 1,
  flv: 0,
};

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
  return m ? m[1] : "";
}

export interface EpisodeHint {
  season: number;
  episode: number;
}

/**
 * Does this file (including its folder path) look like the requested episode?
 * Returns 2 for a full SxxEyy match, 1 for an episode-only match, 0 for no.
 */
function epMatchScore(name: string, hint: EpisodeHint): 0 | 1 | 2 {
  const n = `${name}`.toLowerCase();
  let m = n.match(/\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/);
  if (m) return Number(m[1]) === hint.season && Number(m[2]) === hint.episode ? 2 : 0;
  m = n.match(/\b(\d{1,2})x(\d{1,3})\b/);
  if (m) return Number(m[1]) === hint.season && Number(m[2]) === hint.episode ? 2 : 0;
  const hasSeason = new RegExp(`\\b(?:s|season[\\s._-]*)0*${hint.season}\\b`).test(n);
  m = n.match(/\be(?:p)?[\s._-]*(\d{1,3})\b/);
  if (m) {
    if (Number(m[1]) !== hint.episode) return 0;
    return hasSeason ? 2 : 1;
  }
  m = n.match(/\bepisode[\s._-]*(\d{1,3})\b/);
  if (m) return Number(m[1]) === hint.episode ? 1 : 0;
  return 0;
}

/**
 * Movie collections ("It 2017 + Chapter Two 2019") — prefer the file whose
 * own name carries the requested year (±1). 1 = plausible year match.
 */
function yearMatchScore(name: string, year: number): 0 | 1 {
  const years = `${name}`.match(/\b(19|20)\d{2}\b/g) ?? [];
  return years.some((y) => Math.abs(Number(y) - year) <= 1) ? 1 : 0;
}

/**
 * Choose the most browser-playable video file in the torrent.
 * For season packs, `episodeHint` steers selection to the requested SxxEyy
 * file; for multi-year movie collections `yearHint` prefers the file carrying
 * the requested year — instead of just the biggest one.
 */
export function pickVideoFile(
  torrent: Torrent,
  hintIdx: number | null,
  episodeHint?: EpisodeHint | null,
  yearHint?: number | null
): { file: TorrentFile; index: number } {
  if (hintIdx !== null && hintIdx >= 0 && hintIdx < torrent.files.length) {
    const hinted = torrent.files[hintIdx];
    if (VIDEO_EXT_SCORE[extOf(hinted.name)] !== undefined) {
      return { file: hinted, index: hintIdx };
    }
  }
  let best: { file: TorrentFile; index: number; score: number } | null = null;
  for (let index = 0; index < torrent.files.length; index++) {
    const file = torrent.files[index];
    const name = file.path ?? file.name;
    const ext = extOf(file.name);
    const extScore = VIDEO_EXT_SCORE[ext];
    if (extScore === undefined) continue;
    if (file.length < 15 * 1024 * 1024) continue; // skip samples / intros
    if (/\bsample\b|\.nfo|\.url|extras?\//.test(name)) continue;
    // an exact SxxEyy / year-matched file outranks any other candidate;
    // when nothing matches we fall back to plain size/codec ranking
    const epScore = episodeHint ? epMatchScore(name, episodeHint) * 1e15 : 0;
    const yrScore = !episodeHint && yearHint ? yearMatchScore(name, yearHint) * 1e15 : 0;
    const score = epScore + yrScore + extScore * 1e12 + file.length; // prefer episode/year, then playable container, then biggest
    if (!best || score > best.score) best = { file, index, score };
  }
  if (best) return { file: best.file, index: best.index };
  // desperate fallback: largest file whatever it is
  let largestIdx = 0;
  torrent.files.forEach((f, i) => {
    if (f.length > torrent.files[largestIdx].length) largestIdx = i;
  });
  return { file: torrent.files[largestIdx], index: largestIdx };
}

/**
 * Ask the swarm to fetch the pieces around `byteStart` FIRST so the video can
 * start playing within seconds instead of waiting for rarest-first random
 * pieces (BitTorrent downloads the start of a file last by default).
 */
export function prioritizeRange(torrent: Torrent, file: TorrentFile, byteStart: number, bytes: number) {
  try {
    const pieceLen = torrent.pieceLength || 262144;
    const from = file.offset + byteStart;
    const to = from + Math.min(bytes, Math.max(file.length - byteStart, pieceLen));
    torrent.critical(Math.floor(from / pieceLen), Math.floor(to / pieceLen));
  } catch {
    /* priority is best-effort */
  }
}

export function contentTypeFor(name: string): string {
  switch (extOf(name)) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    case "mov":
      return "video/quicktime";
    default:
      return "video/mp4";
  }
}

export function stopTorrent(infoHash: string): boolean {
  const st = state();
  const t = findTorrent(infoHash);
  if (!t) return false;
  try {
    t.destroy({ destroyStore: true });
  } catch {
    /* already destroyed */
  }
  st.meta.delete(infoHash);
  return true;
}

/** Destroy idle torrents to free bandwidth, connections and disk. */
function sweep() {
  const st = state();
  const client = st.client;
  if (!client) return;
  const now = Date.now();
  for (const t of [...client.torrents]) {
    const last = st.meta.get(t.infoHash)?.lastAccess ?? now;
    if (now - last > IDLE_DESTROY_MS) stopTorrent(t.infoHash);
  }
}

export function engineStats(): { torrents: number; cacheDir: string } {
  const client = state().client;
  return { torrents: client?.torrents.length ?? 0, cacheDir: DOWNLOAD_DIR };
}
