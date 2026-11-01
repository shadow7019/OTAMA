import { NextRequest, NextResponse } from "next/server";
import { engineFailure, findTorrent, peersEverConnected } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/status?id=<infoHash>
 * Live download state used by the player UI (progress, peers, speed).
 * `engineOk: false` + `engineError` reports a host that cannot run the
 * streaming engine (native module load failure) instead of a blind 500.
 * `everConnectedPeers: false` across failed servers means the host's
 * network blocks torrent peer traffic — the player says so instead of
 * cycling sources forever.
 */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toLowerCase();
  const engineError = engineFailure();
  const torrent = id ? findTorrent(id) : null;

  if (!torrent) {
    return NextResponse.json({
      found: false,
      id,
      engineOk: !engineError,
      everConnectedPeers: peersEverConnected(),
      ...(engineError ? { engineError } : {}),
    });
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
    engineOk: true,
    everConnectedPeers: true,
  });
}
