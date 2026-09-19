/**
 * OTAMA API index — describes every public endpoint of the Next.js layer.
 * (Previously a scaffold stub returning { message: "Hello, world!" }.)
 */
import { NextResponse } from 'next/server'

const ENDPOINTS: Record<string, string> = {
  '/api/catalog': 'GET browse catalog (type, genre, sort, source, page|skip)',
  '/api/search': 'GET unified search across all providers (q)',
  '/api/meta/movie/[imdb]': 'GET movie detail + aggregated torrents',
  '/api/meta/series/[imdb]': 'GET series detail + seasons/episodes',
  '/api/meta/series/[imdb]/torrents': 'GET episode/season torrents',
  '/api/tmdb': 'GET status · POST connect key · DELETE disconnect',
  '/api/resolve': 'GET resolve TMDB id → IMDb id (tmdbId, type)',
  '/api/tpb': 'GET ThePirateBay search (q, cat)',
  '/api/1337x': 'GET 1337x search (q, cat, page)',
  '/api/rarbg': 'GET RARBG archive search (q, page)',
  '/api/limetorrents': 'GET LimeTorrents search (q, cat, page)',
  '/api/torrentdownloads': 'GET TorrentDownloads search (q)',
  '/api/torrentgalaxy': 'GET TorrentGalaxy search (q, best-effort)',
  '/api/solid': 'GET SolidTorrents DHT search (q, page)',
  '/api/nyaa': 'GET Nyaa anime RSS search (q)',
  '/api/torrentio': 'GET Torrentio streams (imdb, type | q)',
  '/api/torrends': 'GET site directory + per-site search links',
  '/api/favorites': 'GET/POST/DELETE favorites',
  '/api/history': 'GET/POST/DELETE watch history (resume)',
}

export async function GET() {
  return NextResponse.json({
    name: 'OTAMA API',
    version: '1.3.0',
    engine: 'torrent engine runs as a mini-service on :3003 (web: via gateway ?XTransformPort=3003, desktop: http://127.0.0.1:3003)',
    endpoints: ENDPOINTS,
  })
}
