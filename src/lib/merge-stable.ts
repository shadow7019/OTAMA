import { MediaItem } from "./tmdb";

/**
 * Order-preserving refresh merge for card rows/grids.
 *
 * The 5-minute auto-update used to replace the whole list with freshly sorted
 * TMDB results, so posters visibly "changed into other shows" while the user
 * was looking at them. With this merge:
 *   - existing cards KEEP their position (only their data is refreshed),
 *   - genuinely new titles are appended at the end,
 *   - titles that vanished from the source are dropped.
 */
export function mergeStable(prev: MediaItem[], fresh: MediaItem[]): MediaItem[] {
  const keyOf = (x: MediaItem) => `${x.media_type ?? "m"}-${x.id}`;
  const freshByKey = new Map(fresh.map((x) => [keyOf(x), x]));
  const kept = prev
    .filter((x) => freshByKey.has(keyOf(x)))
    .map((x) => freshByKey.get(keyOf(x))!);
  const prevKeys = new Set(prev.map(keyOf));
  const added = fresh.filter((x) => !prevKeys.has(keyOf(x)));
  return [...kept, ...added];
}
