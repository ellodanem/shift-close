/**
 * Creates the cstore_day_reports table (idempotent) and seeds the real Cstore daily report
 * figures for Nov 3 and Nov 4 2026 so End of Day V2 has something to compare.
 *
 * Usage (never prints the connection string):
 *   node scripts/seed-cstore-day-reports.cjs            -> uses app/.env.raff.local (bare URL or KEY=URL)
 *   node --env-file=.env.local scripts/seed-cstore-day-reports.cjs   -> uses DATABASE_URL
 *
 * Rows already saved by the agent are left alone.
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

function urlFromFile() {
  const file = path.join(__dirname, '..', 'app', '.env.raff.local')
  if (!fs.existsSync(file)) return null
  let text = fs.readFileSync(file, 'utf8').trim()
  if (!text) return null
  text = text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#')) || ''
  text = text.replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, '').trim().replace(/^["']|["']$/g, '')
  return text || null
}

function withPoolerParams(url) {
  if (!/:6543\b/.test(url)) return url
  const extra = []
  if (!/pgbouncer=/.test(url)) extra.push('pgbouncer=true')
  if (!/connection_limit=/.test(url)) extra.push('connection_limit=1')
  if (extra.length === 0) return url
  return url + (url.includes('?') ? '&' : '?') + extra.join('&')
}

const DAYS = [
  {
    date: '2026-11-04',
    grocery: 2766.23,
    salesTax: 221.6,
    regularAmt: 29097.02,
    dieselAmt: 14940.98,
    custAccountPayIn: 0,
    totalSales: 47025.83,
    depositsTyped: 32997.37,
    fleetBatch: 3347.88,
    creditDebitBatch: 9699.1,
    custAccountSales: 1669.19,
    totalCollections: 47713.54,
    shortOver: 687.71,
    regularLitres: 7677.3,
    dieselLitres: 3942.2,
    tankJson: { regular: { opening: 12346.0, closing: 4668.7, os: -5.7 }, diesel: { os: -16.8 } }
  },
  {
    date: '2026-11-03',
    grocery: 2696.73,
    salesTax: 204.02,
    regularAmt: 24889.83,
    dieselAmt: 13787.4,
    custAccountPayIn: 975.19,
    totalSales: 42553.17,
    depositsTyped: 25022.5,
    fleetBatch: 3221.24,
    creditDebitBatch: 9004.97,
    custAccountSales: 1507.94,
    totalCollections: 38756.65,
    shortOver: -3796.52,
    regularLitres: 6567.3,
    dieselLitres: 3637.8,
    tankJson: { regular: { os: 12.3 }, diesel: { os: 24.8 } }
  }
]

async function main() {
  const raw = process.env.CSTORE_SEED_USE_ENV === '1' ? process.env.DATABASE_URL : urlFromFile() || process.env.DATABASE_URL
  if (!raw) throw new Error('No database URL found (app/.env.raff.local or DATABASE_URL).')
  const prisma = new PrismaClient({ datasourceUrl: withPoolerParams(raw) })
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'prisma', 'migrations', '20261106120000_cstore_day_reports', 'migration.sql'),
      'utf8'
    )
    const statements = sql
      .split(';')
      .map((s) => s.replace(/--.*$/gm, '').trim())
      .filter(Boolean)
    for (const stmt of statements) await prisma.$executeRawUnsafe(stmt)
    console.log(`Table ready (${statements.length} statements).`)

    for (const day of DAYS) {
      const existing = await prisma.cstoreDayReport.findUnique({ where: { date: day.date } })
      if (existing && existing.source === 'agent') {
        console.log(`${day.date}: agent-saved row kept.`)
        continue
      }
      const { date, ...data } = day
      await prisma.cstoreDayReport.upsert({
        where: { date },
        create: { date, ...data, source: 'manual' },
        update: { ...data, source: 'manual', pulledAt: new Date() }
      })
      console.log(`${date}: saved.`)
    }
    console.log('Rows in cstore_day_reports:', await prisma.cstoreDayReport.count())
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
