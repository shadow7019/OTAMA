import { NextRequest, NextResponse } from "next/server";
import { getAnalysis } from "@/lib/source-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/sources[?refresh=1]
 * Probe every torrent source with a lightweight real query and report which
 * ones are working right now (ok / degraded / down), with latency, result
 * counts, mirror host and rolling uptime. Cached for 10 minutes; `refresh=1`
 * forces a fresh scan but is honored at most once every 2 minutes — the
 * indexers are slow and hammering them makes everything look down.
 */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const analysis = await getAnalysis(force);
    return NextResponse.json(analysis, { headers: { "X-Cache": analysis.cached ? "HIT" : "MISS" } });
  } catch (err) {
    return NextResponse.json(
      { error: "Source analysis failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
