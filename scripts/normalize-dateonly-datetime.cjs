/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function normalizeUtcNoonIfMidnight(value) {
  if (!(value instanceof Date)) return value
  if (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  ) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12, 0, 0, 0))
  }
  return value
}

async function normalizeModelField(modelName, fieldName, nullable = false) {
  const model = prisma[modelName]
  const rows = await model.findMany({
    select: { id: true, [fieldName]: true }
  })
  let changed = 0
  for (const row of rows) {
    const current = row[fieldName]
    if (nullable && current == null) continue
    const next = normalizeUtcNoonIfMidnight(current)
    if (next instanceof Date && current instanceof Date && next.getTime() !== current.getTime()) {
      await model.update({
        where: { id: row.id },
        data: { [fieldName]: next }
      })
      changed++
    }
  }
  return changed
}

async function main() {
  const results = []
  results.push(['invoice.invoiceDate', await normalizeModelField('invoice', 'invoiceDate')])
  results.push(['invoice.dueDate', await normalizeModelField('invoice', 'dueDate')])
  results.push(['paidInvoice.invoiceDate', await normalizeModelField('paidInvoice', 'invoiceDate')])
  results.push(['paidInvoice.dueDate', await normalizeModelField('paidInvoice', 'dueDate')])
  results.push(['paymentBatch.paymentDate', await normalizeModelField('paymentBatch', 'paymentDate')])
  results.push(['vendorInvoice.invoiceDate', await normalizeModelField('vendorInvoice', 'invoiceDate')])
  results.push(['vendorInvoice.dueDate', await normalizeModelField('vendorInvoice', 'dueDate', true)])
  results.push(['paidVendorInvoice.invoiceDate', await normalizeModelField('paidVendorInvoice', 'invoiceDate')])
  results.push(['vendorPaymentBatch.paymentDate', await normalizeModelField('vendorPaymentBatch', 'paymentDate')])

  console.log('Normalized rows (midnight UTC -> noon UTC):')
  for (const [label, count] of results) {
    console.log(`${label}: ${count}`)
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
