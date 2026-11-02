/**
 * Test the .torrent fetch + add path exactly as the engine does, from Node
 * (same fetch impl as the Next.js runtime).
 */
const HASH = "4f1a4b7ad7d93f9bb991185c012d7964d7c696e1";

async function tryMirror(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Otama/1.0", accept: "application/x-bittorrent,*/*" },
      signal: AbortSignal.timeout(7000),
      redirect: "follow",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`${url}\n  -> ${res.status} ${buf.length}B in ${Date.now() - t0}ms, starts with 0x${buf[0]?.toString(16)}, has 4:info=${buf.includes("4:info")}`);
  } catch (e) {
    console.log(`${url}\n  -> ERR in ${Date.now() - t0}ms: ${e.message}${e.cause ? ` / cause: ${e.cause.message ?? e.cause}` : ""}`);
  }
}

await tryMirror(`https://itorrents.org/torrent/${HASH.toUpperCase()}.torrent`);
await tryMirror(`https://itorrents.org/torrent/${HASH}.torrent`);
process.exit(0);
