import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight availability probe for third-party embed servers.
 * Returns whether the provider responds, how fast, and whether it looks
 * embeddable (no X-Frame-Options / restrictive frame-ancestors), so the
 * player can rank servers, show live status dots and auto-fall back.
 */

const BLOCKED_HOSTS =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local|\[?::1\]?)$/i;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw || !/^https:\/\//i.test(raw)) {
    return NextResponse.json(
      { error: "A single `url` query parameter (https) is required" },
      { status: 400 }
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (BLOCKED_HOSTS.test(url.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(7000),
    });
    const ms = Date.now() - started;

    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy") ?? "";
    const ancestors = csp.match(/frame-ancestors([^;]*)/i)?.[1]?.trim() ?? null;
    // embeddable = no X-Frame-Options and no frame-ancestors restriction (other than *)
    const frameable = !xfo && !(ancestors && !ancestors.includes("*"));

    // 403/429 usually means a bot-wall that still serves real browsers fine
    // (e.g. MultiEmbed blocks curl but works in iframes) — count as alive.
    const alive = res.status < 500;

    return NextResponse.json(
      { ok: alive, status: res.status, ms, frameable },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return NextResponse.json(
      { ok: false, status: 0, ms: Date.now() - started, frameable: false, detail },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
