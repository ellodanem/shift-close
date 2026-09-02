import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  fetchAccountLedgerView,
  getLedgerOpeningForAccount
} from '@/lib/customer-ar-ledger'
import type { LedgerRowWithRunning } from '@/lib/parse-customer-credit-report'

export type StatementMode = 'summary' | 'detail'

export type StatementSummaryRow = {
  year: number
  month: number
  monthLabel: string
  opening: number
  charges: number
  payments: number
  closing: number
}

export type StatementTotals = {
  opening: number
  charges: number
  payments: number
  closing: number
}

export type AccountStatementSummary = {
  account: string
  startDate: string
  endDate: string
  mode: 'summary'
  rows: StatementSummaryRow[]
  totals: StatementTotals
}

export type AccountStatementDetail = {
  account: string
  startDate: string
  endDate: string
  mode: 'detail'
  opening: number
  rows: LedgerRowWithRunning[]
  totals: StatementTotals
}

export type AccountStatement = AccountStatementSummary | AccountStatementDetail

export function formatStatementDateRange(startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T12:00:00')
  const e = new Date(endDate + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }
  return `${s.toLocaleDateString('en-US', opts)} to ${e.toLocaleDateString('en-US', opts)}`
}

export function monthsInRange(
  startDate: string,
  endDate: string
): Array<{ year: number; month: number }> {
  const [sy, sm] = startDate.split('-').map(Number)
  const [ey, em] = endDate.split('-').map(Number)
  const result: Array<{ year: number; month: number }> = []
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push({ year: y, month: m })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return result
}

export async function listCustomerAccountNames(): Promise<string[]> {
  const directory = await prisma.customerArDirectory.findMany({
    where: { active: true },
    select: { name: true },
    orderBy: { name: 'asc' }
  })
  if (directory.length > 0) {
    return directory.map((c) => c.name)
  }

  const [fromLedger, fromSnaps] = await Promise.all([
    prisma.customerArLedgerLine.findMany({
      select: { account: true },
      distinct: ['account']
    }),
    prisma.customerArAccountSnapshot.findMany({
      select: { account: true },
      distinct: ['account']
    })
  ])
  const names = new Set<string>()
  for (const r of [...fromLedger, ...fromSnaps]) {
    if (r.account?.trim()) names.add(r.account.trim())
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export async function fetchAccountStatementSummary(
  account: string,
  startDate: string,
  endDate: string
): Promise<AccountStatementSummary> {
  const acc = account.trim()
  const months = monthsInRange(startDate, endDate)
  const rows: StatementSummaryRow[] = []

  for (const { year, month } of months) {
    const snap = await prisma.customerArAccountSnapshot.findFirst({
      where: { year, month, account: { equals: acc, mode: 'insensitive' } }
    })
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
    if (snap) {
      rows.push({
        year,
        month,
        monthLabel,
        opening: roundMoney(snap.opening),
        charges: roundMoney(snap.charges),
        payments: roundMoney(snap.payments),
        closing: roundMoney(snap.closing)
      })
    } else {
      const opening = await getLedgerOpeningForAccount(acc, year, month)
      rows.push({
        year,
        month,
        monthLabel,
        opening,
        charges: 0,
        payments: 0,
        closing: opening
      })
    }
  }

  const periodOpening = rows.length > 0 ? rows[0].opening : 0
  const periodCharges = roundMoney(rows.reduce((s, r) => s + r.charges, 0))
  const periodPayments = roundMoney(rows.reduce((s, r) => s + r.payments, 0))
  const periodClosing =
    rows.length > 0 ? rows[rows.length - 1].closing : periodOpening

  return {
    account: acc,
    startDate,
    endDate,
    mode: 'summary',
    rows,
    totals: {
      opening: periodOpening,
      charges: periodCharges,
      payments: periodPayments,
      closing: periodClosing
    }
  }
}

export async function fetchAccountStatementDetail(
  account: string,
  startDate: string,
  endDate: string,
  openingOverride?: number | null
): Promise<AccountStatementDetail> {
  const view = await fetchAccountLedgerView({
    account: account.trim(),
    startDate,
    endDate,
    openingOverride
  })
  return {
    account: view.account,
    startDate,
    endDate,
    mode: 'detail',
    opening: view.opening,
    rows: view.rows,
    totals: {
      opening: view.opening,
      ...view.totals
    }
  }
}

export async function fetchAccountStatement(
  account: string,
  startDate: string,
  endDate: string,
  mode: StatementMode,
  openingOverride?: number | null
): Promise<AccountStatement> {
  if (mode === 'detail') {
    return fetchAccountStatementDetail(account, startDate, endDate, openingOverride)
  }
  return fetchAccountStatementSummary(account, startDate, endDate)
}
