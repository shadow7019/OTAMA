/**
 * Hard cap for any server-side provider promise.
 *
 * WHY: `safe()/try-catch` only handles REJECTION — a provider that HANGS
 * (slow site, stuck TLS, captive portal) still blocks the route handler for
 * as long as it likes. On the hosted edge that exceeds the platform timeout,
 * the connection is killed mid-response, and the client's fetch() throws —
 * which the phone renders as "Cannot reach the OTAMA server" even though the
 * server (and TMDB) were perfectly fine. Wrapping every fan-out call in a
 * time budget guarantees the route always answers within its worst case.
 *
 * On timeout the promise REJECTS with a descriptive error, so existing
 * `safe(p, fallback)` / try-catch callers degrade exactly as designed.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'provider'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}
