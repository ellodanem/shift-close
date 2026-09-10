import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[t.slice(0, eq)] = v
  }
  return out
}

function quote(v) {
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function withPgbouncer(url) {
  const qAt = url.indexOf('?')
  const base = qAt >= 0 ? url.slice(0, qAt) : url
  const params = new URLSearchParams(qAt >= 0 ? url.slice(qAt + 1) : '')
  if (!params.has('sslmode')) params.set('sslmode', 'require')
  params.set('pgbouncer', 'true')
  return `${base}?${params.toString()}`
}

const local = loadEnvFile(join(root, '.env.local'))
const prod = loadEnvFile(join(root, '.env.production.local'))
const raff = loadEnvFile(join(root, 'app', '.env.raff.local'))
if (!raff.RAFF_POOLED_URL) throw new Error('RAFF_POOLED_URL missing')
if (!prod.AUTH_SECRET) throw new Error('AUTH_SECRET missing from production env pull')

const databaseUrl = withPgbouncer(raff.RAFF_POOLED_URL)
const lines = [
  '# Phase 2: this machine talks to the Raff copy. Vercel production stays on Neon.',
  '# Do not commit. Do not put this DATABASE_URL in Vercel until Phase 3.',
  `DATABASE_URL=${quote(databaseUrl)}`,
  `AUTH_SECRET=${quote(prod.AUTH_SECRET)}`,
  'APP_URL="http://localhost:3000"'
]
if (prod.BLOB_READ_WRITE_TOKEN) {
  lines.push(`BLOB_READ_WRITE_TOKEN=${quote(prod.BLOB_READ_WRITE_TOKEN)}`)
}
if (local.VERCEL_OIDC_TOKEN) {
  lines.push(`VERCEL_OIDC_TOKEN=${quote(local.VERCEL_OIDC_TOKEN)}`)
}
writeFileSync(join(root, '.env.local'), `${lines.join('\n')}\n`, 'utf8')

const parsed = new URL(databaseUrl.replace(/^postgres(ql)?:/i, 'http:'))
console.log(
  `Wrote .env.local DATABASE_URL host=${parsed.hostname} port=${parsed.port} pgbouncer=${parsed.searchParams.get('pgbouncer')}`
)

const prisma = await import('@prisma/client')
const client = new prisma.PrismaClient({
  datasources: { db: { url: databaseUrl } }
})
try {
  const [staff, shifts, users] = await Promise.all([
    client.staff.count(),
    client.shiftClose.count(),
    client.appUser.count()
  ])
  console.log(`Prisma via Raff pooled: staff=${staff} shift_close=${shifts} app_users=${users}`)
} finally {
  await client.$disconnect()
}
