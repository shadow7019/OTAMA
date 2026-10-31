import { MediaItem } from "@/lib/tmdb";

export type ViewType = "home" | "movies" | "tv" | "anime" | "studios" | "search" | "mylist";

export interface PlayerTarget {
  item: MediaItem;
  season?: number;
  episode?: number;
}

export interface MediaActions {
  openDetail: (item: MediaItem) => void;
  openPlayer: (item: MediaItem, s?: number, e?: number) => void;
}
