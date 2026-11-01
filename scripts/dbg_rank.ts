import { searchTorrentSources } from "../src/lib/torrent-sources";
const rows = await searchTorrentSources({ type: "tv", tmdbId: 340620, title: "Bleach: Thousand-Year Blood War", year: "2022", season: 2, episode: 1, audioLang: null });
for (const t of rows.slice(0, 5)) console.log(t.provider, t.seeders, t.score, t.releaseName.slice(0, 40));
