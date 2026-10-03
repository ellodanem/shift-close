import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  isRubisRentExpenseDescription,
  rubisRentExpenseRow,
  type MonthlyReportExpenseRow
} from '@/lib/vendorInvoicePaymentsReport'

const KEY_PREFIX = 'all_invoices_rubis_rent:'

function settingsKey(month: string): string {
  return `${KEY_PREFIX}${month}`
}

function parseAmount(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return roundMoney(n)
}

/** Last saved Rubis Rent amount from an earlier month, if one exists. */
async function latestPriorAmount(month: string): Promise<number | null> {
  const [settings, expenses] = await Promise.all([
    prisma.appSettings.findMany({
      where: { key: { startsWith: KEY_PREFIX } },
      select: { key: true, value: true }
    }),
    prisma.monthlyReportExpense.findMany({
      where: {
        month: { lt: month },
        OR: [
          { description: { equals: 'Rubis Rent', mode: 'insensitive' } },
          { description: { equals: 'Rubis Rent Additional', mode: 'insensitive' } }
        ]
      },
      select: { month: true, amount: true }
    })
  ])

  const candidates: { month: string; amount: number; rank: number }[] = []
  for (const row of settings) {
    const savedMonth = row.key.slice(KEY_PREFIX.length)
    const amount = parseAmount(row.value)
    if (/^\d{4}-\d{2}$/.test(savedMonth) && savedMonth < month && amount != null) {
      candidates.push({ month: savedMonth, amount, rank: 1 })
    }
  }
  for (const row of expenses) {
    if (row.month < month) {
      candidates.push({ month: row.month, amount: roundMoney(row.amount), rank: 0 })
    }
  }
  candidates.sort((a, b) => b.month.localeCompare(a.month) || b.rank - a.rank)
  return candidates[0]?.amount ?? null
}

/**
 * Keep Rubis Rent on the report. A saved amount for this month wins, then a
 * same-named extra line already entered for the month, then the previous
 * month's amount. The line is report-only and is never written to the cashbook.
 */
export async function applyFixedRubisRentExpense(
  month: string,
  expenses: MonthlyReportExpenseRow[]
): Promise<MonthlyReportExpenseRow[]> {
  const others = expenses.filter((row) => !isRubisRentExpenseDescription(row.description))
  const legacy = expenses.filter((row) => isRubisRentExpenseDescription(row.description))

  const exact = await prisma.appSettings.findUnique({ where: { key: settingsKey(month) } })
  let amount = parseAmount(exact?.value)
  if (amount == null && legacy.length > 0) {
    amount = roundMoney(legacy[legacy.length - 1].amount)
  }
  if (amount == null) {
    amount = (await latestPriorAmount(month)) ?? 0
  }

  return [...others, rubisRentExpenseRow(amount)]
}

export async function saveRubisRentExpenseAmount(month: string, amount: number): Promise<void> {
  const value = String(roundMoney(amount))
  await prisma.appSettings.upsert({
    where: { key: settingsKey(month) },
    create: { key: settingsKey(month), value },
    update: { value }
  })
}
