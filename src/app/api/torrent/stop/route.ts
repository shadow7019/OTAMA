import { NextRequest, NextResponse } from "next/server";
import { idleTorrentById, stopTorrent } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/torrent/stop  { id: "<infoHash>", mode?: "stop" | "idle" }
 * mode "stop" (default) destroys the torrent — frees swarm connections + disk.
 * mode "idle" keeps it warm: metadata, peers and downloaded pieces stay, no
 * data is pulled — used by the player's failover so a revived server (or a
 * "Continue watching" return) doesn't start from zero.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; mode?: string };
    const id = (body.id ?? "").toLowerCase();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const stopped = body.mode === "idle" ? idleTorrentById(id) : stopTorrent(id);
    return NextResponse.json({ stopped });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
