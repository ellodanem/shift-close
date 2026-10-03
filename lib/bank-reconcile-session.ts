import { createCashbookExpenseEntry, getOrCreateExpenseCategory } from '@/lib/cashbook-expense'
import { ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { roundMoney } from '@/lib/fuelPayments'
import { prisma } from '@/lib/prisma'
import { clearUncashedCheck, uncashedCheckId } from '@/lib/uncashedChecks'
import {
  WESTLINE_ACCOUNT,
  allCardsCleared,
  depositBankStatusOnFinish,
  isYmdDate,
  listRegisterLines,
  reconcileBalances,
  type ReconcileView,
  type RegisterSource
} from '@/lib/bank-reconcile'

export class ReconcileInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReconcileInputError'
  }
}

const entrySelect = {
  id: true,
  date: true,
  description: true,
  ref: true,
  creditAmt: true,
  debitCash: true,
  debitCheck: true,
  debitEcard: true,
  debitDcard: true,
  vendorPaymentBatchId: true,
  shiftId: true,
  depositLineIndex: true,
  shiftIncomeKind: true,
  clearedAt: true
} as const

type EntryRow = {
  id: string
  date: string
  description: string
  ref: string | null
  creditAmt: number
  debitCash: number
  debitCheck: number
  debitEcard: number
  debitDcard: number
  vendorPaymentBatchId: string | null
  shiftId: string | null
  depositLineIndex: number | null
  shiftIncomeKind: string | null
  clearedAt: Date | null
}

function parseMoney(value: unknown, label: string): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) throw new ReconcileInputError(`${label} must be a number`)
  return roundMoney(amount)
}

async function lastFinished() {
  return prisma.bankReconciliation.findFirst({
    where: { account: WESTLINE_ACCOUNT, status: 'finished' },
    orderBy: { statementEndDate: 'desc' }
  })
}

async function inProgress() {
  return prisma.bankReconciliation.findFirst({
    where: { account: WESTLINE_ACCOUNT, status: 'in_progress' },
    include: { lines: true },
    orderBy: { createdAt: 'desc' }
  })
}

async function lockedIds(): Promise<Set<string>> {
  const rows = await prisma.bankReconciliationLine.findMany({
    where: {
      cleared: true,
      reconciliation: { account: WESTLINE_ACCOUNT, status: 'finished' }
    },
    select: { cashbookEntryId: true }
  })
  return new Set(rows.map((row) => row.cashbookEntryId))
}

async function toSources(entries: EntryRow[]): Promise<RegisterSource[]> {
  const ids = [...new Set(entries.map((entry) => entry.vendorPaymentBatchId).filter((id): id is string => Boolean(id)))]
  const batches =
    ids.length === 0
      ? []
      : await prisma.vendorPaymentBatch.findMany({
          where: { id: { in: ids } },
          select: { id: true, paymentMethod: true, clearedAt: true, clearedBalanceAccount: true }
        })
  const byId = new Map(batches.map((batch) => [batch.id, batch]))
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    description: entry.description,
    ref: entry.ref,
    creditAmt: entry.creditAmt,
    debitCash: entry.debitCash,
    debitCheck: entry.debitCheck,
    debitEcard: entry.debitEcard,
    debitDcard: entry.debitDcard,
    vendor: entry.vendorPaymentBatchId ? (byId.get(entry.vendorPaymentBatchId) ?? null) : null
  }))
}

async function linesFor(statementEndDate: string, clearedIds: ReadonlySet<string>) {
  const [entries, locked] = await Promise.all([
    prisma.cashbookEntry.findMany({
      where: { date: { lte: statementEndDate } },
      select: entrySelect,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    lockedIds()
  ])
  const sources = await toSources(entries)
  return listRegisterLines({
    entries: sources,
    statementEndDate,
    lockedIds: locked,
    clearedIds
  })
}

function clearedIdSet(lines: Array<{ cashbookEntryId: string; cleared: boolean }>) {
  return new Set(lines.filter((line) => line.cleared).map((line) => line.cashbookEntryId))
}

async function viewFor(
  session: {
    id: string
    statementEndDate: string
    statementEndBalance: number
    openingBalance: number
    lines: Array<{ cashbookEntryId: string; cleared: boolean }>
  } | null,
  last: { statementEndDate: string; statementEndBalance: number } | null
): Promise<ReconcileView> {
  const shell = {
    openingBalance: last ? roundMoney(last.statementEndBalance) : null,
    openingLocked: Boolean(last),
    lastStatementEndDate: last?.statementEndDate ?? null
  }
  if (!session) return { session: null, ...shell }
  const lines = await linesFor(session.statementEndDate, clearedIdSet(session.lines))
  const balances = reconcileBalances({
    openingBalance: session.openingBalance,
    statementEndBalance: session.statementEndBalance,
    lines
  })
  return {
    ...shell,
    session: {
      id: session.id,
      statementEndDate: session.statementEndDate,
      statementEndBalance: roundMoney(session.statementEndBalance),
      openingBalance: roundMoney(session.openingBalance),
      ...balances,
      lines
    }
  }
}

export async function loadReconcileView(): Promise<ReconcileView> {
  const [current, last] = await Promise.all([inProgress(), lastFinished()])
  return viewFor(current, last)
}

export async function startReconciliation(input: {
  statementEndDate: unknown
  statementEndBalance: unknown
  openingBalance?: unknown
}) {
  const statementEndDate = typeof input.statementEndDate === 'string' ? input.statementEndDate.trim() : ''
  if (!isYmdDate(statementEndDate)) throw new ReconcileInputError('Statement end date is required')
  const statementEndBalance = parseMoney(input.statementEndBalance, 'Statement end balance')
  if (await inProgress()) throw new ReconcileInputError('A reconciliation is already in progress')
  const last = await lastFinished()
  if (last && statementEndDate <= last.statementEndDate) {
    throw new ReconcileInputError('Statement end date must be after the last finished statement')
  }
  const openingBalance = last
    ? roundMoney(last.statementEndBalance)
    : parseMoney(input.openingBalance, 'Opening book balance')
  await prisma.bankReconciliation.create({
    data: {
      account: WESTLINE_ACCOUNT,
      statementEndDate,
      statementEndBalance,
      openingBalance,
      status: 'in_progress'
    }
  })
  return loadReconcileView()
}

export async function updateReconciliation(input: {
  statementEndDate?: unknown
  statementEndBalance?: unknown
  openingBalance?: unknown
}) {
  const current = await inProgress()
  if (!current) throw new ReconcileInputError('Start a reconciliation first')
  const last = await lastFinished()
  const data: { statementEndDate?: string; statementEndBalance?: number; openingBalance?: number } = {}
  if (input.statementEndDate !== undefined) {
    const statementEndDate = typeof input.statementEndDate === 'string' ? input.statementEndDate.trim() : ''
    if (!isYmdDate(statementEndDate)) throw new ReconcileInputError('Statement end date is required')
    if (last && statementEndDate <= last.statementEndDate) {
      throw new ReconcileInputError('Statement end date must be after the last finished statement')
    }
    data.statementEndDate = statementEndDate
  }
  if (input.statementEndBalance !== undefined) {
    data.statementEndBalance = parseMoney(input.statementEndBalance, 'Statement end balance')
  }
  if (input.openingBalance !== undefined) {
    if (last) throw new ReconcileInputError('Opening balance comes from the last finished statement')
    data.openingBalance = parseMoney(input.openingBalance, 'Opening book balance')
  }
  if (Object.keys(data).length === 0) throw new ReconcileInputError('Nothing to update')
  await prisma.bankReconciliation.update({ where: { id: current.id }, data })
  if (data.statementEndDate && data.statementEndDate < current.statementEndDate) {
    const late = await prisma.cashbookEntry.findMany({
      where: {
        date: { gt: data.statementEndDate },
        reconciliationLines: { some: { reconciliationId: current.id } }
      },
      select: { id: true }
    })
    if (late.length > 0) {
      await prisma.bankReconciliationLine.deleteMany({
        where: { reconciliationId: current.id, cashbookEntryId: { in: late.map((entry) => entry.id) } }
      })
    }
  }
  return loadReconcileView()
}

export async function setLineCleared(cashbookEntryId: unknown, cleared: unknown) {
  const current = await inProgress()
  if (!current) throw new ReconcileInputError('Start a reconciliation first')
  if (typeof cashbookEntryId !== 'string' || !cashbookEntryId) throw new ReconcileInputError('Choose a line')
  if (typeof cleared !== 'boolean') throw new ReconcileInputError('Cleared must be true or false')
  const entry = await prisma.cashbookEntry.findUnique({ where: { id: cashbookEntryId }, select: entrySelect })
  if (!entry) throw new ReconcileInputError('That line is not on this statement')
  const sources = await toSources([entry])
  const visible = listRegisterLines({
    entries: sources,
    statementEndDate: current.statementEndDate,
    lockedIds: await lockedIds(),
    clearedIds: new Set([entry.id])
  })
  if (visible.length !== 1) throw new ReconcileInputError('That line is not on this statement')
  if (cleared) {
    await prisma.bankReconciliationLine.upsert({
      where: {
        reconciliationId_cashbookEntryId: {
          reconciliationId: current.id,
          cashbookEntryId: entry.id
        }
      },
      create: { reconciliationId: current.id, cashbookEntryId: entry.id, cleared: true },
      update: { cleared: true }
    })
  } else {
    await prisma.bankReconciliationLine.deleteMany({
      where: { reconciliationId: current.id, cashbookEntryId: entry.id }
    })
  }
  return loadReconcileView()
}

async function markDepositCleared(shiftId: string, recordKind: 'deposit' | 'debit', lineIndex: number) {
  const shift = await prisma.shiftClose.findUnique({ where: { id: shiftId }, select: { id: true } })
  if (!shift) return
  const existing = await prisma.depositRecord.findUnique({
    where: { shiftId_recordKind_lineIndex: { shiftId, recordKind, lineIndex } },
    select: { bankStatus: true }
  })
  if (depositBankStatusOnFinish(existing?.bankStatus) !== 'cleared') return
  await prisma.depositRecord.upsert({
    where: { shiftId_recordKind_lineIndex: { shiftId, recordKind, lineIndex } },
    create: { shiftId, recordKind, lineIndex, bankStatus: 'cleared' },
    update: { bankStatus: 'cleared' }
  })
}

export async function finishReconciliation() {
  const current = await inProgress()
  if (!current) throw new ReconcileInputError('Start a reconciliation first')
  const last = await lastFinished()
  const view = await viewFor(current, last)
  if (!view.session?.balanced) throw new ReconcileInputError('The difference must be zero before you finish')

  const visibleIds = new Set(view.session.lines.map((line) => line.cashbookEntryId))
  const stale = current.lines.filter((line) => !visibleIds.has(line.cashbookEntryId))
  if (stale.length > 0) {
    await prisma.bankReconciliationLine.deleteMany({
      where: { id: { in: stale.map((line) => line.id) } }
    })
  }

  const tickedIds = view.session.lines.filter((line) => line.cleared).map((line) => line.cashbookEntryId)
  const ticked =
    tickedIds.length === 0
      ? []
      : await prisma.cashbookEntry.findMany({
          where: { id: { in: tickedIds } },
          select: entrySelect
        })
  const clearedAt = ymdToUtcNoonDate(current.statementEndDate)
  const locked = await lockedIds()
  const tickedSet = new Set(tickedIds)

  for (const entry of ticked) {
    if (entry.shiftId && entry.depositLineIndex != null) {
      await markDepositCleared(entry.shiftId, 'deposit', entry.depositLineIndex)
    }
    if (entry.debitCheck > 0 && !entry.clearedAt) {
      if (entry.vendorPaymentBatchId) {
        await prisma.cashbookEntry.update({ where: { id: entry.id }, data: { clearedAt } })
      } else {
        await clearUncashedCheck(uncashedCheckId('cashbook', entry.id), clearedAt)
      }
    }
  }

  const cardShiftIds = [
    ...new Set(
      ticked
        .filter((entry) => entry.shiftId && (entry.shiftIncomeKind === 'credit' || entry.shiftIncomeKind === 'debit'))
        .map((entry) => entry.shiftId as string)
    )
  ]
  if (cardShiftIds.length > 0) {
    const cardEntries = await prisma.cashbookEntry.findMany({
      where: { shiftId: { in: cardShiftIds }, shiftIncomeKind: { in: ['credit', 'debit'] } },
      select: { id: true, shiftId: true }
    })
    const byShift = new Map<string, Array<{ cleared: boolean }>>()
    for (const card of cardEntries) {
      if (!card.shiftId) continue
      const list = byShift.get(card.shiftId) ?? []
      list.push({ cleared: tickedSet.has(card.id) || locked.has(card.id) })
      byShift.set(card.shiftId, list)
    }
    for (const shiftId of cardShiftIds) {
      if (!allCardsCleared(byShift.get(shiftId) ?? [])) continue
      await markDepositCleared(shiftId, 'debit', 0)
    }
  }

  await prisma.bankReconciliation.update({
    where: { id: current.id },
    data: { status: 'finished', finishedAt: new Date() }
  })
  return loadReconcileView()
}

async function getOrCreateIncomeCategory(name: string) {
  let category = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, type: 'income' }
  })
  if (!category) {
    category = await prisma.cashbookCategory.create({
      data: { name, type: 'income', sortOrder: 0, active: true }
    })
  }
  return category
}

export async function addStatementLine(input: {
  kind: unknown
  date: unknown
  description: unknown
  amount: unknown
  ref?: unknown
}) {
  const current = await inProgress()
  if (!current) throw new ReconcileInputError('Start a reconciliation first')
  const date = typeof input.date === 'string' ? input.date.trim() : ''
  if (!isYmdDate(date)) throw new ReconcileInputError('Date is required')
  if (date > current.statementEndDate) {
    throw new ReconcileInputError('Date must be on or before the statement end date')
  }
  const last = await lastFinished()
  if (last && date <= last.statementEndDate) {
    throw new ReconcileInputError('Date must be after the last finished statement')
  }
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (!description) throw new ReconcileInputError('Description is required')
  const amount = parseMoney(input.amount, 'Amount')
  if (amount <= 0) throw new ReconcileInputError('Amount must be greater than zero')
  const ref = typeof input.ref === 'string' ? input.ref.trim() : ''

  if (input.kind === 'fee') {
    const category = await getOrCreateExpenseCategory('Bank fee', null)
    await createCashbookExpenseEntry({
      date,
      description,
      amount,
      categoryId: category.id,
      paymentMethod: 'direct_debit',
      ref
    })
  } else if (input.kind === 'interest') {
    const category = await getOrCreateIncomeCategory('Interest')
    await prisma.cashbookEntry.create({
      data: {
        date,
        description,
        ref: ref || null,
        creditAmt: amount,
        paymentMethod: 'deposit',
        allocations: { create: { categoryId: category.id, amount } }
      }
    })
  } else {
    throw new ReconcileInputError('Choose a bank fee or interest')
  }
  return loadReconcileView()
}
