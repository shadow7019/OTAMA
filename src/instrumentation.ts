/**
 * Next.js instrumentation hook — runs once per server process at boot.
 *
 * Spawns/adopts the OTAMA torrent-streaming engine (port 3003) so every web
 * deployment — sandbox dev, Z.ai hosting, self-hosted `next start` — can
 * actually stream. See src/lib/server/engine-supervisor.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { ensureEngineSupervisor } = await import('@/lib/server/engine-supervisor')
    // Fire-and-forget: boot must never block or fail on the engine.
    void ensureEngineSupervisor().catch((err) =>
      console.error('[otama-engine] supervisor error:', (err as Error).message),
    )
  } catch (err) {
    console.error('[otama-engine] instrumentation error:', (err as Error).message)
  }
}
