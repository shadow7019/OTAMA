import { PrismaClient } from '@prisma/client'

/**
 * Lazy Prisma handle.
 *
 * Constructing PrismaClient at MODULE LOAD time turns any engine/path problem
 * (missing query engine in a packaged build, unwritable path, corrupt env) into
 * a module-load crash. Next.js then answers every API route that (indirectly)
 * imports this module with a plain-text 500 — which the client JSON parser
 * surfaces as the cryptic "Unexpected token …" error (seen in the Android LAN
 * report). By deferring construction to the first actual query, every route's
 * existing try/catch keeps working and failures degrade to clean JSON errors.
 */
const globalForPrisma = globalThis as unknown as {
  otamaPrisma?: PrismaClient
}

function getClient(): PrismaClient {
  if (!globalForPrisma.otamaPrisma) {
    globalForPrisma.otamaPrisma = new PrismaClient({
      log: ['query'],
    })
  }
  return globalForPrisma.otamaPrisma
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
