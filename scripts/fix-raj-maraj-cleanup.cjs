const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const remove = await prisma.vendor.findFirst({
    where: { name: 'Raj Marag International' },
    include: {
      _count: { select: { invoices: true, batches: true } },
      invoices: { select: { id: true, invoiceNumber: true, status: true } }
    }
  })
  console.log(JSON.stringify(remove, null, 2))
  if (!remove) {
    console.log('Already gone')
    return
  }
  // Remaining invoices are duplicates already on Raj Maraj — drop them.
  await prisma.vendorInvoice.deleteMany({ where: { vendorId: remove.id } })
  await prisma.vendorPaymentBatch.deleteMany({ where: { vendorId: remove.id } })
  await prisma.vendor.delete({ where: { id: remove.id } })
  console.log('Deleted Raj Marag International and leftover duplicates')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
