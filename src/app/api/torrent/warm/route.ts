import { NextRequest, NextResponse } from "next/server";
import { ensureTorrent, idleTorrent, isValidInfoHash } from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/torrent/warm  { ids: [{ id, dn }] }  (max 3)
 *
 * Pre-resolves torrent metadata for the player's next server candidates in
 * parallel, so a failover (or the initial auto-pick) starts streaming from an
 * already-resolved torrent instead of paying the 15–25 s metadata wait again.
 * Warmed torrents are idled (no file selected) so they don't compete with the
 * server that is actually streaming.
 */
export async function POST(req: NextRequest) {
  let body: { ids?: { id?: unknown; dn?: unknown }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items = (body.ids ?? [])
    .slice(0, 3)
    .map((it) => ({
      id: String(it?.id ?? "").toLowerCase(),
      dn: String(it?.dn ?? "").slice(0, 200),
    }))
    .filter((it) => isValidInfoHash(it.id));

  const results = await Promise.allSettled(
    items.map(async (it) => {
      const t = await ensureTorrent(it.id, it.dn);
      idleTorrent(t);
      return t.infoHash;
    })
  );

  const warmed = results.map((r, i) => ({
    id: items[i].id,
    ok: r.status === "fulfilled",
    detail: r.status === "rejected" ? String(r.reason?.message ?? r.reason).slice(0, 120) : null,
  }));
  return NextResponse.json({ warmed });
}
