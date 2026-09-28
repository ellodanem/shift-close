import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

const SYNC_STATUSES = new Set(['closed', 'reviewed', 'reopened'])

export type ShiftCardIncomeKind = 'credit' | 'debit'

export type ShiftCardIncomeLine = {
  kind: ShiftCardIncomeKind
  categoryName: string
  description: string
  amount: number
}

const CARD_INCOME: Array<{
  kind: ShiftCardIncomeKind
  categoryName: string
  read: (shift: { otherCredit: number | null; systemDebit: number | null }) => number | null
}> = [
  {
    kind: 'credit',
    categoryName: 'Credit Card',
    read: (shift) => shift.otherCredit
  },
  {
    kind: 'debit',
    categoryName: 'Debit Card',
    read: (shift) => shift.systemDebit
  }
]

/** Closed-shift credit and debit are income. Zero amounts are omitted. */
export function shiftCardIncomeLines(shift: {
  otherCredit: number | null
  systemDebit: number | null
}): ShiftCardIncomeLine[] {
  return CARD_INCOME.map((line) => ({
    kind: line.kind,
    categoryName: line.categoryName,
    description: 'Card Transactions',
    amount: roundMoney(Number(line.read(shift)) || 0)
  })).filter((line) => line.amount > 0)
}

async function getOrCreateIncomeCategory(name: string) {
  let cat = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, type: 'income' }
  })
  if (!cat) {
    cat = await prisma.cashbookCategory.create({
      data: { name, code: null, type: 'income', sortOrder: 0, active: true }
    })
  }
  return cat
}

/**
 * Upsert/delete cashbook income rows for credit and debit on a closed shift.
 * Skips drafts. A deleted row stays gone until credit or debit changes again.
 */
export async function syncShiftCardIncomeToCashbook(shiftId: string): Promise<void> {
  const shift = await prisma.shiftClose.findUnique({
    where: { id: shiftId },
    select: { id: true, date: true, status: true, otherCredit: true, systemDebit: true }
  })
  if (!shift || !SYNC_STATUSES.has(shift.status)) return

  const wanted = new Map(shiftCardIncomeLines(shift).map((line) => [line.kind, line]))
  const existing = await prisma.cashbookEntry.findMany({
    where: { shiftId, shiftIncomeKind: { in: ['credit', 'debit'] } }
  })
  const existingByKind = new Map(
    existing
      .filter((entry) => entry.shiftIncomeKind === 'credit' || entry.shiftIncomeKind === 'debit')
      .map((entry) => [entry.shiftIncomeKind as ShiftCardIncomeKind, entry])
  )

  for (const spec of CARD_INCOME) {
    const line = wanted.get(spec.kind)
    const entry = existingByKind.get(spec.kind)
    if (!line) {
      if (entry) await prisma.cashbookEntry.delete({ where: { id: entry.id } })
      continue
    }
    const category = await getOrCreateIncomeCategory(spec.categoryName)
    const entryData = {
      date: shift.date,
      description: line.description,
      ref: null as string | null,
      debitCash: 0,
      debitCheck: 0,
      debitEcard: 0,
      debitDcard: 0,
      creditAmt: line.amount,
      bank: null as string | null,
      paymentMethod: null as string | null,
      shiftId: shift.id,
      shiftIncomeKind: spec.kind
    }
    if (entry) {
      await prisma.cashbookEntry.update({
        where: { id: entry.id },
        data: {
          ...entryData,
          allocations: {
            deleteMany: {},
            create: { categoryId: category.id, amount: line.amount }
          }
        }
      })
    } else {
      await prisma.cashbookEntry.create({
        data: {
          ...entryData,
          allocations: { create: { categoryId: category.id, amount: line.amount } }
        }
      })
    }
  }
}

export async function syncCashbookEntryToShiftCardIncome(entryId: string, amount: number): Promise<void> {
  const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } })
  if (!entry?.shiftId || (entry.shiftIncomeKind !== 'credit' && entry.shiftIncomeKind !== 'debit')) return
  const shift = await prisma.shiftClose.findUnique({ where: { id: entry.shiftId } })
  if (!shift || !SYNC_STATUSES.has(shift.status)) return
  await prisma.shiftClose.update({
    where: { id: shift.id },
    data:
      entry.shiftIncomeKind === 'credit'
        ? { otherCredit: roundMoney(amount) }
        : { systemDebit: roundMoney(amount) }
  })
}

export function shouldSyncCardIncomeAfterShiftUpdate(
  previousStatus: string,
  nextStatus: string,
  creditOrDebitChanged: boolean
): boolean {
  if (!SYNC_STATUSES.has(nextStatus)) return false
  if (creditOrDebitChanged) return true
  return !SYNC_STATUSES.has(previousStatus) && SYNC_STATUSES.has(nextStatus)
}

export async function syncAllClosedShiftCardIncome(): Promise<number> {
  const shifts = await prisma.shiftClose.findMany({
    where: { status: { in: ['closed', 'reviewed', 'reopened'] } },
    select: { id: true, date: true, otherCredit: true, systemDebit: true }
  })
  const existing = await prisma.cashbookEntry.findMany({
    where: { shiftIncomeKind: { in: ['credit', 'debit'] } },
    select: { id: true, shiftId: true, shiftIncomeKind: true, creditAmt: true, date: true }
  })
  const existingByKey = new Map(
    existing
      .filter((entry) => entry.shiftId && entry.shiftIncomeKind)
      .map((entry) => [`${entry.shiftId}:${entry.shiftIncomeKind}`, entry])
  )
  const creditCategory = await getOrCreateIncomeCategory('Credit Card')
  const debitCategory = await getOrCreateIncomeCategory('Debit Card')

  const creates: Array<{
    shiftId: string
    date: string
    kind: ShiftCardIncomeKind
    amount: number
    categoryId: string
  }> = []
  const updates: Array<{ id: string; date: string; amount: number; categoryId: string }> = []
  const deleteIds: string[] = []

  for (const shift of shifts) {
    for (const spec of CARD_INCOME) {
      const amount = roundMoney(Number(spec.read(shift)) || 0)
      const key = `${shift.id}:${spec.kind}`
      const entry = existingByKey.get(key)
      const categoryId = spec.kind === 'credit' ? creditCategory.id : debitCategory.id
      if (amount <= 0) {
        if (entry) deleteIds.push(entry.id)
        continue
      }
      if (!entry) {
        creates.push({ shiftId: shift.id, date: shift.date, kind: spec.kind, amount, categoryId })
      } else if (entry.date !== shift.date || Math.abs(entry.creditAmt - amount) > 0.001) {
        updates.push({ id: entry.id, date: shift.date, amount, categoryId })
      }
    }
  }

  if (deleteIds.length > 0) {
    await prisma.cashbookEntry.deleteMany({ where: { id: { in: deleteIds } } })
  }
  if (creates.length > 0) {
    await prisma.cashbookEntry.createMany({
      data: creates.map((row) => ({
        date: row.date,
        description: 'Card Transactions',
        ref: null,
        debitCash: 0,
        debitCheck: 0,
        debitEcard: 0,
        debitDcard: 0,
        creditAmt: row.amount,
        paymentMethod: null,
        shiftId: row.shiftId,
        shiftIncomeKind: row.kind
      }))
    })
    const unallocated = await prisma.cashbookEntry.findMany({
      where: {
        shiftIncomeKind: { in: ['credit', 'debit'] },
        allocations: { none: {} }
      },
      select: { id: true, shiftIncomeKind: true, creditAmt: true }
    })
    if (unallocated.length > 0) {
      await prisma.cashbookAllocation.createMany({
        data: unallocated.map((entry) => ({
          entryId: entry.id,
          categoryId: entry.shiftIncomeKind === 'credit' ? creditCategory.id : debitCategory.id,
          amount: entry.creditAmt
        }))
      })
    }
  }
  for (const row of updates) {
    await prisma.cashbookEntry.update({
      where: { id: row.id },
      data: {
        date: row.date,
        description: 'Card Transactions',
        creditAmt: row.amount,
        allocations: {
          deleteMany: {},
          create: { categoryId: row.categoryId, amount: row.amount }
        }
      }
    })
  }

  return shifts.length
}
