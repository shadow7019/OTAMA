'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { EngineTorrent } from '@/lib/types'
import { ensureEngineTransport, engineSocketTarget } from '@/lib/engine'

/** Live torrent state from the OTAMA engine via socket.io.
 *  - Desktop shell / LAN phone: direct to the engine (`http://<host>:<port>`).
 *  - Gateway deployment: through the gateway (`/?XTransformPort=3003`).
 * The transport is auto-detected before connecting (see lib/engine.ts). */
export function useEngineState() {
  const [state, setState] = useState<EngineTorrent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    let socket: Socket | null = null

    const opts = {
      transports: ['websocket', 'polling'] as const,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 10000,
    }

    void (async () => {
      await ensureEngineTransport()
      if (cancelled) return
      const target = engineSocketTarget()
      socket = io(target.url, { ...opts, path: target.path })

      socket.on('connect', () => setConnected(true))
      socket.on('disconnect', () => setConnected(false))
      socket.on('state', (data: { torrents: EngineTorrent[] }) => {
        setState(data.torrents || [])
      })
    })()

    return () => {
      cancelled = true
      socket?.disconnect()
    }
  }, [])

  return { torrents: state, connected }
}
