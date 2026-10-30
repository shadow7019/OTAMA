import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
  contentTypeFor,
  ensureTorrent,
  pickVideoFile,
  prioritizeRange,
} from "@/lib/torrent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/stream?id=<infoHash>&file=<index>&dn=<releaseName>
 *
 * Streams the torrent's video file as progressive HTTP with full Range
 * support, so the native <video> element can seek while the download is
 * still in progress. Pieces are fetched from the swarm on demand.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = (sp.get("id") ?? "").toLowerCase();
  const fileParam = sp.get("file");
  const dn = (sp.get("dn") ?? "").slice(0, 200);

  const fileIdx = fileParam !== null && fileParam !== "" ? Number(fileParam) : null;
  if (fileParam !== null && (fileIdx === null || !Number.isFinite(fileIdx) || fileIdx < 0)) {
    return NextResponse.json({ error: "Invalid file index" }, { status: 400 });
  }

  let torrent;
  try {
    torrent = await ensureTorrent(id, dn);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "Torrent unavailable", detail }, { status: 504 });
  }

  if (!torrent.files.length) {
    return NextResponse.json({ error: "Torrent has no files" }, { status: 504 });
  }

  const { file } = pickVideoFile(torrent, fileIdx !== null ? Math.floor(fileIdx) : null);

  // ---- Range parsing (bytes=start-end | bytes=start- | bytes=-suffix) ----
  const rangeHeader = req.headers.get("range");
  let start = 0;
  let end = file.length - 1;
  let isRange = false;
  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      isRange = true;
      if (m[1] === "" && m[2] !== "") {
        // suffix range: last N bytes
        const suffix = Math.min(Number(m[2]), file.length);
        start = file.length - suffix;
        end = file.length - 1;
      } else {
        start = Number(m[1]) || 0;
        end = m[2] !== "" ? Number(m[2]) : file.length - 1;
      }
      start = Math.max(0, Math.min(start, file.length - 1));
      end = Math.max(start, Math.min(end, file.length - 1));
    }
  }

  // make the swarm fetch the requested range first so playback starts fast
  prioritizeRange(torrent, file, start, 6 * 1024 * 1024);

  const raw = file.createReadStream({ start, end });
  // stop pulling pieces when the browser aborts (pause / close / server switch)
  req.signal.addEventListener("abort", () => {
    try {
      (raw as { destroy?: () => void }).destroy?.();
    } catch {
      /* already closed */
    }
  });
  // webtorrent's createReadStream lacks the highWaterMark metadata that
  // Readable.toWeb demands on Node 24 — re-wrap it as a proper Readable
  const nodeStream = Readable.from(raw as unknown as AsyncIterable<Uint8Array>);

  const headers = new Headers({
    "Content-Type": contentTypeFor(file.name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Content-Length": String(end - start + 1),
  });
  if (isRange) {
    headers.set("Content-Range", `bytes ${start}-${end}/${file.length}`);
  }

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, { status: isRange ? 206 : 200, headers });
}
