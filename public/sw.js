/*
 * Otama service worker — installable-app shell for macOS / Windows /
 * Android / iOS (PWA install + offline UI).
 *
 * Strategy:
 *  - navigations: network-first (fast timeout), fall back to cached shell,
 *    then /offline.html so an installed app never shows a browser error page
 *  - build assets (/_next/static) & images/fonts: cache-first (immutable)
 *  - /api/*: NEVER intercepted — torrent status polling must stay live and
 *    the stream route needs Range handling that only the network stack does
 *    correctly; respondWith on a media request would break seeking
 */
const VERSION = "otama-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const PRECACHE = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|webp|avif|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // all API traffic (including /api/torrent/stream with Range headers) goes
  // straight to the network — no respondWith, no interference
  if (url.pathname.startsWith("/api/")) return;

  // cross-origin (TMDB images etc.): pass through untouched
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 5000)),
          ]);
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = (await caches.match("/")) || (await caches.match(req));
          return cached || caches.match("/offline.html");
        }
      })()
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) {
          // refresh in the background; serve the cached copy immediately
          fetch(req)
            .then((res) => res.ok && cache.put(req, res.clone()))
            .catch(() => {});
          return hit;
        }
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      })()
    );
  }
});
