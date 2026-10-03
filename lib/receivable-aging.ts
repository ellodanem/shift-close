import { agingFromLines, type AgingRow, type CustomerRow } from '@/lib/accounting-types'
import { roundMoney } from '@/lib/fuelPayments'

export type ReceivableAgingStrip = {
  open: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90: number
  unaged: number
}

type SnapshotInput = {
  account: string
  opening: number
  charges: number
  payments: number
  closing: number
}

type LineInput = {
  account: string
  date: string
  lineType: string
  amount: number
}

/** Same receivable aging the accounting books use for a month. */
export function buildReceivableAging(input: {
  end: string
  snapshots: SnapshotInput[]
  lines: LineInput[]
  lastPaymentByAccount?: Map<string, string>
}): {
  customers: CustomerRow[]
  aging: AgingRow[]
  accountsReceivable: number
  strip: ReceivableAgingStrip
} {
  const { end, snapshots, lines, lastPaymentByAccount } = input
  const linesByAccount = new Map<string, LineInput[]>()
  for (const line of lines) {
    const name = line.account.trim()
    if (!name) continue
    const list = linesByAccount.get(name) ?? []
    list.push(line)
    linesByAccount.set(name, list)
  }

  const snapByName = new Map(snapshots.map((snap) => [snap.account.trim().toLowerCase(), snap]))
  const names = new Set<string>()
  for (const snap of snapshots) if (snap.account.trim()) names.add(snap.account.trim())
  for (const name of linesByAccount.keys()) names.add(name)

  const customers: CustomerRow[] = []
  const aging: AgingRow[] = []
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const snap = snapByName.get(name.toLowerCase())
    const accountLines = linesByAccount.get(name) ?? []
    const buckets = accountLines.length > 0 ? agingFromLines(accountLines, end) : null
    const closing = buckets ? buckets.total : roundMoney(snap?.closing ?? 0)
    const opening = roundMoney(snap?.opening ?? 0)
    const charges = roundMoney(snap?.charges ?? 0)
    const paid = roundMoney(snap?.payments ?? 0)
    if (closing === 0 && opening === 0 && charges === 0 && paid === 0) continue
    customers.push({
      name,
      opening,
      charges,
      payments: paid,
      closing: snap ? roundMoney(snap.closing) : closing,
      lastPayment: lastPaymentByAccount?.get(name) ?? null
    })
    if (buckets && buckets.total > 0) {
      aging.push({
        name,
        total: buckets.total,
        d0_30: buckets.d0_30,
        d31_60: buckets.d31_60,
        d61_90: buckets.d61_90,
        d90: buckets.d90,
        unaged: 0
      })
    } else if (snap && snap.closing > 0.004) {
      aging.push({
        name,
        total: roundMoney(snap.closing),
        d0_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90: 0,
        unaged: roundMoney(snap.closing)
      })
    }
  }

  const agedTotal = roundMoney(aging.reduce((sum, row) => sum + row.total, 0))
  const accountsReceivable = roundMoney(
    agedTotal || snapshots.reduce((sum, snap) => sum + (snap.closing || 0), 0)
  )
  const d0_30 = roundMoney(aging.reduce((sum, row) => sum + row.d0_30, 0))
  const d31_60 = roundMoney(aging.reduce((sum, row) => sum + row.d31_60, 0))
  const d61_90 = roundMoney(aging.reduce((sum, row) => sum + row.d61_90, 0))
  const d90 = roundMoney(aging.reduce((sum, row) => sum + row.d90, 0))
  const unagedFromRows = roundMoney(aging.reduce((sum, row) => sum + row.unaged, 0))
  const remainder = roundMoney(accountsReceivable - agedTotal)

  return {
    customers,
    aging,
    accountsReceivable,
    strip: {
      open: accountsReceivable,
      d0_30,
      d31_60,
      d61_90,
      d90,
      unaged: roundMoney(unagedFromRows + remainder)
    }
  }
}
