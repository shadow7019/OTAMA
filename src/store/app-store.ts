'use client'

import { create } from 'zustand'
import type { PlayerPayload, TorrentOption } from '@/lib/types'

export type View = 'home' | 'movies' | 'tv' | 'anime' | 'tpb' | 'favorites' | 'search'

export interface DetailPayload {
  kind: 'movie' | 'tv' | 'anime'
  imdbId?: string
  title: string
  poster?: string
  year?: number
  /** When set (e.g. anime opened straight from Nyaa), show these torrents directly. */
  directTorrents?: TorrentOption[]
}

interface AppState {
  view: View
  query: string
  detail: DetailPayload | null
  player: PlayerPayload | null
  downloadsOpen: boolean
  aboutOpen: boolean
  setView: (v: View) => void
  setQuery: (q: string) => void
  openDetail: (d: DetailPayload) => void
  closeDetail: () => void
  openPlayer: (p: PlayerPayload) => void
  closePlayer: () => void
  setDownloadsOpen: (b: boolean) => void
  setAboutOpen: (b: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'home',
  query: '',
  detail: null,
  player: null,
  downloadsOpen: false,
  aboutOpen: false,
  setView: (view) => set({ view }),
  setQuery: (query) => set({ query, view: query.trim().length > 0 ? 'search' : 'home' }),
  openDetail: (detail) => set({ detail }),
  closeDetail: () => set({ detail: null }),
  openPlayer: (player) => set({ player }),
  closePlayer: () => set({ player: null }),
  setDownloadsOpen: (downloadsOpen) => set({ downloadsOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
}))
