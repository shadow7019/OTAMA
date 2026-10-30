// Diagnose webtorrent v3 API shape
import WebTorrent from "webtorrent";

const client = new WebTorrent();
console.log("client.constructor:", client.constructor?.name);

const magnet =
  "magnet:?xt=urn:btih:224bf45881252643dfc2e71abc7b2660a21c68c4&dn=test&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=http%3A%2F%2Ftracker.openbittorrent.com%2Fannounce";

const ret = client.add(magnet, { path: "/tmp/tt-diag" }, (t) => {
  console.log("[cb] fired:", !!t, "has .on:", typeof t?.on, "files:", t?.files?.length, "ready:", t?.ready);
});
console.log("[add] returns:", typeof ret, ret?.constructor?.name, "has .on:", typeof ret?.on);

setTimeout(() => {
  const g = client.get("224bf45881252643dfc2e71abc7b2660a21c68c4");
  console.log("[get] type:", typeof g, "ctor:", g?.constructor?.name, "has .on:", typeof g?.on, "ready:", g?.ready, "files:", g?.files?.length);
  if (g && typeof g.on !== "function") {
    console.log("[get] own keys:", Object.keys(g).slice(0, 25));
    console.log("[get] proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(g) ?? {}).slice(0, 25));
  }
  process.exit(0);
}, 12000);
