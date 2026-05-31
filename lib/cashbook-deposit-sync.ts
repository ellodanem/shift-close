import { prisma } from '@/lib/prisma'
import { calculateShiftClose } from '@/lib/calculations'
import { roundMoney } from '@/lib/fuelPayments'
import type { ShiftCloseInput } from '@/lib/types'

const SYNC_STATUSES = new Set(['closed', 'reviewed', 'reopened'])

export function parseDepositsJson(deposits: string | unknown): number[] {
  if (Array.isArray(deposits)) {
    return deposits.map((d) => Number(d) || 0)
  }
  if (typeof deposits === 'string') {
    try {
      const parsed = JSON.parse(deposits || '[]')
      return Array.isArray(parsed) ? parsed.map((d) => Number(d) || 0) : []
    } catch {
      return []
    }
  }
  return []
}

async function getOrCreateDepositCategory() {
  let cat = await prisma.cashbookCategory.findFirst({
    where: { name: { equals: 'Deposit', mode: 'insensitive' }, type: 'income' }
  })
  if (!cat) {
    cat = await prisma.cashbookCategory.create({
      data: { name: 'Deposit', code: null, type: 'income', sortOrder: 0, active: true }
    })
  }
  return cat
}

function depositLineAmount(amounts: number[], index: number): number {
  const raw = amounts[index]
  if (raw === null || raw === undefined || Number.isNaN(raw)) return 0
  return roundMoney(Number(raw) || 0)
}

/**
 * Upsert/delete cashbook income rows for each deposit line on a closed shift.
 * Skips drafts. Does not recreate rows the user deleted from cashbook until shift deposits change again.
 */
export async function syncShiftDepositsToCashbook(shiftId: string): Promise<void> {
  const shift = await prisma.shiftClose.findUnique({ where: { id: shiftId } })
  if (!shift || !SYNC_STATUSES.has(shift.status)) return

  const amounts = parseDepositsJson(shift.deposits)
  const category = await getOrCreateDepositCategory()

  const existing = await prisma.cashbookEntry.findMany({
    where: {
      shiftId,
      depositLineIndex: { not: null }
    },
    include: { allocations: true }
  })
  const existingByIndex = new Map(
    existing
      .filter((e) => e.depositLineIndex !== null)
      .map((e) => [e.depositLineIndex as number, e])
  )

  const maxIndex = Math.max(amounts.length - 1, ...existing.map((e) => e.depositLineIndex ?? -1))

  for (let i = 0; i <= maxIndex; i++) {
    const amt = i < amounts.length ? depositLineAmount(amounts, i) : 0
    const entry = existingByIndex.get(i)

    if (amt <= 0) {
      if (entry) {
        await prisma.cashbookEntry.delete({ where: { id: entry.id } })
      }
      continue
    }

    const entryData = {
      date: shift.date,
      description: 'Deposit',
      ref: null as string | null,
      debitCash: 0,
      debitCheck: 0,
      debitEcard: 0,
      debitDcard: 0,
      creditAmt: amt,
      bank: null as string | null,
      paymentMethod: null as string | null,
      shiftId: shift.id,
      depositLineIndex: i
    }

    if (entry) {
      await prisma.cashbookEntry.update({
        where: { id: entry.id },
        data: {
          ...entryData,
          allocations: {
            updateMany: {
              where: {},
              data: { amount: amt, categoryId: category.id }
            }
          }
        }
      })
    } else {
      await prisma.cashbookEntry.create({
        data: {
          ...entryData,
          allocations: {
            create: { categoryId: category.id, amount: amt }
          }
        }
      })
    }
  }
}

/**
 * When a linked cashbook row amount changes, update the matching shift deposit line.
 */
export async function syncCashbookEntryToShiftDeposit(
  entryId: string,
  amount: number
): Promise<void> {
  const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } })
  if (!entry?.shiftId || entry.depositLineIndex === null) return

  const shift = await prisma.shiftClose.findUnique({ where: { id: entry.shiftId } })
  if (!shift || !SYNC_STATUSES.has(shift.status)) return

  const lineIndex = entry.depositLineIndex
  const amounts = parseDepositsJson(shift.deposits)
  while (amounts.length <= lineIndex) {
    amounts.push(0)
  }
  amounts[lineIndex] = roundMoney(amount)

  const calculated = calculateShiftClose({
    ...(shift as unknown as ShiftCloseInput),
    deposits: amounts
  })

  await prisma.shiftClose.update({
    where: { id: shift.id },
    data: {
      deposits: JSON.stringify(amounts),
      totalDeposits: calculated.totalDeposits
    }
  })
}

/** Whether shift deposits or status warrant a cashbook sync after save. */
export function shouldSyncDepositsAfterShiftUpdate(
  previousStatus: string,
  nextStatus: string,
  depositsChanged: boolean
): boolean {
  if (!SYNC_STATUSES.has(nextStatus)) return false
  if (depositsChanged) return true
  return !SYNC_STATUSES.has(previousStatus) && SYNC_STATUSES.has(nextStatus)
}
