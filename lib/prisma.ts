import { PrismaClient } from '@prisma/client'

/** One pooled connection per instance. Raff's gateway currently refuses the pooled port past 60. */
function databaseUrl() {
  const raw = process.env.DATABASE_URL
  if (!raw) return undefined
  const qAt = raw.indexOf('?')
  const base = qAt >= 0 ? raw.slice(0, qAt) : raw
  const params = new URLSearchParams(qAt >= 0 ? raw.slice(qAt + 1) : '')
  if (params.get('pgbouncer') !== 'true') return raw
  if (!params.has('connection_limit')) params.set('connection_limit', '1')
  return `${base}?${params.toString()}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const url = databaseUrl()
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(url ? { datasources: { db: { url } } } : undefined)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

