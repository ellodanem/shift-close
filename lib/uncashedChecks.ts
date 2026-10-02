import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { businessTodayYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import {
  adjustOperatingBalance,
  DEFAULT_VENDOR_CHECK_BALANCE,
  type CheckBalanceAccount
} from '@/lib/checkBalanceAccount'

function resolveClearedAt(clearedAt?: Date | null): Date {
  if (clearedAt instanceof Date && !Number.isNaN(clearedAt.getTime())) {
    return clearedAt
  }
  return ymdToUtcNoonDate(businessTodayYmd())
}

export type UncashedCheckSource = 'vendor' | 'cashbook'

export type UncashedCheckRecord = {
  id: string
  source: UncashedCheckSource
  vendorId: string | null
  paymentDate: string
  payee: string
  bankRef: string
  totalAmount: number
  detail: string
  /** Set once a check has cleared. Null while it is still outstanding. */
  balanceAccount: CheckBalanceAccount | null
}

export type ClearedCheckRecord = UncashedCheckRecord & {
  clearedAt: string
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

function clearedVendorBalanceAccount(
  stored: string | null | undefined
): CheckBalanceAccount {
  return stored === 'service_station' ? 'service_station' : 'westline'
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
    vendorId: batch.vendorId,
    paymentDate: batch.paymentDate.toISOString(),
    payee: batch.vendor.name,
    bankRef: batch.bankRef,
    totalAmount: batch.totalAmount,
    detail: batch.invoices.map((inv) => inv.invoiceNumber).join(', '),
    balanceAccount: null
  }))

  const cashbookItems: UncashedCheckRecord[] = cashbookEntries.map((entry) => {
    const categories = entry.allocations
      .map((a) => a.category.name)
      .filter(Boolean)
      .join(', ')

    return {
      id: uncashedCheckId('cashbook', entry.id),
      source: 'cashbook',
      vendorId: null,
      paymentDate: entry.date,
      payee: entry.description.trim() || 'Cashbook expense',
      bankRef: entry.ref?.trim() || '—',
      totalAmount: roundMoney(entry.debitCheck),
      detail: categories || entry.description.trim() || '—',
      balanceAccount: null
    }
  })

  return [...vendorItems, ...cashbookItems].sort((a, b) => {
    const dateCmp = a.paymentDate.localeCompare(b.paymentDate)
    if (dateCmp !== 0) return dateCmp
    const refCmp = a.bankRef.localeCompare(b.bankRef)
    if (refCmp !== 0) return refCmp
    return a.id.localeCompare(b.id)
  })
}

export async function listClearedChecks(): Promise<ClearedCheckRecord[]> {
  const [vendorBatches, cashbookEntries] = await Promise.all([
    prisma.vendorPaymentBatch.findMany({
      where: {
        paymentMethod: 'check',
        clearedAt: { not: null }
      },
      include: {
        vendor: true,
        invoices: true
      },
      orderBy: { paymentDate: 'desc' }
    }),
    prisma.cashbookEntry.findMany({
      where: {
        debitCheck: { gt: 0 },
        clearedAt: { not: null },
        vendorPaymentBatchId: null
      },
      include: {
        allocations: { include: { category: true } }
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
    })
  ])

  const vendorItems: ClearedCheckRecord[] = vendorBatches.map((batch) => ({
    id: uncashedCheckId('vendor', batch.id),
    source: 'vendor',
    vendorId: batch.vendorId,
    paymentDate: batch.paymentDate.toISOString(),
    payee: batch.vendor.name,
    bankRef: batch.bankRef,
    totalAmount: batch.totalAmount,
    detail: batch.invoices.map((inv) => inv.invoiceNumber).join(', '),
    balanceAccount: clearedVendorBalanceAccount(batch.clearedBalanceAccount),
    clearedAt: batch.clearedAt!.toISOString()
  }))

  const cashbookItems: ClearedCheckRecord[] = cashbookEntries.map((entry) => {
    const categories = entry.allocations
      .map((a) => a.category.name)
      .filter(Boolean)
      .join(', ')

    return {
      id: uncashedCheckId('cashbook', entry.id),
      source: 'cashbook',
      vendorId: null,
      paymentDate: entry.date,
      payee: entry.description.trim() || 'Cashbook expense',
      bankRef: entry.ref?.trim() || '—',
      totalAmount: roundMoney(entry.debitCheck),
      detail: categories || entry.description.trim() || '—',
      balanceAccount: 'westline',
      clearedAt: entry.clearedAt!.toISOString()
    }
  })

  return [...vendorItems, ...cashbookItems].sort((a, b) => {
    const clearedCmp = b.clearedAt.localeCompare(a.clearedAt)
    if (clearedCmp !== 0) return clearedCmp
    const dateCmp = b.paymentDate.localeCompare(a.paymentDate)
    if (dateCmp !== 0) return dateCmp
    const refCmp = a.bankRef.localeCompare(b.bankRef)
    if (refCmp !== 0) return refCmp
    return a.id.localeCompare(b.id)
  })
}

export async function sumUncashedChecksBySource(): Promise<{
  vendor: number
  cashbook: number
  total: number
}> {
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

  const vendor = roundMoney(vendorSum._sum.totalAmount ?? 0)
  const cashbook = roundMoney(cashbookSum._sum.debitCheck ?? 0)
  return {
    vendor,
    cashbook,
    total: roundMoney(vendor + cashbook)
  }
}

export async function sumUncashedChecks(): Promise<number> {
  const sums = await sumUncashedChecksBySource()
  return sums.total
}

export async function clearUncashedCheck(
  compositeId: string,
  clearedAt?: Date | null,
  balanceAccount?: CheckBalanceAccount
): Promise<void> {
  const parsed = parseUncashedCheckId(compositeId)
  if (!parsed) {
    throw new Error('Invalid check id')
  }

  const resolvedClearedAt = resolveClearedAt(clearedAt)

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
    const account = balanceAccount ?? DEFAULT_VENDOR_CHECK_BALANCE
    await adjustOperatingBalance(prisma, amount, account, 'deduct')

    await prisma.vendorPaymentBatch.update({
      where: { id: batch.id },
      data: {
        clearedAt: resolvedClearedAt,
        clearedBalanceAccount: account
      }
    })

    await prisma.cashbookEntry.updateMany({
      where: { vendorPaymentBatchId: batch.id },
      data: { clearedAt: resolvedClearedAt }
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
  await adjustOperatingBalance(prisma, amount, 'westline', 'deduct')

  await prisma.cashbookEntry.update({
    where: { id: entry.id },
    data: { clearedAt: resolvedClearedAt }
  })
}

export async function updateCheckClearedAt(
  compositeId: string,
  clearedAt: Date
): Promise<void> {
  const parsed = parseUncashedCheckId(compositeId)
  if (!parsed) {
    throw new Error('Invalid check id')
  }

  if (!(clearedAt instanceof Date) || Number.isNaN(clearedAt.getTime())) {
    throw new Error('Invalid cleared date')
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

    if (!batch.clearedAt) {
      throw new Error('Check is not cleared')
    }

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

  if (!entry.clearedAt) {
    throw new Error('Check is not cleared')
  }

  if (entry.vendorPaymentBatchId) {
    throw new Error('Clear this check from its vendor payment batch')
  }

  await prisma.cashbookEntry.update({
    where: { id: entry.id },
    data: { clearedAt }
  })
}
