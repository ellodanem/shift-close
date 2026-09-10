/**
 * Apply known Cstore → Shift Close vendor mappings and merge harvest duplicates.
 * Usage: node --env-file=.env.local scripts/apply-vendor-cstore-mappings.mjs
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/** canonical Shift Close name → exact Cstore label */
const MAP = [
  { keep: 'Dark Seamoss', cstore: 'Dark Seamos', remove: 'Dark Seamos' },
  { keep: 'Food Centre', cstore: 'Food Cente', remove: 'Food Cente' },
  { keep: 'JQ Motors Ltd', cstore: 'J Q MOTORS LTD', remove: 'J Q MOTORS LTD' },
  { keep: 'Patricia Leos', cstore: 'PATRICA LOS', remove: 'PATRICA LOS' },
  { keep: 'Raj Maraj International', cstore: 'Raj Maraj International', remove: 'Raj Marag International' },
  { keep: 'The Order Shop', cstore: 'ORDERSHOP', remove: 'ORDERSHOP' },
  { keep: 'Blue Waters', cstore: 'BLUE WATERS', remove: null },
  { keep: 'CPJ St. Lucia Ltd', cstore: 'CPJ ST LUCIA LTD', remove: null },
  { keep: 'One St. Lucia', cstore: 'one st lucia', remove: null },
  { keep: 'Sammie Bakery', cstore: 'Sammie bakery', remove: null },
  { keep: 'The Ice Factory', cstore: 'THE ICE FACTORY', remove: null },
  { keep: 'Total Auto Inc', cstore: 'Total Auto INc', remove: null },
  { keep: 'Heineken St.Lucia', cstore: 'Heineken St.Lucia', remove: null }
]

async function mergeInvoices(fromId, toId) {
  const fromInvoices = await prisma.vendorInvoice.findMany({ where: { vendorId: fromId } })
  let moved = 0
  let skipped = 0
  for (const inv of fromInvoices) {
    const clash = await prisma.vendorInvoice.findUnique({
      where: {
        vendorId_invoiceNumber: { vendorId: toId, invoiceNumber: inv.invoiceNumber }
      }
    })
    if (clash) {
      // Keep destination; drop source invoice if unpaid and no batch link complexity
      if (inv.status === 'pending') {
        await prisma.vendorInvoice.delete({ where: { id: inv.id } })
        skipped += 1
      } else {
        skipped += 1
      }
      continue
    }
    await prisma.vendorInvoice.update({
      where: { id: inv.id },
      data: { vendorId: toId }
    })
    moved += 1
  }

  const fromBatches = await prisma.vendorPaymentBatch.findMany({ where: { vendorId: fromId } })
  for (const batch of fromBatches) {
    await prisma.vendorPaymentBatch.update({
      where: { id: batch.id },
      data: { vendorId: toId }
    })
  }

  return { moved, skipped, batchesMoved: fromBatches.length }
}

async function main() {
  for (const row of MAP) {
    const keep = await prisma.vendor.findFirst({ where: { name: row.keep } })
    if (!keep) {
      console.log(`SKIP missing keep vendor: ${row.keep}`)
      continue
    }
    await prisma.vendor.update({
      where: { id: keep.id },
      data: { cstoreName: row.cstore }
    })
    console.log(`MAPPED ${row.keep} ← "${row.cstore}"`)

    if (!row.remove) continue
    const remove = await prisma.vendor.findFirst({ where: { name: row.remove } })
    if (!remove || remove.id === keep.id) continue

    const result = await mergeInvoices(remove.id, keep.id)
    console.log(
      `  MERGED from "${row.remove}": moved ${result.moved}, skipped ${result.skipped}, batches ${result.batchesMoved}`
    )

    const left = await prisma.vendor.findUnique({
      where: { id: remove.id },
      include: { _count: { select: { invoices: true, batches: true } } }
    })
    if (left && left._count.invoices === 0 && left._count.batches === 0) {
      await prisma.vendor.delete({ where: { id: remove.id } })
      console.log(`  DELETED empty duplicate "${row.remove}"`)
    } else {
      console.log(
        `  KEEP duplicate "${row.remove}" (still has ${left?._count.invoices || 0} invoices / ${left?._count.batches || 0} batches)`
      )
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
