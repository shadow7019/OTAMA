"use client";

import { create } from "zustand";
import type { MediaItem, MediaType } from "./tmdb-constants";

// ---------------- Types ----------------

export type ViewName =
  | "home"
  | "browse"
  | "search"
  | "detail"
  | "watch"
  | "mylist";

export type View =
  | { name: "home" }
  | { name: "browse"; kind: MediaType; genre?: number; language?: string; year?: string }
  | { name: "search"; query: string }
  | { name: "detail"; type: MediaType; id: string }
  | { name: "watch"; type: MediaType; id: string; season?: number; episode?: number }
  | { name: "mylist" };

export type AuthUser = { name: string } | null;

/** Minimal snapshot of a TMDB item so lists render without extra API calls. */
export type Snapshot = {
  id: string; // `${type}-${tmdbId}`
  type: MediaType;
  tmdbId: number;
  name: string;
  year: number | null;
  rating: number;
  poster: string;
  backdrop: string;
  full?: boolean;
};

export function toSnapshot(item: MediaItem): Snapshot {
  return {
    id: `${item.type}-${item.id}`,
    type: item.type,
    tmdbId: item.id,
    name: item.name,
    year: item.year,
    rating: item.rating,
    poster: item.poster,
    backdrop: item.backdrop,
    full: item.full,
  };
}

export type Progress = Snapshot & {
  season?: number;
  episode?: number;
  episodeName?: string;
  seconds: number;
  duration: number;
  updatedAt: number;
  full?: boolean;
};

type Toast = { id: number; title: string; description?: string };

type Store = {
  view: View;
  auth: AuthUser;
  watchlist: Snapshot[]; // newest first
  progress: Record<string, Progress>;
  authOpen: boolean;
  legalModal: "disclaimer" | "dmca" | "terms" | "privacy" | "cookies" | null;
  toasts: Toast[];
  mobileMenuOpen: boolean;
  randomLoading: boolean;

  navigate: (v: View) => void;
  goBack: () => void;
  random: () => Promise<void>;

  toggleWatchlist: (item: MediaItem) => void;
  inWatchlist: (id: string) => boolean;

  saveProgress: (p: Progress) => void;
  clearProgress: (id: string) => void;

  setAuthOpen: (open: boolean) => void;
  setLegalModal: (m: Store["legalModal"]) => void;
  setMobileMenuOpen: (open: boolean) => void;

  signIn: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchAuth: () => Promise<void>;

  toast: (title: string, description?: string) => void;
  dismissToast: (id: number) => void;
};

// localStorage helpers
const LS_WATCHLIST = "cineora.watchlist.v2";
const LS_PROGRESS = "cineora.progress.v2";

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

let toastSeq = 1;

// ---------------- Hash router helpers ----------------

export function viewToHash(v: View): string {
  switch (v.name) {
    case "home":
      return "#/";
    case "mylist":
      return "#/my-list";
    case "browse": {
      const base = v.kind === "movie" ? "#/movies" : "#/tv";
      const params = new URLSearchParams();
      if (v.genre) params.set("genre", String(v.genre));
      if (v.language) params.set("lang", v.language);
      if (v.year) params.set("year", v.year);
      const q = params.toString();
      return q ? `${base}?${q}` : base;
    }
    case "search":
      return `#/search?q=${encodeURIComponent(v.query)}`;
    case "detail":
      return `#/${v.type}/${v.id}`;
    case "watch": {
      const params = new URLSearchParams();
      if (v.season) params.set("s", String(v.season));
      if (v.episode) params.set("e", String(v.episode));
      const q = params.toString();
      return `#/watch/${v.type}/${v.id}${q ? `?${q}` : ""}`;
    }
  }
}

export function hashToView(hash: string): View {
  const h = (hash || "#/").replace(/^#/, "");
  const [path, queryString] = h.split("?");
  const params = new URLSearchParams(queryString || "");
  const segs = path.split("/").filter(Boolean);

  if (segs.length === 0) return { name: "home" };
  switch (segs[0]) {
    case "movies":
      return {
        name: "browse",
        kind: "movie",
        genre: params.get("genre") ? Number(params.get("genre")) : undefined,
        language: params.get("lang") || undefined,
        year: params.get("year") || undefined,
      };
    case "tv":
      if (segs.length === 1) {
        return {
          name: "browse",
          kind: "tv",
          genre: params.get("genre") ? Number(params.get("genre")) : undefined,
          language: params.get("lang") || undefined,
          year: params.get("year") || undefined,
        };
      }
      return { name: "detail", type: "tv", id: segs[1] || "" };
    case "movie":
      return { name: "detail", type: "movie", id: segs[1] || "" };
    case "search":
      return { name: "search", query: params.get("q") || "" };
    case "watch": {
      const s = params.get("s");
      const e = params.get("e");
      return {
        name: "watch",
        type: segs[1] === "tv" ? "tv" : "movie",
        id: segs[2] || "",
        season: s ? Number(s) : undefined,
        episode: e ? Number(e) : undefined,
      };
    }
    case "my-list":
      return { name: "mylist" };
    default:
      return { name: "home" };
  }
}

// ---------------- Store ----------------

export const useStore = create<Store>((set, get) => ({
  view: { name: "home" },
  auth: null,
  watchlist: [],
  progress: {},
  authOpen: false,
  legalModal: null,
  toasts: [],
  mobileMenuOpen: false,
  randomLoading: false,

  navigate: (v) => {
    const hash = viewToHash(v);
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.location.hash = hash; // triggers hashchange -> applies
    } else {
      set({ view: v });
    }
    set({ mobileMenuOpen: false });
  },

  goBack: () => {
    if (typeof window !== "undefined") window.history.back();
  },

  random: async () => {
    if (get().randomLoading) return;
    set({ randomLoading: true });
    try {
      const res = await fetch("/api/tmdb/random");
      if (!res.ok) throw new Error();
      const item = (await res.json()) as MediaItem;
      get().toast("Feeling lucky", `Rolling the dice on ${item.name}…`);
      get().navigate({ name: "detail", type: item.type, id: String(item.id) });
    } catch {
      get().toast("Could not roll the dice", "Please try again.");
    } finally {
      set({ randomLoading: false });
    }
  },

  toggleWatchlist: (item) => {
    const snap = toSnapshot(item);
    const { watchlist } = get();
    const has = watchlist.some((w) => w.id === snap.id);
    const next = has
      ? watchlist.filter((x) => x.id !== snap.id)
      : [snap, ...watchlist];
    saveJSON(LS_WATCHLIST, next);
    set({ watchlist: next });
    get().toast(
      has ? "Removed from My List" : "Added to My List",
      item.name
    );
  },

  inWatchlist: (id) => get().watchlist.some((w) => w.id === id),

  saveProgress: (p) => {
    const progress = { ...get().progress, [p.id]: p };
    saveJSON(LS_PROGRESS, progress);
    set({ progress });
  },

  clearProgress: (id) => {
    const progress = { ...get().progress };
    delete progress[id];
    saveJSON(LS_PROGRESS, progress);
    set({ progress });
  },

  setAuthOpen: (open) => set({ authOpen: open }),
  setLegalModal: (m) => set({ legalModal: m }),
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

  signIn: async (name) => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Sign in failed");
      set({ auth: { name }, authOpen: false });
      get().toast(`Welcome, ${name}`, "You're signed in. Enjoy the show!");
    } catch {
      // fallback: keep client-side session anyway
      set({ auth: { name }, authOpen: false });
      get().toast(`Welcome, ${name}`, "Signed in locally.");
    }
  },

  signOut: async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } catch {
      // ignore
    }
    set({ auth: null });
    get().toast("Signed out", "See you soon!");
  },

  fetchAuth: async () => {
    try {
      const res = await fetch("/api/auth");
      if (res.ok) {
        const data = (await res.json()) as { user?: { name: string } | null };
        if (data.user) set({ auth: { name: data.user.name } });
      }
    } catch {
      // ignore
    }
  },

  toast: (title, description) => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, title, description }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Hydrate persisted state (client only)
export function hydrateStore() {
  if (typeof window === "undefined") return;
  const watchlist = loadJSON<Snapshot[]>(LS_WATCHLIST, []);
  const progress = loadJSON<Record<string, Progress>>(LS_PROGRESS, {});
  useStore.setState({ watchlist, progress });

  // Initialize view from hash
  const view = hashToView(window.location.hash);
  useStore.setState({ view });

  // Listen for hash changes (also handles browser back/forward)
  window.addEventListener("hashchange", () => {
    const v = hashToView(window.location.hash);
    useStore.setState({ view: v, mobileMenuOpen: false });
    window.scrollTo({ top: 0 });
  });

  void useStore.getState().fetchAuth();
}

// ---------------- Derived helpers ----------------

export function continueWatching(): Progress[] {
  const { progress } = useStore.getState();
  return Object.values(progress)
    .filter((p) => {
      const ratio = p.duration > 0 ? p.seconds / p.duration : 0;
      return ratio > 0.004 && ratio < 0.95;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
