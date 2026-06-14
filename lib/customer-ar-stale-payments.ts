import { businessTodayYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { roundMoney } from '@/lib/fuelPayments'
import { prisma } from '@/lib/prisma'

export const STALE_AR_BUCKET_DAYS = [30, 45, 90, 120] as const
export type StaleArBucketDays = (typeof STALE_AR_BUCKET_DAYS)[number]

export type StaleArAccountRow = {
  account: string
  balance: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  daysSincePayment: number | null
  neverPaid: boolean
}

export type StaleArBucketSummary = {
  count: number
  totalBalance: number
}

export type StaleArPayload = {
  asOfDate: string
  balanceAsOf: { year: number; month: number; monthName: string } | null
  buckets: Record<`days${StaleArBucketDays}`, StaleArBucketSummary>
  neverPaidCount: number
  accounts: StaleArAccountRow[]
  trackedAccounts: number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = ymdToUtcNoonDate(fromYmd)
  const to = ymdToUtcNoonDate(toYmd)
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

function emptyBuckets(): StaleArPayload['buckets'] {
  return {
    days30: { count: 0, totalBalance: 0 },
    days45: { count: 0, totalBalance: 0 },
    days90: { count: 0, totalBalance: 0 },
    days120: { count: 0, totalBalance: 0 }
  }
}

function bucketKey(days: StaleArBucketDays): keyof StaleArPayload['buckets'] {
  return `days${days}` as keyof StaleArPayload['buckets']
}

function qualifiesForStaleWidget(row: StaleArAccountRow): boolean {
  return row.neverPaid || (row.daysSincePayment != null && row.daysSincePayment >= 30)
}

function inBucket(row: StaleArAccountRow, minDays: StaleArBucketDays): boolean {
  return row.neverPaid || (row.daysSincePayment != null && row.daysSincePayment >= minDays)
}

/** Ledger payment lines only; accounts with balance > 0 from latest monthly snapshot. */
export async function fetchStaleArAccounts(): Promise<StaleArPayload> {
  const today = businessTodayYmd()

  const [paymentLines, latestSnap] = await Promise.all([
    prisma.customerArLedgerLine.findMany({
      where: { lineType: 'payment', amount: { gt: 0 } },
      select: { account: true, date: true, amount: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
    }),
    prisma.customerArAccountSnapshot.findFirst({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true }
    })
  ])

  const paymentByAccount = new Map<
    string,
    { account: string; lastDate: string; lastAmount: number }
  >()
  for (const line of paymentLines) {
    const account = line.account.trim()
    if (!account) continue
    const key = account.toLowerCase()
    const amount = roundMoney(line.amount)
    const existing = paymentByAccount.get(key)
    if (!existing || line.date > existing.lastDate) {
      paymentByAccount.set(key, { account, lastDate: line.date, lastAmount: amount })
    } else if (line.date === existing.lastDate) {
      existing.lastAmount = roundMoney(existing.lastAmount + amount)
    }
  }

  if (!latestSnap) {
    return {
      asOfDate: today,
      balanceAsOf: null,
      buckets: emptyBuckets(),
      neverPaidCount: 0,
      accounts: [],
      trackedAccounts: 0
    }
  }

  const snapshots = await prisma.customerArAccountSnapshot.findMany({
    where: { year: latestSnap.year, month: latestSnap.month },
    select: { account: true, closing: true },
    orderBy: { account: 'asc' }
  })

  const accounts: StaleArAccountRow[] = []

  for (const snap of snapshots) {
    const balance = roundMoney(snap.closing)
    if (balance <= 0) continue

    const account = snap.account.trim()
    const pay = paymentByAccount.get(account.toLowerCase())
    const neverPaid = !pay
    const lastPaymentDate = pay?.lastDate ?? null
    const daysSincePayment =
      lastPaymentDate != null ? daysBetweenYmd(lastPaymentDate, today) : null

    const row: StaleArAccountRow = {
      account,
      balance,
      lastPaymentDate,
      lastPaymentAmount: pay?.lastAmount ?? null,
      daysSincePayment,
      neverPaid
    }

    if (qualifiesForStaleWidget(row)) {
      accounts.push(row)
    }
  }

  accounts.sort((a, b) => {
    if (a.neverPaid !== b.neverPaid) return a.neverPaid ? -1 : 1
    const daysA = a.daysSincePayment ?? Number.MAX_SAFE_INTEGER
    const daysB = b.daysSincePayment ?? Number.MAX_SAFE_INTEGER
    if (daysB !== daysA) return daysB - daysA
    return b.balance - a.balance
  })

  const buckets = emptyBuckets()
  for (const row of accounts) {
    for (const days of STALE_AR_BUCKET_DAYS) {
      if (inBucket(row, days)) {
        const key = bucketKey(days)
        buckets[key].count += 1
        buckets[key].totalBalance = roundMoney(buckets[key].totalBalance + row.balance)
      }
    }
  }

  return {
    asOfDate: today,
    balanceAsOf: {
      year: latestSnap.year,
      month: latestSnap.month,
      monthName: MONTH_NAMES[latestSnap.month - 1] ?? String(latestSnap.month)
    },
    buckets,
    neverPaidCount: accounts.filter((a) => a.neverPaid).length,
    accounts,
    trackedAccounts: snapshots.filter((s) => roundMoney(s.closing) > 0).length
  }
}
