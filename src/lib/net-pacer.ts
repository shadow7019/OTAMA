/**
 * Outbound pacing for third-party torrent indexers.
 *
 * These sites are slow and rate-limit aggressively. One scan used to fire 8
 * providers in parallel, several of them with multi-query bursts — a spike
 * that gets the whole IP throttled (429 / Cloudflare wall), which then reads
 * as "all sources are dead". Every outbound call to an indexer goes through
 * here so the traffic looks like a patient human, not a scanner:
 *
 *  - per-host queue: max 1 in-flight request per host, with a minimum gap
 *  - global cap on concurrent outbound requests
 *  - cooldown: after a 429/5xx/timeout the host is benched and callers skip
 *    it immediately instead of piling on
 */

class SkipError extends Error {
  constructor(public host: string, public reason: string) {
    super(`skipped ${host}: ${reason}`);
    this.name = "SkipError";
  }
}

const GLOBAL_LIMIT = 4;
const DEFAULT_GAP_MS = 700;
/** per-host overrides — the fragile scrapers get more breathing room */
const HOST_GAP_MS: Record<string, number> = {
  "bitsearch.eu": 1400,
  "apibay.org": 900,
  "nyaa.si": 1000,
  "torrentio.strem.fun": 800,
};
const DEFAULT_TIMEOUT_MS = 12000;

/** bench after a 429 (explicit rate limit) vs other failures */
const BENCH_429_MS = 120_000;
const BENCH_OTHER_MS = 60_000;

interface HostState {
  queue: Promise<unknown>;
  lastAt: number;
  benchedUntil: number;
}

const g = globalThis as unknown as {
  __otamaPacer?: {
    hosts: Map<string, HostState>;
    active: number;
    waiters: (() => void)[];
  };
};

function pacer() {
  if (!g.__otamaPacer) {
    g.__otamaPacer = { hosts: new Map(), active: 0, waiters: [] };
  }
  return g.__otamaPacer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function gapFor(host: string): number {
  return HOST_GAP_MS[host] ?? DEFAULT_GAP_MS;
}

/** true when the host is benched — callers skip it without spending time */
export function isBenched(url: string): boolean {
  const st = pacer().hosts.get(hostOf(url));
  return !!st && Date.now() < st.benchedUntil;
}

function bench(host: string, ms: number): void {
  const p = pacer();
  const st = p.hosts.get(host);
  if (st) st.benchedUntil = Date.now() + ms;
}

async function acquireGlobal(): Promise<void> {
  const p = pacer();
  while (p.active >= GLOBAL_LIMIT) {
    await new Promise<void>((resolve) => p.waiters.push(resolve));
  }
  p.active += 1;
}

function releaseGlobal(): void {
  const p = pacer();
  p.active -= 1;
  p.waiters.shift()?.();
}

/**
 * Fetch with per-host pacing, global concurrency cap, a cooldown bench on
 * rate-limit responses, and an overall timeout. Throws SkipError when the
 * host is currently benched (callers treat it like any other empty result).
 */
export async function pacedFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const host = hostOf(url);
  const p = pacer();
  const st = p.hosts.get(host) ?? { queue: Promise.resolve(), lastAt: 0, benchedUntil: 0 };
  p.hosts.set(host, st);

  if (Date.now() < st.benchedUntil) {
    throw new SkipError(host, "rate-limit cooldown");
  }

  const run = async (): Promise<Response> => {
    const wait = st.lastAt + gapFor(host) - Date.now();
    if (wait > 0) await sleep(wait);
    await acquireGlobal();
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      st.lastAt = Date.now();
      if (res.status === 429) {
        bench(host, BENCH_429_MS);
      } else if (res.status === 503 || res.status === 502) {
        bench(host, BENCH_OTHER_MS);
      }
      return res;
    } catch (err) {
      st.lastAt = Date.now();
      // NB: no bench here — timeouts / DNS blips hit slow-but-innocent sites
      // just as often as throttling ones, and benching them made things look
      // deader than they are. Only explicit 429/503 responses (handled above)
      // cool a host down; ordinary failures just fail this one request.
      throw err;
    } finally {
      releaseGlobal();
    }
  };

  // serialize per host: each request waits for the previous one on this host
  const next = st.queue.then(run, run);
  // keep the queue chain alive no matter what
  st.queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/** pacedFetch + parse JSON; null on any failure (the old fetchJson contract) */
export async function pacedJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  try {
    const res = await pacedFetch(url, {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0" },
      timeoutMs,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving order of
 * the results. Used for the provider fanout (instead of an 8-way
 * Promise.all burst) and for multi-query providers.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
