import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

export type UncashedCheckSource = 'vendor' | 'cashbook'

export type UncashedCheckRecord = {
  id: string
  source: UncashedCheckSource
  paymentDate: string
  payee: string
  bankRef: string
  totalAmount: number
  detail: string
}

export function parseUncashedCheckId(
  compositeId: string
): { source: UncashedCheckSource; rawId: string } | null {
  const vendorPrefix = 'vendor:'
  const cashbookPrefix = 'cashbook:'

  if (compositeId.startsWith(vendorPrefix)) {
    return { source: 'vendor', rawId: compositeId.slice(vendorPrefix.length) }
  }
  if (compositeId.startsWith(cashbookPrefix)) {
    return { source: 'cashbook', rawId: compositeId.slice(cashbookPrefix.length) }
  }

  // Backwards compatibility: bare id = vendor payment batch
  if (compositeId.length > 0) {
    return { source: 'vendor', rawId: compositeId }
  }

  return null
}

export function uncashedCheckId(source: UncashedCheckSource, rawId: string) {
  return `${source}:${rawId}`
}

async function deductFromBalance(amount: number) {
  const existingBalance = await prisma.balance.findUnique({
    where: { id: 'balance' }
  })

  if (existingBalance) {
    const updatedAvailable = roundMoney(existingBalance.availableFunds - amount)
    await prisma.balance.update({
      where: { id: 'balance' },
      data: {
        availableFunds: updatedAvailable,
        balanceAfter: roundMoney(updatedAvailable - existingBalance.planned)
      }
    })
  } else {
    await prisma.balance.create({
      data: {
        id: 'balance',
        currentBalance: 0,
        availableFunds: roundMoney(0 - amount),
        planned: 0,
        balanceAfter: roundMoney(0 - amount)
      }
    })
  }
}

export async function listUncashedChecks(): Promise<UncashedCheckRecord[]> {
  const [vendorBatches, cashbookEntries] = await Promise.all([
    prisma.vendorPaymentBatch.findMany({
      where: {
        paymentMethod: 'check',
        clearedAt: null
      },
      include: {
        vendor: true,
        invoices: true
      },
      orderBy: { paymentDate: 'asc' }
    }),
    prisma.cashbookEntry.findMany({
      where: {
        debitCheck: { gt: 0 },
        clearedAt: null,
        vendorPaymentBatchId: null
      },
      include: {
        allocations: { include: { category: true } }
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ])

  const vendorItems: UncashedCheckRecord[] = vendorBatches.map((batch) => ({
    id: uncashedCheckId('vendor', batch.id),
    source: 'vendor',
    paymentDate: batch.paymentDate.toISOString(),
    payee: batch.vendor.name,
    bankRef: batch.bankRef,
    totalAmount: batch.totalAmount,
    detail: batch.invoices.map((inv) => inv.invoiceNumber).join(', ')
  }))

  const cashbookItems: UncashedCheckRecord[] = cashbookEntries.map((entry) => {
    const categories = entry.allocations
      .map((a) => a.category.name)
      .filter(Boolean)
      .join(', ')

    return {
      id: uncashedCheckId('cashbook', entry.id),
      source: 'cashbook',
      paymentDate: entry.date,
      payee: entry.description.trim() || 'Cashbook expense',
      bankRef: entry.ref?.trim() || '—',
      totalAmount: roundMoney(entry.debitCheck),
      detail: categories || entry.description.trim() || '—'
    }
  })

  return [...vendorItems, ...cashbookItems].sort((a, b) => {
    const dateCmp = a.paymentDate.localeCompare(b.paymentDate)
    if (dateCmp !== 0) return dateCmp
    return a.bankRef.localeCompare(b.bankRef)
  })
}

export async function sumUncashedChecks(): Promise<number> {
  const [vendorSum, cashbookSum] = await Promise.all([
    prisma.vendorPaymentBatch.aggregate({
      where: {
        paymentMethod: 'check',
        clearedAt: null
      },
      _sum: { totalAmount: true }
    }),
    prisma.cashbookEntry.aggregate({
      where: {
        debitCheck: { gt: 0 },
        clearedAt: null,
        vendorPaymentBatchId: null
      },
      _sum: { debitCheck: true }
    })
  ])

  return roundMoney(
    (vendorSum._sum.totalAmount ?? 0) + (cashbookSum._sum.debitCheck ?? 0)
  )
}

export async function clearUncashedCheck(compositeId: string): Promise<void> {
  const parsed = parseUncashedCheckId(compositeId)
  if (!parsed) {
    throw new Error('Invalid check id')
  }

  if (parsed.source === 'vendor') {
    const batch = await prisma.vendorPaymentBatch.findUnique({
      where: { id: parsed.rawId }
    })

    if (!batch) {
      throw new Error('Batch not found')
    }

    if (batch.paymentMethod !== 'check') {
      throw new Error('Only check payments can be cleared')
    }

    if (batch.clearedAt) {
      throw new Error('Check already cleared')
    }

    const amount = roundMoney(batch.totalAmount)
    await deductFromBalance(amount)

    const clearedAt = new Date()
    await prisma.vendorPaymentBatch.update({
      where: { id: batch.id },
      data: { clearedAt }
    })

    await prisma.cashbookEntry.updateMany({
      where: { vendorPaymentBatchId: batch.id },
      data: { clearedAt }
    })

    return
  }

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id: parsed.rawId }
  })

  if (!entry) {
    throw new Error('Cashbook entry not found')
  }

  if (entry.debitCheck <= 0) {
    throw new Error('Entry is not a check payment')
  }

  if (entry.clearedAt) {
    throw new Error('Check already cleared')
  }

  if (entry.vendorPaymentBatchId) {
    throw new Error('Clear this check from its vendor payment batch')
  }

  const amount = roundMoney(entry.debitCheck)
  await deductFromBalance(amount)

  await prisma.cashbookEntry.update({
    where: { id: entry.id },
    data: { clearedAt: new Date() }
  })
}
