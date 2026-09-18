'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { EngineTorrent } from '@/lib/types'
import { isDesktop, desktopEnginePort } from '@/lib/engine'

/** Live torrent state from the OTAMA engine via socket.io.
 *  - Web: through the gateway (`/?XTransformPort=3003`).
 *  - Desktop: direct to the embedded engine on 127.0.0.1:<port>. */
export function useEngineState() {
  const [state, setState] = useState<EngineTorrent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const opts = {
      transports: ['websocket', 'polling'] as const,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 10000,
    }
    // Never use the port in the URL on the web, always XTransformPort (gateway routing).
    const socket: Socket = isDesktop()
      ? io(`http://127.0.0.1:${desktopEnginePort()}`, { ...opts, path: '/socket.io' })
      : io('/?XTransformPort=3003', opts)

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('state', (data: { torrents: EngineTorrent[] }) => {
      setState(data.torrents || [])
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return { torrents: state, connected }
}
