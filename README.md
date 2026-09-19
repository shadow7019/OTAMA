# OTAMA

**OTAMA** is a torrent-streaming media center — a ground-up re-architecture of
[popcorn-desktop](https://github.com/popcorn-time-ru/popcorn-desktop) (the peerflix /
torrent-stream lineage) as a modern **web app** *and* a self-contained **Windows desktop app (`.exe`)**.

Same DNA as the original, none of the legacy baggage: the streaming core, provider layer and
UI were rebuilt from scratch on a current stack, fixing the upstream bugs that plagued the
Electron-era codebase.

> ⚠️ **Legal disclaimer** — OTAMA is a BitTorrent client with a nice UI. It ships no content.
> You are responsible for what you stream or download: only use sources you are legally
> entitled to access in your jurisdiction. The project takes no position on, and holds no
> copies of, any third-party indexed content.

---

## Architecture

```
┌──────────────────────────── Browser  /  Electron window ────────────────────────────┐
│  Next.js 16 SPA (single route, Zustand views)                                        │
│  Home · Movies · TV · Anime · Pirate Bay · Search · Favorites · Downloads · Player   │
└──────────────┬───────────────────────────────────────────────────┬──────────────────┘
               │ /api/*  (catalog, meta, search, favorites, history)│ engine + stream
               ▼                                                    ▼
┌──────────────────────────────┐                    ┌─────────────────────────────────┐
│ Next.js API routes           │                    │ OTAMA engine (torrent-stream)   │
│ Cinemeta (Stremio) metadata  │                    │ REST add/list/destroy           │
│ TVMaze shows/episodes        │                    │ HTTP range streaming 206        │
│ EZTV / Apibay (TPB) / Nyaa   │                    │ socket.io live progress :3003   │
│ TMDB (optional, user key)    │                    │ idle reaper + LRU cap           │
│ Prisma favorites + history   │                    │                                 │
└──────────────────────────────┘                    └─────────────────────────────────┘
```

| Layer | Tech |
|---|---|
| UI | Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui, Zustand, socket.io-client |
| Data | Cinemeta · TVMaze · EZTV · Apibay (The Pirate Bay API) · Nyaa RSS — keyless public APIs |
| Optional data | **TMDB** (The Movie Database) — trending/popular/top-rated/genre catalogs, deeper search, better art. Bring your own free key (in-app ⚙ Settings dialog or `TMDB_API_KEY` env) |
| Library state | Prisma + SQLite (favorites, continue-watching history) |
| Streaming | `torrent-stream` engine (the exact peerflix stack popcorn-desktop used) with 206 range streaming |
| Desktop | Electron 33 + electron-builder (NSIS installer + portable `.exe`) |

## Upstream bugs fixed (vs. popcorn-desktop)

The original repo's known failure modes and how OTAMA addresses them:

1. **Dead provider APIs** — old popcorn providers (YTS/EZTV scrapers) rot and break silently.
   OTAMA uses live keyless APIs (Cinemeta/TVMaze/Apibay/Nyaa) with TTL caching *and* a
   curl-subprocess transport that defeats Cloudflare TLS fingerprinting (Node `fetch` gets 403;
   upstream never handled this).
2. **Memory leaks from unmanaged torrents** — the desktop app leaks engines. OTAMA's engine
   has an idle reaper (30 min), an LRU cap (6 torrents) and explicit destroy/wipe endpoints.
3. **socket.io path collision** — serving realtime on `/` swallowed REST routes; fixed by
   isolating realtime on `/socket.io`.
4. **Broken resume** — upstream lost playback position across restarts. OTAMA persists
   resume points in SQLite (10 s cadence) per title/file.
5. **Range-request seeking bugs** — popcorn-era streamers struggled with mid-file seeks.
   OTAMA's streaming endpoint was verified with 206 + `Content-Range` seeks at arbitrary offsets.
6. **Single-file selection policy** — multi-file packs used to download everything; OTAMA
   auto-selects only the chosen video (plus small subtitle files) and prioritizes streaming ranges.
7. **UI thread blocking** — heavy work moved out of the UI process into the engine service;
   the UI only consumes REST + socket state.

## TMDB integration (optional, recommended)

OTAMA ships keyless (Cinemeta/TVMaze) so it works out of the box. Connect **TMDB** for:

- **Trending / Popular / Top-rated / Newest** catalogs with genre filtering (movies + TV)
- Deeper multi-search (TMDB results merged in, deduped by IMDB id)
- Higher-quality posters & backdrops, including upgraded detail-page art

**How to connect:** click the ⚙ gear icon in the nav bar → paste your TMDB *v3 API key* or *v4 Read
Access Token* (free: themoviedb.org → Settings → API) → Connect. The key is validated against TMDB,
stored locally in the app's SQLite (`Setting.tmdb_api_key`), and can be removed any time. OTAMA
falls back to keyless providers automatically whenever the key is absent or rejected.

**Alternative (headless/deployments):** set `TMDB_API_KEY` (v3) or `TMDB_ACCESS_TOKEN` (v4) in `.env`
or the process environment. The desktop app inherits both mechanisms (env passes through `desktop/src/main.mjs`).

> This product uses the TMDB API but is not endorsed or certified by TMDB.

## Repository layout

```
src/                       Next.js web app (UI + API routes) — also embedded in the desktop build
mini-services/otama-engine/ torrent engine service (web deployment, port 3003)
desktop/                   Electron Windows packaging (see below)
  src/main.mjs             main process: window + embedded services lifecycle
  src/preload.cjs          exposes window.otama { isDesktop, enginePort, version }
  engine/                  engine bundled into the .exe (same code, plain JS)
  scripts/                 prepare-renderer / prepare-engine / make-ico
  build/icon.ico|png       brand assets
.github/workflows/         windows-build.yml — builds the .exe on tag push / manual run
```

---

## Web app (development)

```bash
bun install
bun run db:push          # Prisma SQLite
bun run dev              # http://localhost:3000
# engine (separate terminal)
cd mini-services/otama-engine && bun install && bun run dev   # :3003
```

---

## 🪟 Building the Windows `.exe`

### What you get

| Artifact | File |
|---|---|
| Installer (choose dir, shortcuts) | `desktop/dist/OTAMA-Setup-<version>.exe` |
| Portable (single file, no install) | `desktop/dist/OTAMA-<version>-portable.exe` |

The packaged app embeds **everything** — Next.js renderer, torrent engine, its runtime deps —
and end users do **not** need Node.js installed (child services run on Electron's bundled Node).

### Option A — build on your Windows machine

Prereqs: Node.js ≥ 20 (and Git). From the repo root on **Windows**:

```powershell
bun install                      # or: npm install  (web UI deps)
npx prisma generate

cd desktop
npm install                      # electron + electron-builder + icon tooling
npm run prepare:engine           # installs the embedded engine's runtime deps
npm run prepare:renderer         # next build + assemble standalone renderer
npm run dist:win                 # → desktop\dist\OTAMA-Setup-1.0.0.exe + portable
```

Faster iteration while developing the web UI (loads your dev server instead of the bundle):

```bash
# terminal 1 (repo root):        bun run dev
# terminal 2 (desktop/):         $env:OTAMA_DEV_URL='http://localhost:3000'; npm start
```

### Option B — let GitHub Actions build it

1. Push this repository to GitHub (`git init && git remote add origin … && git push -u origin main`).
2. Run **Actions → Build Windows EXE → Run workflow**, or push a tag `v1.0.0`.
3. Download the artifacts (both `.exe` files) from the run — tag builds are also attached to the release.

### Desktop data locations (Windows)

| Data | Path |
|---|---|
| Database (favorites/history) | `%APPDATA%\otama-desktop\otama.db` |
| Torrent downloads | `%APPDATA%\otama-desktop\downloads\` |
| Engine port | `127.0.0.1:3003` (loopback only, reuses an existing healthy OTAMA engine) |

### Desktop-only niceties

- Single-instance lock (second launch focuses the window)
- Amber splash while the engine boots; graceful engine restart with backoff (5 attempts)
- External links open in the system browser; internal navigation stays sandboxed
- Context-isolated renderer, sandboxed preload, `nodeIntegration: false`

---

## Script map

| Where | Script | Purpose |
|---|---|---|
| root | `bun run dev` | web UI dev server (:3000) |
| root | `bun run lint` | ESLint |
| root | `bun run db:push` | sync Prisma schema |
| mini-services/otama-engine | `bun run dev` | engine with hot reload (:3003) |
| desktop | `npm run dev` / `npm start` | Electron against dev server / packaged renderer |
| desktop | `npm run dist:win` | build NSIS installer + portable .exe |
| desktop | `npm run make:icon` | regenerate `build/icon.ico` from `build/icon.png` |

## License

MIT for this project's code. Upstream popcorn-desktop is GPL-licensed; OTAMA is an independent
re-implementation that shares no upstream source, so MIT applies here. Respect the licenses and
the law in your jurisdiction when using torrent technology.
