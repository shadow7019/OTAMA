"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSyncExternalStore } from "react";
import { ListEntry, MediaItem } from "@/lib/tmdb";

/* One-time migration: carry the pre-rename localStorage payload over so
   watchlist / continue-watching survive the rebrand. */
const STORAGE_KEY = "otama-media-store";
const LEGACY_STORAGE_KEY = "cinex-media-store";
if (
  typeof window !== "undefined" &&
  !window.localStorage.getItem(STORAGE_KEY) &&
  window.localStorage.getItem(LEGACY_STORAGE_KEY)
) {
  window.localStorage.setItem(
    STORAGE_KEY,
    window.localStorage.getItem(LEGACY_STORAGE_KEY) as string
  );
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

interface MediaStore {
  watchlist: ListEntry[];
  continueWatching: ListEntry[];
  /** preferred server audio language in the player ("auto" = no filter) —
   *  tags: sub | eng | dual | multi | hindi | tamil | telugu | malayalam |
   *  kannada | bengali | marathi | punjabi | spa | por | jap | rus | ger… */
  serverLang: string;
  setServerLang: (tag: string) => void;
  /** preferred subtitle language in the player: "auto" (subs on for
   *  Japanese-audio servers) | "off" | an ISO code ("eng", "hin"…) */
  subtitleLang: string;
  setSubtitleLang: (lang: string) => void;
  /** infoHash → timestamp the server last failed playback; dead links are
   *  hidden for DEAD_SERVER_TTL, then re-checked automatically */
  deadServers: Record<string, number>;
  markDeadServers: (ids: string[]) => void;
  reviveServer: (id: string) => void;
  sweepDeadServers: () => void;
  toggleWatchlist: (item: MediaItem, s?: number, e?: number) => boolean;
  removeFromWatchlist: (id: number, mediaType: "movie" | "tv") => void;
  isInWatchlist: (id: number, mediaType: "movie" | "tv") => boolean;
  addContinue: (item: MediaItem, s?: number, e?: number) => void;
  removeContinue: (id: number, mediaType: "movie" | "tv") => void;
  clearContinue: () => void;
}

/** how long a failed server stays hidden before we automatically retry it */
export const DEAD_SERVER_TTL = 6 * 60 * 60 * 1000;

export function isServerDead(
  dead: Record<string, number>,
  id: string,
  now = Date.now()
): boolean {
  const ts = dead[id];
  return typeof ts === "number" && now - ts < DEAD_SERVER_TTL;
}

export const useMediaStore = create<MediaStore>()(
  persist(
    (set, get) => ({
      watchlist: [],
      continueWatching: [],
      serverLang: "auto",
      setServerLang: (tag) => set({ serverLang: tag }),
      subtitleLang: "auto",
      setSubtitleLang: (lang) => set({ subtitleLang: lang }),
      deadServers: {},
      markDeadServers: (ids) =>
        set((st) => {
          const next = { ...st.deadServers };
          const now = Date.now();
          for (const id of ids) next[id] = now;
          return { deadServers: next };
        }),
      reviveServer: (id) =>
        set((st) => {
          if (!(id in st.deadServers)) return st;
          const next = { ...st.deadServers };
          delete next[id];
          return { deadServers: next };
        }),
      sweepDeadServers: () =>
        set((st) => {
          const now = Date.now();
          const next: Record<string, number> = {};
          let changed = false;
          for (const [id, ts] of Object.entries(st.deadServers)) {
            if (now - ts < DEAD_SERVER_TTL) next[id] = ts;
            else changed = true;
          }
          return changed ? { deadServers: next } : st;
        }),

      toggleWatchlist: (item, s, e) => {
        const type = item.media_type === "tv" ? "tv" : "movie";
        const exists = get().isInWatchlist(item.id, type);
        if (exists) {
          set((st) => ({
            watchlist: st.watchlist.filter(
              (w) => !(w.id === item.id && w.media_type === type)
            ),
          }));
          return false;
        }
        const entry: ListEntry = {
          id: item.id,
          media_type: type,
          title:
            item.title || item.name || item.original_title || item.original_name || "Untitled",
          poster_path: item.poster_path ?? null,
          backdrop_path: item.backdrop_path ?? null,
          vote_average: item.vote_average ?? 0,
          release_date: item.release_date || item.first_air_date || "",
          season: s,
          episode: e,
          addedAt: Date.now(),
        };
        set((st) => ({ watchlist: [entry, ...st.watchlist] }));
        return true;
      },

      removeFromWatchlist: (id, mediaType) =>
        set((st) => ({
          watchlist: st.watchlist.filter(
            (w) => !(w.id === id && w.media_type === mediaType)
          ),
        })),

      isInWatchlist: (id, mediaType) =>
        get().watchlist.some((w) => w.id === id && w.media_type === mediaType),

      addContinue: (item, s, e) => {
        const type = item.media_type === "tv" ? "tv" : "movie";
        set((st) => {
          const rest = st.continueWatching.filter(
            (w) => !(w.id === item.id && w.media_type === type)
          );
          const entry: ListEntry = {
            id: item.id,
            media_type: type,
            title:
              item.title || item.name || item.original_title || item.original_name || "Untitled",
            poster_path: item.poster_path ?? null,
            backdrop_path: item.backdrop_path ?? null,
            vote_average: item.vote_average ?? 0,
            release_date: item.release_date || item.first_air_date || "",
            season: s,
            episode: e,
            addedAt: Date.now(),
          };
          return { continueWatching: [entry, ...rest].slice(0, 12) };
        });
      },

      removeContinue: (id, mediaType) =>
        set((st) => ({
          continueWatching: st.continueWatching.filter(
            (w) => !(w.id === id && w.media_type === mediaType)
          ),
        })),

      clearContinue: () => set({ continueWatching: [] }),
    }),
    { name: STORAGE_KEY }
  )
);

/** Avoids hydration mismatches for localStorage-backed state. */
const emptySubscribe = () => () => {};
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
