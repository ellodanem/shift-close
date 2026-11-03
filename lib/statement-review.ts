import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import { isYmd, toYmdInBusinessTz, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { checkBalanceAccountLabel, type CheckBalanceAccount } from '@/lib/checkBalanceAccount'
import { clearUncashedCheck, listClearedChecks, listUncashedChecks } from '@/lib/uncashedChecks'
import {
  findPosCommissions,
  findStatementChecks,
  isCommissionAlreadyBooked,
  matchStatementChecks,
  type CheckMatch,
  type StatementCommission,
  type StatementTransaction
} from '@/lib/bank-statement'

export const BANK_CHARGES_CATEGORY_NAME = 'Bank charges'

export type CheckPreviewRow = CheckMatch & { key: string }

export async function previewStatementChecks(
  transactions: StatementTransaction[]
): Promise<CheckPreviewRow[]> {
  const checks = findStatementChecks(transactions)
  if (checks.length === 0) return []
  const [uncashed, cleared] = await Promise.all([listUncashedChecks(), listClearedChecks()])
  const matches = matchStatementChecks(
    checks,
    uncashed.map((u) => ({
      id: u.id,
      payee: u.payee,
      bankRef: u.bankRef,
      totalAmount: u.totalAmount,
      paymentDate: u.paymentDate,
      source: u.source
    })),
    cleared.map((c) => ({ bankRef: c.bankRef, totalAmount: c.totalAmount }))
  )
  return matches.map((match, index) => ({
    ...match,
    key: `${index}|${match.check.date}|${match.check.amount}|${match.check.numbers.join('-')}`,
    candidates: match.candidates.map((c) => ({
      ...c,
      paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(c.paymentDate) ? c.paymentDate : toYmdInBusinessTz(new Date(c.paymentDate))
    }))
  }))
}

export type ApplyCheckItem = { id: string; clearedAt: string }
export type ApplyCheckResult = { id: string; ok: boolean; error?: string }

export async function applyStatementChecks(
  items: ApplyCheckItem[],
  account: CheckBalanceAccount
): Promise<ApplyCheckResult[]> {
  const results: ApplyCheckResult[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) {
      results.push({ id: item.id, ok: false, error: 'Selected more than once' })
      continue
    }
    seen.add(item.id)
    if (!isYmd(item.clearedAt)) {
      results.push({ id: item.id, ok: false, error: 'Invalid statement date' })
      continue
    }
    try {
      await clearUncashedCheck(item.id, ymdToUtcNoonDate(item.clearedAt), account)
      results.push({ id: item.id, ok: true })
    } catch (error) {
      results.push({
        id: item.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to clear check'
      })
    }
  }
  return results
}

async function findBankChargesCategory() {
  const categories = await prisma.cashbookCategory.findMany({ where: { active: true, type: 'expense' } })
  const wanted = BANK_CHARGES_CATEGORY_NAME.toLowerCase()
  return (
    categories.find((c) => c.name.trim().toLowerCase() === wanted) ??
    categories.find((c) => c.name.trim().toLowerCase() === 'bank charge') ??
    null
  )
}

export type CommissionPreviewRow = {
  key: string
  commission: StatementCommission
  month: string
  alreadyBooked: boolean
}

export async function previewStatementCommissions(
  transactions: StatementTransaction[]
): Promise<{ rows: CommissionPreviewRow[]; categoryFound: boolean }> {
  const category = await findBankChargesCategory()
  const commissions = findPosCommissions(transactions)
  if (commissions.length === 0) return { rows: [], categoryFound: category != null }

  const dates = commissions.map((c) => c.date).sort()
  const existing = await prisma.cashbookEntry.findMany({
    where: {
      date: { gte: dates[0], lte: dates[dates.length - 1] },
      description: { contains: 'commission', mode: 'insensitive' }
    },
    include: { allocations: true }
  })
  const existingLines = existing.map((entry) => ({
    date: entry.date,
    description: entry.description,
    amount: entry.allocations.reduce((sum, a) => sum + a.amount, 0) || entry.debitEcard || entry.debitCash
  }))

  const rows = commissions.map((commission, index) => ({
    key: `${index}|${commission.date}|${commission.amount}|${commission.reference}`,
    commission,
    month: commission.date.slice(0, 7),
    alreadyBooked: isCommissionAlreadyBooked(commission, existingLines)
  }))
  return { rows, categoryFound: category != null }
}

export type ApplyCommissionResult = { key: string; ok: boolean; error?: string }

export async function applyStatementCommissions(
  items: Array<{ key: string; commission: StatementCommission }>,
  account: CheckBalanceAccount
): Promise<ApplyCommissionResult[]> {
  const category = await findBankChargesCategory()
  if (!category) {
    throw new Error('No active "Bank charges" expense category found in Cashbook')
  }
  const bankLabel = checkBalanceAccountLabel(account)
  const results: ApplyCommissionResult[] = []

  for (const { key, commission } of items) {
    const amount = roundMoney(commission.amount)
    if (!isYmd(commission.date) || !(amount > 0)) {
      results.push({ key, ok: false, error: 'Invalid date or amount' })
      continue
    }
    try {
      const existing = await prisma.cashbookEntry.findMany({
        where: { date: commission.date, description: { contains: 'commission', mode: 'insensitive' } },
        include: { allocations: true }
      })
      const booked = isCommissionAlreadyBooked(
        commission,
        existing.map((entry) => ({
          date: entry.date,
          description: entry.description,
          amount: entry.allocations.reduce((sum, a) => sum + a.amount, 0)
        }))
      )
      if (booked) {
        results.push({ key, ok: false, error: 'Already in Cashbook' })
        continue
      }
      await prisma.cashbookEntry.create({
        data: {
          date: commission.date,
          ref: commission.reference || null,
          description: commission.description,
          debitEcard: amount,
          paymentMethod: 'direct_debit',
          bank: bankLabel,
          allocations: { create: { categoryId: category.id, amount } }
        }
      })
      results.push({ key, ok: true })
    } catch (error) {
      results.push({
        key,
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to add Cashbook line'
      })
    }
  }
  return results
}
