# Otama — ad-free torrent streaming

Movie / TV / anime streaming web app: TMDB catalog, BitTorrent streaming with
automatic server failover, multi-language subtitles (OpenSubtitles via the
Stremio addon), Otama Direct fallback for episodes on archive.org, continue
watching, and an auto-verified "playable now" home row.

## Run it

```bash
bun install          # or npm install
bun run build        # next build (standalone output) + copies static assets
bun run start        # NODE_ENV=production node .next/standalone/server.js
```

The app listens on `http://localhost:3000`.

For development: `bun run dev`.

> **Note:** start the production server with **Node**, not Bun
> (`bun .next/standalone/server.js` breaks webtorrent's native
> `node_datachannel` binding resolution). The `start` script already does this.

## How playback works

- `/api/torrent/search` scans Torrentio + public trackers and validates every
  release against the exact title / season / episode.
- `/api/torrent/stream` serves the chosen torrent as progressive HTTP video
  with Range support (server-side WebTorrent engine, DHT + UDP/TCP trackers).
- The player auto-picks the best server, pre-warms the next candidates, and
  fails over on stalls, trickles and dead streams. If the backend itself is
  unreachable it shows "reconnecting" instead of blaming the servers.
- Subtitles are fetched per title/episode, converted SRT → VTT on the fly, and
  rendered as native `<track>` elements (Off / Auto / pinned language).
- TV shows pick a season; season-pack torrents resolve the exact episode file;
  multi-year movie collections resolve the requested year's file.

## E2E smoke test

With the app running:

```bash
bash scripts/e2e-smoke.sh http://localhost:3000
```

Drives home → search → movie playback → subtitles → TV season flow → anime →
continue watching → API checks and prints PASS/FAIL per step (17 checks).
