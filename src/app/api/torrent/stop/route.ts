import { NextRequest, NextResponse } from "next/server";
import { stopTorrent } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/torrent/stop  { id: "<infoHash>" } — frees swarm connections + disk. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string };
    const id = (body.id ?? "").toLowerCase();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const stopped = stopTorrent(id);
    return NextResponse.json({ stopped });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
