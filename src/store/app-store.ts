'use client'

import { create } from 'zustand'
import type { PlayerPayload, TorrentOption } from '@/lib/types'

export type View = 'home' | 'movies' | 'tv' | 'anime' | 'tpb' | 'favorites' | 'history' | 'search'

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

/* ---------------- overlay history integration ----------------
 * Every overlay open pushes a real history entry so the phone back
 * button (Android) / swipe-back (iOS) walks out of overlays one layer
 * at a time — closing the player, then the detail screen — instead of
 * exiting the app. Native shells additionally fall back to a synthetic
 * Escape via window.__otamaOverlayOpen (see dispatchPageBack). */
let overlayDepth = 0
let expectingPop = false

function pushOverlayState() {
  overlayDepth++
  try {
    window.history.pushState({ otamaOverlay: overlayDepth }, '')
  } catch {
    overlayDepth--
  }
}

/** Unwind one pushed entry after a UI-initiated close (the async popstate is swallowed). */
function consumeOverlayState() {
  if (overlayDepth <= 0 || expectingPop) return
  overlayDepth--
  expectingPop = true
  try {
    window.history.back()
  } catch {
    expectingPop = false
  }
}

function closeTopOverlay() {
  const s = useAppStore.getState()
  if (s.player) setPlayer(null)
  else if (s.detail) setDetail(null)
}

function setPlayer(p: PlayerPayload | null) {
  useAppStore.setState({ player: p })
}

function setDetail(d: DetailPayload | null) {
  useAppStore.setState({ detail: d })
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (expectingPop) {
      expectingPop = false
      return
    }
    if (overlayDepth > 0) overlayDepth--
    closeTopOverlay()
  })

  // Native shells (Android/iOS) probe this to decide whether back should
  // close an overlay or the app itself.
  ;(window as unknown as { __otamaOverlayOpen?: () => boolean }).__otamaOverlayOpen = () => {
    const s = useAppStore.getState()
    return !!s.player || !!s.detail || s.downloadsOpen || s.aboutOpen
  }
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
  openDetail: (detail) => {
    pushOverlayState()
    set({ detail })
  },
  closeDetail: () => {
    if (!useAppStore.getState().detail) return
    set({ detail: null })
    consumeOverlayState()
  },
  openPlayer: (player) => {
    pushOverlayState()
    set({ player })
  },
  closePlayer: () => {
    if (!useAppStore.getState().player) return
    set({ player: null })
    consumeOverlayState()
  },
  setDownloadsOpen: (downloadsOpen) => set({ downloadsOpen }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
}))
