/**
 * Mark uncashed checks before a cutoff date as cleared (clearedAt only).
 * Historical backfill: does not adjust Balance — these checks were already cashed at the bank.
 *
 * Usage:
 *   node scripts/backfill-clear-checks-before-date.mjs --dry-run
 *   node scripts/backfill-clear-checks-before-date.mjs
 *   node scripts/backfill-clear-checks-before-date.mjs --before=2026-05-01
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const beforeArg = args.find((a) => a.startsWith('--before='))
const beforeYmd = beforeArg?.split('=')[1] ?? '2026-05-01'

if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeYmd)) {
  console.error('Invalid --before date; use YYYY-MM-DD')
  process.exit(1)
}

const vendorCutoff = new Date(`${beforeYmd}T12:00:00.000Z`)

async function main() {
  const vendorWhere = {
    paymentMethod: 'check',
    clearedAt: null,
    paymentDate: { lt: vendorCutoff }
  }

  const cashbookWhere = {
    debitCheck: { gt: 0 },
    clearedAt: null,
    date: { lt: beforeYmd }
  }

  const [vendorBatches, cashbookEntries] = await Promise.all([
    prisma.vendorPaymentBatch.findMany({
      where: vendorWhere,
      select: {
        id: true,
        paymentDate: true,
        bankRef: true,
        totalAmount: true,
        vendor: { select: { name: true } }
      },
      orderBy: { paymentDate: 'asc' }
    }),
    prisma.cashbookEntry.findMany({
      where: {
        ...cashbookWhere,
        vendorPaymentBatchId: null
      },
      select: {
        id: true,
        date: true,
        ref: true,
        description: true,
        debitCheck: true
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ])

  const vendorTotal = vendorBatches.reduce((s, b) => s + b.totalAmount, 0)
  const cashbookTotal = cashbookEntries.reduce((s, e) => s + e.debitCheck, 0)

  console.log(`Cutoff: before ${beforeYmd}`)
  console.log(`Vendor check batches to clear: ${vendorBatches.length} ($${vendorTotal.toFixed(2)})`)
  console.log(`Standalone cashbook checks to clear: ${cashbookEntries.length} ($${cashbookTotal.toFixed(2)})`)
  console.log(`Balance will NOT be adjusted (historical backfill).`)

  if (vendorBatches.length > 0) {
    console.log('\nVendor batches:')
    for (const b of vendorBatches) {
      const d = b.paymentDate.toISOString().slice(0, 10)
      console.log(`  ${d}  #${b.bankRef}  ${b.vendor.name}  $${b.totalAmount.toFixed(2)}`)
    }
  }

  if (cashbookEntries.length > 0) {
    console.log('\nCashbook checks (first 20):')
    for (const e of cashbookEntries.slice(0, 20)) {
      console.log(`  ${e.date}  #${e.ref ?? '—'}  ${e.description.slice(0, 50)}  $${e.debitCheck.toFixed(2)}`)
    }
    if (cashbookEntries.length > 20) {
      console.log(`  ... and ${cashbookEntries.length - 20} more`)
    }
  }

  if (dryRun) {
    console.log('\nDry run — no changes written.')
    return
  }

  const clearedAt = new Date()
  const vendorIds = vendorBatches.map((b) => b.id)
  const cashbookIds = cashbookEntries.map((e) => e.id)

  await prisma.$transaction(async (tx) => {
    if (vendorIds.length > 0) {
      await tx.vendorPaymentBatch.updateMany({
        where: { id: { in: vendorIds } },
        data: { clearedAt }
      })
      await tx.cashbookEntry.updateMany({
        where: { vendorPaymentBatchId: { in: vendorIds } },
        data: { clearedAt }
      })
    }

    if (cashbookIds.length > 0) {
      await tx.cashbookEntry.updateMany({
        where: { id: { in: cashbookIds } },
        data: { clearedAt }
      })
    }
  })

  console.log(`\nDone. Marked ${vendorBatches.length} vendor batch(es) and ${cashbookEntries.length} cashbook check(s) as cleared.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
