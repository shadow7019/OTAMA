# OTAMA Worklog

Project: OTAMA — a web-UI rearchitecting of popcorn-desktop (popcorn-time-ru fork)
Stack: Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Prisma(SQLite) + WebTorrent mini-service (port 3003) + socket.io

---
Task ID: 1
Agent: main (orchestrator)
Task: Explore project, plan OTAMA architecture

Work Log:
- Inspected scaffold: Next.js 16 App Router, shadcn/ui components present, Prisma+SQLite configured, socket.io example in examples/websocket (path '/', XTransformPort pattern).
- Caddyfile forwards any request with ?XTransformPort=N to localhost:N.
- Planned architecture:
  - mini-services/otama-engine: WebTorrent Node client + Express REST + socket.io progress on port 3003. Range-request streaming endpoint /stream/:infoHash/:fileIndex.
  - Next.js API routes: providers (YTS movies, TVMaze TV metadata, EZTV tv torrents, Apibay (ThePirateBay official API), Nyaa anime RSS), favorites + watch history via Prisma.
  - Single-page UI on '/' (SPA-style views via Zustand): Home (hero + rows), Browse Movies, TV, Anime, Pirate Bay, Favorites, Downloads sheet, Search, Detail overlay, Player overlay.

Stage Summary:
- Architecture decided; no code written yet beyond scaffold understanding.

---
Task ID: 3+4
Agent: main (orchestrator)
Task: Prisma schema + OTAMA torrent engine mini-service

Work Log:
- Replaced Prisma schema with Favorite / WatchHistory / Setting models; db push OK.
- Connectivity findings: YTS+EZTV+apibay-top100 blocked (CF/geo) in sandbox; Cinemeta (keyless Stremio meta), TVMaze, Nyaa RSS, apibay q.php (TPB official API, needs browser UA) all WORK. Real P2P outbound works (Big Buck Bunny torrent downloaded in sandbox).
- webtorrent@2 fails under bun (node-datachannel native); chose torrent-stream 1.2.1 (the exact engine popcorn-desktop used via peerflix) — works perfectly under bun.
- Built mini-services/otama-engine (port 3003): REST add/list/destroy/magnet, HTTP range streaming /stream/:hash/:fileIndex (206 + Content-Range verified, seek test OK), file selector policy (one big file + small subtitle files), idle reaper (30min) + LRU cap 6, socket.io broadcasts state every 1.5s on path /socket.io (path '/' conflicts with REST).
- Verified: add BBB torrent -> 20 peers -> range 206 stream valid MP4 -> middle-range seek works.

Stage Summary:
- Engine fully functional at localhost:3003. Stream URL pattern for frontend: /stream/<hash>/<fileIndex>?XTransformPort=3003

---
Task ID: 5
Agent: main (orchestrator)
Task: Provider layer + Next.js API routes

Work Log:
- src/lib/types.ts: shared contract (MetaItem, TorrentOption, EngineTorrent, TpbItem, PlayerPayload...).
- src/lib/server/providers.ts: Cinemeta catalogs/meta, TVMaze browse/search/lookup/episodes, Apibay (TPB) search + imdb-keyed lookup + quality detection, EZTV best-effort, Nyaa RSS parser (regex, no deps), in-memory TTL cache.
- KEY FIX (upstream bug class): Cloudflare TLS-fingerprints Node fetch/https -> 403 on apibay/eztv. Implemented curl-subprocess transport (cfGetText) with fetch fallback; apibay + eztv now reliable.
- API routes: /api/catalog (browse movies/series/anime), /api/meta/movie/[imdb] (+TPB torrents by imdb), /api/meta/series/[imdb] (+seasons/episodes via TVMaze, Cinemeta fallback), /api/meta/series/[imdb]/torrents (EZTV->TPB fallback), /api/tpb, /api/nyaa, /api/search (unified), /api/favorites, /api/history (Prisma upserts).
- Verified via curl: catalog movies OK, Inception meta + TPB torrents (974 seeds YIFY 1080p) OK, Breaking Bad S1E1 torrents OK (63 seeds).

Stage Summary:
- Backend complete and verified. All data flows through keyless public APIs with graceful degradation to TPB.

---
Task ID: 6+7+9
Agent: main (orchestrator)
Task: Frontend SPA + Agent Browser E2E verification

Work Log:
- Built SPA on single '/': NavBar (search, engine badge, downloads badge, mobile menu), Hero carousel (auto-rotate, dots), MediaRow/MediaCard (hover play, poster fallback), CatalogView (genre/sort filters + load more), TpbView (search + categories + latest), SearchView (4 tabs: movies/tv/anime-Nyaa/Pirate Bay), FavoritesView + ContinueWatchingRow, DetailOverlay (movie torrents by IMDB; series season/episode picker with per-episode torrents), PlayerOverlay (range-stream video, resume, 10s progress saves, live stats bar), DownloadsSheet (live socket progress, open/stop/delete), AboutDialog (upstream fixes + legal disclaimer), Footer (sticky, disclaimer).
- Installed socket.io-client; engine socket hook io('/?XTransformPort=3003').
- E2E via agent-browser THROUGH GATEWAY (port 81 — direct :3000 bypasses gateway routing, first play test failed because of that; not an app bug):
  - Home hero/rows render with live Cinemeta data ✓
  - Movie detail: Practical Magic 1998 with 14 IMDB-keyed TPB torrents ✓
  - PLAY: torrent added, 206 range stream through gateway, video frames rendered, readyState 4, currentTime advancing, stats bar (peers/speed/ETA) live ✓
  - TV: Silo detail, season picker, S01E01 'Freedom Day' torrents (90 seeds) ✓
  - Search 'breaking bad': Movies(4)/TV(5)/Anime/PB(30) tabs ✓; 'frieren' anime 75 ✓
  - TPB 'ubuntu': 100 rows ✓; Favorites add/view ✓; Downloads sheet 4 live torrents ✓; mobile 390px ✓ footer ✓
- BUGS FIXED during E2E:
  1. /api/catalog sent type=tv to Cinemeta (needs 'series') → TV grid 500
  2. Radix Select crash: SelectItem value='' in TPB categories → runtime error overlay
  3. Episode air dates showed raw ISO timestamps
  4. Continue-watching filter threshold too strict (>30s → >10s)
  5. (engine) socket.io path '/' swallowed REST routes → moved to /socket.io

Stage Summary:
- OTAMA fully functional end-to-end: browse → detail → torrent → stream → resume. All core interactions browser-verified through the gateway.

---
Task ID: 10
Agent: frontend-styling-expert
Task: Visual polish pass on OTAMA UI

Work Log:
- Read worklog.md + full scope: globals.css, page.tsx, and all 18 components under src/components/otama/.
- Audited spacing rhythm, truncation, overlay layouts, player stats bar, footer sticky pattern, contrast, and scrollable areas. Confirmed footer mt-auto sticky-bottom pattern intact (no change needed) and episode list already inside ScrollArea.
- hero.tsx: raised text block from bottom-8 to bottom-10 (md:bottom-12) and aligned slide indicators to md:right-12, guaranteeing clearance between buttons and indicator dots on short hero heights (min-h-[320px]); matched loading skeleton offsets to the new anchors.
- media-card.tsx: normalized card overlay padding p-2.5 → p-3 (matches p-3 rhythm used by rows/grids); tightened Seeds component internal gap-2 → gap-1.5 for tidier torrent meta rows.
- favorites-view.tsx: same p-2.5 → p-3 normalization on favorite-card gradient and continue-watching gradient; bumped "Managing active downloads…" ghost link from text-zinc-500 to text-zinc-400 (readability on dark bg).
- player-overlay.tsx: stats bar spacing tuned for mobile — gap-x-6/gap-y-1 → gap-x-4 gap-y-1.5 sm:gap-x-6 (flex-wrap retained), less cramped wrapping on narrow screens.
- search-view.tsx: TabsList given max-w-full overflow-x-auto no-scrollbar so the 4 tab triggers scroll horizontally instead of overflowing the viewport on mobile.
- about-dialog.tsx: added otama-scroll to the scrollable DialogContent for the custom amber-tinted scrollbar used elsewhere.
- Verified no logic/data-flow/state changes; only className edits. No new colors introduced (amber accent untouched; no blue/indigo added).
- bun run lint → 0 errors; curl http://localhost:3000/ → 200; dev.log shows clean compile.

Stage Summary:
- Purely visual polish pass: hero text/indicator clearance on short viewports, consistent p-3 card padding rhythm, mobile-friendlier player stats bar and search tabs, custom scrollbar in About dialog, one low-contrast fix. Zero logic changes; lint clean; page renders 200.

---
Task ID: 11
Agent: main (orchestrator)
Task: Final re-verification after polish pass

Work Log:
- Re-verified through gateway after Task 10 styling edits: home renders (hero + rows + continue watching), Movies grid 50 cards, detail overlay opens with 13 play buttons, play flow adds torrent and mounts video player with buffering state + live stats.
- Noted: one slow-seeded torrent buffers slowly (2 peers, 61 KB/s) — correct UX (buffering indicator + stats shown); streaming mechanism previously verified with readyState 4 and advancing playback.
- lint: 0 errors. Dev server 200 via gateway. Engine on 3003 running (4 torrents active).

Stage Summary:
- OTAMA complete: reverse-engineered popcorn-desktop architecture (torrent-stream engine + provider layer + media UI) rebuilt as a web app with original branding, upstream bug fixes, browser-verified E2E.

---
Task ID: 12
Agent: main (orchestrator)
Task: Windows desktop app (.exe) — Electron packaging of OTAMA

Work Log:
- New deliverable per user request: "develop a .exe file for windows and make it a windows based app".
- Chose Electron + embedded-services architecture (zero rewrites of the verified web app):
  BrowserWindow loads the Next.js standalone server (child process, random 127.0.0.1 port);
  torrent engine ships embedded and runs as a second child process on 127.0.0.1:3003.
  Both children run via ELECTRON_RUN_AS_NODE=1 → end users need no Node.js installed.
- desktop/package.json: electron 33 + electron-builder 25 (+png-to-ico 3.0.2); "build" config
  produces OTAMA-Setup-<v>.exe (NSIS: install dir choice, desktop+start-menu shortcuts) and
  OTAMA-<v>-portable.exe; extraResources bundle renderer/ + engine/.
- desktop/src/main.mjs: single-instance lock, splash screen, engine health-probe + reuse
  (multi-instance safe), engine restart with backoff (5 tries), renderer wait-for-ready,
  dynamic engine port via preload env, writable SQLite path in userData (DATABASE_URL),
  external links → system browser, contextIsolation+sandbox, graceful child shutdown.
- desktop/src/preload.cjs: contextBridge exposes window.otama { isDesktop, enginePort, version }.
- desktop/engine/engine.mjs: plain-JS port of the mini-service engine (same REST surface,
  range streaming, socket.io /socket.io, CORS *, idle reaper, LRU cap); binds 127.0.0.1 only.
- desktop/scripts/: prepare-engine.mjs (npm install engine deps), prepare-renderer.mjs
  (cross-platform next build + standalone assembly → resources/renderer), make-ico.mjs
  (sharp multi-size → png-to-ico).
- Brand icon: AI-generated 1024px master → tile crop + transparent rounded corners (sharp) →
  build/icon.png + build/icon.ico (16–256px) + icon-512.png.
- Frontend desktop-mode support: src/lib/engine.ts adds isDesktop()/desktopEnginePort();
  engineUrl() switches gateway (XTransformPort) ↔ direct 127.0.0.1:<port>; use-engine-state.ts
  connects socket.io accordingly. Web mode untouched (regression-verified).
- CI: .github/workflows/windows-build.yml (windows-latest) — bun install, prisma generate,
  engine+renderer prep, electron-builder --win, artifact upload + release attach on v* tags.
  Includes npm install-scripts fallback for the electron postinstall.
- Root README.md (architecture, upstream bug-fix list, web + desktop build guides, data
  locations, legal disclaimer) and root .gitignore added; desktop/ gitignored node_modules/dist.
- ESLint scope extended to ignore desktop/**, mini-services/**, .cache/**.
- VERIFICATION:
  * node --check on all 6 desktop JS files ✓
  * embedded engine standalone: node engine.mjs on :3999 → /health + /torrents OK ✓
  * FULL Electron smoke test under Xvfb (headless): window boots, reuses healthy :3003 engine,
    preload bridge present (window.otama.isDesktop=true, enginePort=3003, v1.0.0), page loads,
    CDP Runtime.evaluate PASS; direct engine fetch from renderer (CORS) OK; window screenshot
    captured showing full OTAMA UI + green engine badge inside the desktop shell ✓
  * Web regression via gateway: home renders, TPB detail overlay lists live torrents,
    /health?XTransformPort=3003 OK, lucide-wifi (socket connected) present, 0 page errors ✓
  * bun run lint → 0 errors; dev.log clean; engine mini-service untouched and healthy ✓

Stage Summary:
- OTAMA is now a Windows desktop application: electron-builder config + CI produce
  OTAMA-Setup-1.0.0.exe and OTAMA-1.0.0-portable.exe with the web UI, torrent engine,
  Prisma/SQLite persistence and downloads embedded; no Node.js required on user machines.
- The actual .exe binaries are built by running `npm run dist:win` in desktop/ on Windows or
  via the included GitHub Actions workflow (sandbox has no Windows toolchain/wine, which is
  the industry-standard path for cross-platform Electron releases).

---
Task ID: 13
Agent: main (orchestrator)
Task: TMDB integration (optional richer movie database, user-supplied API key)

Work Log:
- New src/lib/server/tmdb.ts: official TMDB v3/v4 client. Key resolution order:
  DB Setting 'tmdb_api_key' (in-app dialog) -> env TMDB_API_KEY (v3) / TMDB_ACCESS_TOKEN (v4)
  -> disabled. 15s-cached key reads, key-tagged TTL caches (lists 10min, external_ids 24h,
  find/details 6h), TmdbDisabledError -> automatic keyless fallback everywhere.
- Catalogs: trending (week) / popular / top_rated / newest (discover, date+vote floors) for
  movies & TV, genre filtering via official TMDB genre-id maps (UI names incl. Sci-Fi mapped),
  pagination. IMDB enrichment via /external_ids per list item (20 parallel, cached) so the
  existing imdb-keyed detail + torrent lookup pipelines stay unchanged.
- Search: /search/multi merged into /api/search (dedupe by imdb id + title, TMDB first).
- Detail: /find?external_source=imdb_id + /movie|tv/:id upgrades backdrop, summary, runtime,
  genres on both meta routes (failure-safe).
- New /api/tmdb route: GET status (configured/mode/source/valid via live /configuration probe),
  POST validate-then-store key, DELETE remove. Key never leaves the server except to TMDB.
- UI: new tmdb-dialog.tsx Settings dialog (status badge, key input, connect/remove, help link,
  TMDB attribution) wired to a new gear button in NavBar; CatalogView now has a source selector
  (TMDB / Cinemeta / TVmaze) + TMDB sorts (Trending/Popular/Top rated/Newest), auto-selects TMDB
  when a valid key exists; About dialog + Footer gained the mandatory TMDB attribution.
- types.ts: MetaItem.provider + 'tmdb', tmdbId field. .env TMDB_API_KEY placeholder documented;
  desktop app inherits env passthrough + in-app dialog (key stored in its own SQLite).
- README: TMDB section (how to get/connect a key, env alternative, attribution).
- VERIFICATION (no key configured yet): /api/tmdb -> {configured:false}; /api/catalog source=tmdb
  -> silent Cinemeta fallback; /api/search q=dune OK; POST fake key -> live round-trip to
  api.themoviedb.org -> correct 400 rejection; lint 0 errors; browser: gear dialog opens with
  "Not connected" badge, Movies view shows Genre/Sort/Source (TMDB|Cinemeta) controls, grid
  renders, 0 page errors.

Stage Summary:
- TMDB fully integrated behind a bring-your-own-key design with graceful keyless fallback.
- PENDING: real API key from the user -> then verify trending/popular/top-rated/genre catalogs,
  merged search and enhanced detail art live, and (optionally) bake it into .env / desktop build.
