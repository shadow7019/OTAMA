'use client'

import { useEffect } from 'react'
import { ensureEngineTransport } from '@/lib/engine'

/**
 * Mounts once and resolves the engine transport (gateway vs direct) before
 * any streaming UI is used. Renders nothing — see lib/engine.ts for how the
 * probe works (desktop shell and phone-on-LAN both end up on `direct`).
 */
export function EngineTransportInit() {
  useEffect(() => {
    void ensureEngineTransport()
  }, [])
  return null
}
