/**
 * Bulletproof JSON fetch for the OTAMA client.
 *
 * Every `/api/*` call in the UI used to do `await res.json()` directly, so ANY
 * non-JSON response (Next.js plain-text 500, an HTML 404, a captive portal, a
 * wrong server on the same address) surfaced as the cryptic
 * "Unexpected token '<' …" — see the "Could not reach the metadata provider
 * (Unexpected token …)" report from the Android LAN setup.
 *
 * This wrapper translates every failure mode into a human, actionable message:
 *  - network failure            → "Cannot reach the OTAMA server…"
 *  - non-JSON body (HTML/text)  → explains what came back + HTTP status
 *  - JSON error body            → forwards the server's `error` message
 */
export class FetchJsonError extends Error {
  readonly status: number
  readonly contentType: string
  constructor(message: string, status = 0, contentType = '') {
    super(message)
    this.name = 'FetchJsonError'
    this.status = status
    this.contentType = contentType
  }
}

/** True when the error means "the UI cannot talk to its own server". */
export function isUnreachableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : ''
  return /Cannot reach the OTAMA server|Failed to fetch|NetworkError|Load failed/i.test(msg)
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    // TypeError: Failed to fetch / Load failed — DNS, refused, offline, CORS
    throw new FetchJsonError(
      'Cannot reach the OTAMA server — check that OTAMA is running on the computer, the address is right, and both devices are on the same Wi-Fi',
    )
  }

  const ctype = (res.headers.get('content-type') || '').toLowerCase()
  const looksJson = ctype.includes('json')

  // Non-JSON body: parse nothing — describe what actually came back.
  if (!looksJson) {
    let kind = 'a non-JSON response'
    if (ctype.includes('text/html')) kind = 'an HTML page'
    else if (ctype.includes('text/plain')) kind = 'a plain-text error'
    let hint: string
    if (res.status === 404) hint = 'the server did not recognize this API route (outdated OTAMA build on the server machine?)'
    else if (res.status === 401 || res.status === 403) hint = 'the server refused the request'
    else if (res.status >= 500) hint = 'the OTAMA server hit an internal error'
    else if (res.status === 0 || !res.status) hint = 'the connection was interrupted'
    else hint = `the address may point at the wrong app or port (expected JSON, got ${kind})`
    throw new FetchJsonError(`${hint} — HTTP ${res.status}, received ${kind}`, res.status, ctype)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new FetchJsonError(`The server response was cut off or invalid (HTTP ${res.status})`, res.status, ctype)
  }

  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new FetchJsonError(msg || `The server returned HTTP ${res.status}`, res.status, ctype)
  }
  return data as T
}
