'use client'

import { Toaster } from 'sonner'
import { NavBar } from '@/components/otama/nav-bar'
import { Footer } from '@/components/otama/footer'
import { HomeView } from '@/components/otama/home-view'
import { CatalogView } from '@/components/otama/catalog-view'
import { TpbView } from '@/components/otama/tpb-view'
import { SearchView } from '@/components/otama/search-view'
import { FavoritesView } from '@/components/otama/favorites-view'
import { DetailOverlay } from '@/components/otama/detail-overlay'
import { PlayerOverlay } from '@/components/otama/player-overlay'
import { DownloadsSheet } from '@/components/otama/downloads-sheet'
import { AboutDialog } from '@/components/otama/about-dialog'
import { Providers } from '@/components/otama/providers'
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
      {view === 'search' && query.trim() ? <SearchView query={query.trim()} /> : null}
    </main>
  )
}

export default function OtamaApp() {
  return (
    <Providers>
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
    </Providers>
  )
}
