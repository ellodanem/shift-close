/**
 * Remove October 2026 grocery bills that harvest filed under Acado by mistake.
 * Keeps the three real Cstore Acado invoices (Check #26).
 *
 * Usage:
 *   node scripts/clean-october-acado-invoices.cjs
 *   node scripts/clean-october-acado-invoices.cjs --apply
 */
const { PrismaClient } = require('@prisma/client')

const YEAR = 2026
const MONTH = 10
const KEEP_NUMBERS = new Set(['2073606', '2075453', '2078496'])
const APPLY = process.argv.includes('--apply')

function databaseUrl() {
  const candidates = [
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL
  ]
  for (const raw of candidates) {
    if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) continue
    const qAt = raw.indexOf('?')
    const base = qAt >= 0 ? raw.slice(0, qAt) : raw
    const params = new URLSearchParams(qAt >= 0 ? raw.slice(qAt + 1) : '')
    if (params.get('pgbouncer') === 'true' && !params.has('connection_limit')) {
      params.set('connection_limit', '1')
      return `${base}?${params.toString()}`
    }
    return raw
  }
  return undefined
}

function hostLabel(raw) {
  try {
    const u = new URL(String(raw).replace(/^postgres(ql)?:/i, 'http:'))
    return `${u.hostname}:${u.port || '5432'}`
  } catch {
    return '(unknown)'
  }
}

function ymd(date) {
  return new Date(date).toISOString().slice(0, 10)
}

function monthBounds() {
  const start = new Date(Date.UTC(YEAR, MONTH - 1, 1, 12, 0, 0))
  const lastDay = new Date(YEAR, MONTH, 0).getDate()
  const end = new Date(Date.UTC(YEAR, MONTH - 1, lastDay, 12, 0, 0))
  return { start, end }
}

async function main() {
  const url = databaseUrl()
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } })
  const { start, end } = monthBounds()

  try {
    const vendor = await prisma.vendor.findFirst({
      where: {
        OR: [
          { name: { equals: 'Acado', mode: 'insensitive' } },
          { cstoreName: { equals: 'Acado', mode: 'insensitive' } }
        ]
      }
    })
    if (!vendor) {
      console.log(`No Acado vendor on ${hostLabel(url)}`)
      return
    }

    const [invoices, pendingAll] = await Promise.all([
      prisma.vendorInvoice.findMany({
        where: {
          vendorId: vendor.id,
          invoiceDate: { gte: start, lte: end }
        },
        include: { paidInvoice: { select: { id: true, batchId: true } } },
        orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }]
      }),
      prisma.vendorInvoice.findMany({
        where: { vendorId: vendor.id, status: 'pending' },
        select: { invoiceNumber: true, invoiceDate: true }
      })
    ])
    const pendingByMonth = {}
    for (const row of pendingAll) {
      const key = ymd(row.invoiceDate).slice(0, 7)
      pendingByMonth[key] = (pendingByMonth[key] || 0) + 1
    }

    const keep = invoices.filter((row) => KEEP_NUMBERS.has(row.invoiceNumber))
    const remove = invoices.filter((row) => !KEEP_NUMBERS.has(row.invoiceNumber))
    const pendingRemove = remove.filter((row) => row.status !== 'paid' && !row.paidInvoice)
    const blocked = remove.filter((row) => row.status === 'paid' || row.paidInvoice)

    console.log(
      JSON.stringify(
        {
          host: hostLabel(url),
          apply: APPLY,
          vendor: { id: vendor.id, name: vendor.name, cstoreName: vendor.cstoreName },
          pendingByMonth,
          octoberTotal: invoices.length,
          keep: keep.map((row) => ({
            number: row.invoiceNumber,
            date: ymd(row.invoiceDate),
            amount: row.amount,
            vat: row.vat,
            status: row.status
          })),
          removePending: pendingRemove.map((row) => ({
            number: row.invoiceNumber,
            date: ymd(row.invoiceDate),
            amount: row.amount,
            status: row.status
          })),
          blockedPaid: blocked.map((row) => ({
            number: row.invoiceNumber,
            date: ymd(row.invoiceDate),
            amount: row.amount,
            status: row.status,
            batchId: row.paidInvoice?.batchId || null
          }))
        },
        null,
        2
      )
    )

    if (!APPLY) {
      console.log(
        `Dry run: would delete ${pendingRemove.length} pending Acado invoices; ${keep.length} kept; ${blocked.length} paid left in place.`
      )
      return
    }

    if (pendingRemove.length === 0) {
      console.log('Nothing to delete')
      return
    }

    const result = await prisma.vendorInvoice.deleteMany({
      where: { id: { in: pendingRemove.map((row) => row.id) } }
    })
    console.log(`Deleted ${result.count} pending Acado invoices for October ${YEAR}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
