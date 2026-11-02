import { NextRequest, NextResponse } from "next/server";
import { srtToVtt } from "@/lib/subtitles-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/subtitles/file?u=<addon download url>
 * Streams one subtitle file through as WebVTT so the native <video> element
 * can render it: the addon serves UTF-8 SRT, browsers need text/vtt.
 * Only *.strem.io hosts are allowed (enforced again here — this must never
 * become an open proxy).
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("Missing u", { status: 400 });

  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  if (!/\.strem\.io$/.test(host) || !raw.startsWith("https://")) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  try {
    const res = await fetch(raw, {
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) PopcornTime/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    const text = await res.text();
    if (text.length > 4 * 1024 * 1024) {
      return new NextResponse("Subtitle too large", { status: 413 });
    }
    const vtt = srtToVtt(text);
    return new NextResponse(vtt, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Upstream timeout", { status: 504 });
  }
}
