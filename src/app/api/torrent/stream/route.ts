import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
  contentTypeFor,
  ensureTorrent,
  markStreamActive,
  markStreamDone,
  pickVideoFile,
  prioritizeRange,
  selectStreamFile,
} from "@/lib/torrent-engine";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/torrent/stream?id=<infoHash>&file=<index>&dn=<releaseName>&season=1&episode=2&year=2019
 *
 * Streams the torrent's video file as progressive HTTP with full Range
 * support, so the native <video> element can seek while the download is
 * still in progress. Pieces are fetched from the swarm on demand.
 * season/episode steer file selection inside season packs; year steers it
 * inside multi-year movie collections — the requested content plays instead
 * of just the biggest file.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = (sp.get("id") ?? "").toLowerCase();
  const fileParam = sp.get("file");
  const dn = (sp.get("dn") ?? "").slice(0, 200);
  const seasonNum = Number(sp.get("season"));
  const episodeNum = Number(sp.get("episode"));
  const yearNum = Number(sp.get("year"));
  const episodeHint =
    Number.isFinite(seasonNum) && seasonNum > 0 && Number.isFinite(episodeNum) && episodeNum > 0
      ? { season: Math.floor(seasonNum), episode: Math.floor(episodeNum) }
      : null;
  const yearHint = Number.isFinite(yearNum) && yearNum >= 1900 ? Math.floor(yearNum) : null;
  // broadcast-order episode for merged-sequel anime packs: a S02E01 request
  // must pick "S17E14" inside a pack that numbers files that way
  const absParam = Number(sp.get("abs"));
  const absHint = Number.isFinite(absParam) && absParam > 0 ? Math.floor(absParam) : null;

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

  const { file, index } = pickVideoFile(
    torrent,
    fileIdx !== null ? Math.floor(fileIdx) : null,
    episodeHint ? { season: episodeHint.season, episode: episodeHint.episode, abs: absHint } : null,
    yearHint
  );

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
  // Cap every response to a bounded window. An open-ended `bytes=X-` response
  // stays open until the client walks away — behind buffering proxies/edges
  // (which only flush once a response COMPLETES) the video then waits forever
  // and the player is "stuck on loading". A bounded 206 finishes in seconds,
  // forces the flush, and the browser simply issues the next Range request —
  // the exact pattern progressive video over HTTP is designed around.
  // 12 MB: a <video> element keeps only ONE range request in flight, so the
  // window IS the lookahead buffer — too small and the buffer runs dry
  // between chunks (constant rebuffering), too big and a buffering proxy
  // delays first byte. ~12 s of 1080p at typical swarm speeds is the balance.
  const STREAM_WINDOW = 12 * 1024 * 1024;
  end = Math.min(end, start + STREAM_WINDOW - 1);

  // make the swarm fetch the requested range first so playback starts fast
  prioritizeRange(torrent, file, start, Math.max(6 * 1024 * 1024, STREAM_WINDOW));
  // stream exactly the picked file: drops webtorrent's default select-all so
  // a season pack never downloads other episodes in the background (pre-warmed
  // torrents arrive with every file deselected; fresh ones get trimmed to the
  // one we play). Re-selecting the same file is a no-op.
  selectStreamFile(torrent, file, index);

  const raw = file.createReadStream({ start, end });
  // while this stream is open the torrent must not be evicted or swept —
  // a warm-triggered LRU pass would otherwise cut the playing video.
  // The file index powers /status's file-relative progress (stall watchdog).
  markStreamActive(id, index);
  const done = () => markStreamDone(id);
  (raw as NodeJS.ReadableStream).once?.("close", done);
  // stop pulling pieces when the browser aborts (pause / close / server switch)
  req.signal.addEventListener("abort", () => {
    try {
      (raw as { destroy?: () => void }).destroy?.();
    } catch {
      /* already closed */
    }
    done();
  });
  // webtorrent's createReadStream lacks the highWaterMark metadata that
  // Readable.toWeb demands on Node 24 — re-wrap it as a proper Readable
  const nodeStream = Readable.from(raw as unknown as AsyncIterable<Uint8Array>);

  const headers = new Headers({
    "Content-Type": contentTypeFor(file.name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    // hint reverse proxies not to buffer this response
    "X-Accel-Buffering": "no",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Content-Length": String(end - start + 1),
  });
  if (isRange) {
    headers.set("Content-Range", `bytes ${start}-${end}/${file.length}`);
  }

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, { status: isRange ? 206 : 200, headers });
}
