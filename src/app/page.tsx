'use client'

import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { NavBar } from '@/components/otama/nav-bar'
import { Footer } from '@/components/otama/footer'
import { HomeView } from '@/components/otama/home-view'
import { CatalogView } from '@/components/otama/catalog-view'
import { TpbView } from '@/components/otama/tpb-view'
import { SearchView } from '@/components/otama/search-view'
import { FavoritesView } from '@/components/otama/favorites-view'
import { HistoryView } from '@/components/otama/history-view'
import { AuthScreen } from '@/components/otama/auth-screen'
import { DetailOverlay } from '@/components/otama/detail-overlay'
import { PlayerOverlay } from '@/components/otama/player-overlay'
import { DownloadsSheet } from '@/components/otama/downloads-sheet'
import { AboutDialog } from '@/components/otama/about-dialog'
import { Providers, useUser } from '@/components/otama/providers'
import { useAppStore } from '@/store/app-store'

function Views() {
  const view = useAppStore((s) => s.view)
  const query = useAppStore((s) => s.query)
  return (
    <main className="flex-1">
      {view === 'home' ? <HomeView /> : null}
      {view === 'movies' ? <CatalogView type="movie" /> : null}
      {view === 'tv' ? <CatalogView type="tv" /> : null}
      {view === 'anime' ? <CatalogView type="anime" /> : null}
      {view === 'tpb' ? <TpbView /> : null}
      {view === 'favorites' ? <FavoritesView /> : null}
      {view === 'history' ? <HistoryView /> : null}
      {view === 'search' && query.trim() ? <SearchView query={query.trim()} /> : null}
    </main>
  )
}

/**
 * Account gate — nothing personal (history, favorites, continue-watching)
 * is visible until signed in; each account only ever sees its own data.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background" aria-busy="true" aria-label="Loading OTAMA">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" aria-hidden />
        <p className="mt-3 text-sm text-zinc-500">Starting OTAMA…</p>
      </main>
    )
  }
  if (!user) return <AuthScreen />
  return <>{children}</>
}

export default function OtamaApp() {
  return (
    <Providers>
      <AuthGate>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <NavBar />
          <Views />
          <Footer />
          <DetailOverlay />
          <PlayerOverlay />
          <DownloadsSheet />
          <AboutDialog />
          <Toaster theme="dark" position="bottom-center" richColors />
        </div>
      </AuthGate>
    </Providers>
  )
}
