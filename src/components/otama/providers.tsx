'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Account session context. The server owns the truth (httpOnly session
 * cookie); the client just mirrors { user | null } from /api/auth/me.
 */
interface UserState {
  user: { id: string; username: string } | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const UserCtx = createContext<UserState>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} })

export function useUser() {
  return useContext(UserCtx)
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserState['user']>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' })
      const d = await r.json()
      setUser(d.user ?? null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
    setUser(null)
  }, [])

  return <UserCtx.Provider value={{ user, loading, refresh, logout }}>{children}</UserCtx.Provider>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <UserProvider>{children}</UserProvider>
    </QueryClientProvider>
  )
}
