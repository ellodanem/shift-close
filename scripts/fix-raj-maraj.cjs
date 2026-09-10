/**
 * Merge typo vendor "Raj Marag International" into "Raj Maraj International".
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const keep = await prisma.vendor.findFirst({ where: { name: 'Raj Maraj International' } })
  const remove = await prisma.vendor.findFirst({ where: { name: 'Raj Marag International' } })
  if (!keep) throw new Error('Missing Raj Maraj International')
  await prisma.vendor.update({
    where: { id: keep.id },
    data: { cstoreName: 'Raj Maraj International' }
  })
  console.log('Mapped Raj Maraj International ← "Raj Maraj International"')
  if (!remove) {
    console.log('No Raj Marag duplicate to merge')
    return
  }
  const fromInvoices = await prisma.vendorInvoice.findMany({ where: { vendorId: remove.id } })
  let moved = 0
  let skipped = 0
  for (const inv of fromInvoices) {
    const clash = await prisma.vendorInvoice.findUnique({
      where: {
        vendorId_invoiceNumber: { vendorId: keep.id, invoiceNumber: inv.invoiceNumber }
      }
    })
    if (clash) {
      if (inv.status === 'pending') {
        await prisma.vendorInvoice.delete({ where: { id: inv.id } })
      }
      skipped += 1
      continue
    }
    await prisma.vendorInvoice.update({
      where: { id: inv.id },
      data: { vendorId: keep.id }
    })
    moved += 1
  }
  const batches = await prisma.vendorPaymentBatch.findMany({ where: { vendorId: remove.id } })
  for (const batch of batches) {
    await prisma.vendorPaymentBatch.update({
      where: { id: batch.id },
      data: { vendorId: keep.id }
    })
  }
  console.log(`Merged from Raj Marag: moved ${moved}, skipped ${skipped}, batches ${batches.length}`)
  const left = await prisma.vendor.findUnique({
    where: { id: remove.id },
    include: { _count: { select: { invoices: true, batches: true } } }
  })
  if (left && left._count.invoices === 0 && left._count.batches === 0) {
    await prisma.vendor.delete({ where: { id: remove.id } })
    console.log('Deleted empty Raj Marag International')
  } else {
    console.log(
      `Left Raj Marag in place (${left?._count.invoices || 0} invoices / ${left?._count.batches || 0} batches)`
    )
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
