import { NextRequest, NextResponse } from "next/server";
import { diskHeadroom, diskInfo, engineFailure, findTorrent, peersEverConnected, streamFileProgress } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/status?id=<infoHash>
 * Live download state used by the player UI (progress, peers, speed).
 * `engineOk: false` + `engineError` reports a host that cannot run the
 * streaming engine (native module load failure) instead of a blind 500.
 * `everConnectedPeers: false` across failed servers means the host's
 * network blocks torrent peer traffic — the player says so instead of
 * cycling sources forever. `diskFree/diskTotal/diskCritical/cacheBytes`
 * expose the piece-cache volume so "storage full" is diagnosable from the
 * outside.
 */
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").toLowerCase();
  const engineError = engineFailure();
  const torrent = id ? findTorrent(id) : null;
  const disk = diskInfo();

  if (!torrent) {
    return NextResponse.json({
      found: false,
      id,
      engineOk: !engineError,
      everConnectedPeers: peersEverConnected(),
      diskFree: disk.free,
      diskTotal: disk.total,
      diskCritical: disk.critical,
      cacheBytes: disk.cacheBytes,
      downloadDir: disk.dir,
      ...(engineError ? { engineError } : {}),
    });
  }

  return NextResponse.json({
    found: true,
    id,
    ready: torrent.ready,
    name: torrent.name,
    progress: Math.round(torrent.progress * 1000) / 1000,
    // progress of the file actually being streamed — on a 170-episode season
    // pack `progress` crawls forever while the played episode is at 0%, which
    // is what the player's stall watchdog and the buffered % must look at
    fileProgress: streamFileProgress(id),
    peers: torrent.numPeers,
    speed: torrent.downloadSpeed,
    files: torrent.files?.length ?? 0,
    engineOk: true,
    everConnectedPeers: true,
    diskFree: disk.free,
    diskTotal: disk.total,
    diskCritical: disk.critical,
    cacheBytes: disk.cacheBytes,
    downloadDir: disk.dir,
  });
}
