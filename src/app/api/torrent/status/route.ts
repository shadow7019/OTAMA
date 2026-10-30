import { NextRequest, NextResponse } from "next/server";
import { findTorrent } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/status?id=<infoHash>
 * Live download state used by the player UI (progress, peers, speed).
 */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toLowerCase();
  const torrent = id ? findTorrent(id) : null;

  if (!torrent) {
    return NextResponse.json({ found: false, id });
  }

  return NextResponse.json({
    found: true,
    id,
    ready: torrent.ready,
    name: torrent.name,
    progress: Math.round(torrent.progress * 1000) / 1000,
    peers: torrent.numPeers,
    speed: torrent.downloadSpeed,
    files: torrent.files?.length ?? 0,
  });
}
