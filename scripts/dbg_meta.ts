import { getTitleMeta, getAbsoluteEpisode, tmdbServer } from "../src/lib/tmdb-server";

const meta = await getTitleMeta("tv", 340620);
console.log("meta:", JSON.stringify(meta, null, 1).slice(0, 400));
const abs = await getAbsoluteEpisode(340620, 2, 1);
console.log("absEpisode for S02E01:", abs);
const show = await tmdbServer<{ original_language?: string; original_title?: string }>("tv/340620");
console.log("TMDB original_language:", show.original_language, "| original_title:", show.original_title);
