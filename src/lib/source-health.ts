/**
 * Torrent source health analyzer.
 *
 * Runs a lightweight REAL query against every torrent provider (the same
 * endpoints the search uses), classifies each as ok / degraded (reachable
 * but empty) / down, measures latency and keeps a rolling history so the UI
 * can show which sources are actually working right now — and which have
 * been flaky over time. Real search telemetry feeds the same history, so
 * the analysis reflects production traffic, not just synthetic probes.
 *
 * State lives in process memory: one server instance, reset on deploy —
 * exactly the granularity "which mirror is up right now" needs.
 */

export type SourceState = "ok" | "degraded" | "down";

export interface SourceStatus {
  name: string;
  /** what content the source is useful for */
  role: string;
  state: SourceState;
  latencyMs: number;
  /** rows returned by the probe query */
  results: number;
  /** mirror / endpoint that actually answered (rotating sources) */
  host?: string;
  error?: string;
  checkedAt: number;
  /** share of recent runs that produced results (0-100, null when <2 runs) */
  uptimePct: number | null;
  runs: number;
}

export interface SourceAnalysis {
  sources: SourceStatus[];
  checkedAt: number;
  durationMs: number;
  /** true when served from the TTL cache */
  cached: boolean;
  summary: { ok: number; degraded: number; down: number; total: number };
}

/* ---------- history ---------- */

interface HistoryEntry {
  state: SourceState;
  ms: number;
}

const HISTORY_LIMIT = 20;
const ANALYSIS_TTL = 5 * 60 * 1000;

const history = new Map<string, HistoryEntry[]>();

function pushHistory(name: string, state: SourceState, ms: number): void {
  const list = history.get(name) ?? [];
  list.push({ state, ms });
  if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
  history.set(name, list);
}

function uptimeFor(name: string): { pct: number | null; runs: number } {
  const list = history.get(name);
  if (!list || list.length === 0) return { pct: null, runs: 0 };
  const ok = list.filter((e) => e.state !== "down").length;
  return { pct: Math.round((ok / list.length) * 100), runs: list.length };
}

/** Feed real-search telemetry (from /api/torrent/search) into the history. */
export function recordSearchStats(stats: { name: string; count: number; ok: boolean }[]): void {
  for (const s of stats) {
    pushHistory(s.name, !s.ok ? "down" : s.count > 0 ? "ok" : "degraded", 0);
  }
}

/* ---------- probes ---------- */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, timeoutMs: number, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: { accept, "user-agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

interface ProbeResult {
  results: number;
  host?: string;
}

async function firstHost(
  hosts: string[],
  urlOf: (host: string) => string,
  parse: (body: string) => number
): Promise<ProbeResult> {
  let lastErr: unknown = null;
  for (const host of hosts) {
    try {
      const body = await fetchWithTimeout(urlOf(host), 9000, "application/json,text/html");
      return { results: parse(body), host };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("all mirrors failed");
}

const PROBE_ORDER = [
  "Torrentio",
  "ThePirateBay",
  "YTS",
  "EZTV",
  "BitSearch",
  "TorrentsCSV",
  "Nyaa",
] as const;

const ROLES: Record<(typeof PROBE_ORDER)[number], string> = {
  Torrentio: "movies · tv · anime",
  ThePirateBay: "movies · tv",
  YTS: "movies",
  EZTV: "tv",
  BitSearch: "movies · tv",
  TorrentsCSV: "movies · tv",
  Nyaa: "anime",
};

async function probe(name: string): Promise<ProbeResult> {
  switch (name) {
    case "Torrentio": {
      // popular movie — a healthy Torrentio always carries streams for it
      const body = await fetchWithTimeout(
        "https://torrentio.strem.fun/stream/movie/tt1375666.json",
        9000,
        "application/json"
      );
      return { results: (JSON.parse(body).streams ?? []).length };
    }
    case "ThePirateBay": {
      const body = await fetchWithTimeout(
        "https://apibay.org/q.php?q=inception&cat=",
        8000,
        "application/json"
      );
      const rows = JSON.parse(body) as { name?: string }[];
      const rowsArr = Array.isArray(rows) ? rows : [];
      return { results: rowsArr.filter((r) => r.name && r.name !== "No results").length };
    }
    case "YTS": {
      return firstHost(
        ["yts.rs", "yts.mx", "yts.bz"],
        (h) => `https://${h}/api/v2/list_movies.json?query_term=inception&limit=10&sort_by=seeders`,
        (body) => ((JSON.parse(body).data?.movies ?? []) as unknown[]).length
      );
    }
    case "EZTV": {
      return firstHost(
        ["eztvx.to", "eztv.wf", "eztv.tf"],
        (h) => `https://${h}/api/get-torrents?imdb_id=0411008&limit=5&page=1`,
        (body) => ((JSON.parse(body).torrents ?? []) as unknown[]).length
      );
    }
    case "BitSearch": {
      const body = (await fetchWithTimeout("https://bitsearch.eu/search?q=inception", 9000, "text/html"))
        .replace(/\s+/g, " ");
      const hashes = new Set(body.match(/\/download\/torrent\/[0-9a-fA-F]{40}/g) ?? []);
      return { results: hashes.size };
    }
    case "TorrentsCSV": {
      const body = await fetchWithTimeout(
        "https://torrents-csv.com/service/search?q=inception&size=20",
        9000,
        "application/json"
      );
      return { results: ((JSON.parse(body).torrents ?? []) as unknown[]).length };
    }
    case "Nyaa": {
      const body = await fetchWithTimeout(
        "https://nyaa.si/?page=rss&f=0&c=0_0&q=one+piece",
        9000,
        "application/rss+xml"
      );
      return { results: body.split("<item>").length - 1 };
    }
    default:
      throw new Error(`unknown source: ${name}`);
  }
}

/* ---------- analysis runner ---------- */

let lastAnalysis: SourceAnalysis | null = null;
let inFlight: Promise<SourceAnalysis> | null = null;

async function runAnalysis(): Promise<SourceAnalysis> {
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    PROBE_ORDER.map(async (name) => {
      const pt0 = Date.now();
      try {
        const r = await probe(name);
        const state: SourceState = r.results > 0 ? "ok" : "degraded";
        const latencyMs = Date.now() - pt0;
        pushHistory(name, state, latencyMs);
        return { name, state, latencyMs, results: r.results, host: r.host, error: undefined };
      } catch (err) {
        const latencyMs = Date.now() - pt0;
        pushHistory(name, "down", latencyMs);
        return {
          name,
          state: "down" as SourceState,
          latencyMs,
          results: 0,
          host: undefined,
          error: String(err instanceof Error ? err.message : err).slice(0, 120),
        };
      }
    })
  );
  const sources: SourceStatus[] = settled.map((s, i) => {
    const name = PROBE_ORDER[i];
    const { pct, runs } = uptimeFor(name);
    if (s.status === "fulfilled") {
      return { ...s.value, role: ROLES[name], checkedAt: Date.now(), uptimePct: pct, runs };
    }
    // Promise.allSettled can only reject if the probe wrapper itself throws —
    // it never does; classify as down to be safe
    return {
      name,
      role: ROLES[name],
      state: "down",
      latencyMs: 0,
      results: 0,
      error: "probe crashed",
      checkedAt: Date.now(),
      uptimePct: pct,
      runs,
    };
  });
  return {
    sources,
    checkedAt: Date.now(),
    durationMs: Date.now() - t0,
    cached: false,
    summary: {
      ok: sources.filter((s) => s.state === "ok").length,
      degraded: sources.filter((s) => s.state === "degraded").length,
      down: sources.filter((s) => s.state === "down").length,
      total: sources.length,
    },
  };
}

export async function getAnalysis(force = false): Promise<SourceAnalysis> {
  if (!force && lastAnalysis && Date.now() - lastAnalysis.checkedAt < ANALYSIS_TTL) {
    return { ...lastAnalysis, cached: true };
  }
  // concurrent callers share one probe run
  if (!inFlight) {
    inFlight = runAnalysis()
      .then((a) => {
        lastAnalysis = a;
        return a;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
