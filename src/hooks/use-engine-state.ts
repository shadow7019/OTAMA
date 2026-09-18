'use client'

import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { EngineTorrent } from '@/lib/types'

/** Live torrent state from the OTAMA engine via socket.io (through the gateway). */
export function useEngineState() {
  const [state, setState] = useState<EngineTorrent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    // Never use the port in the URL, always use XTransformPort (gateway routing)
    const socket: Socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 10000,
    })

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
