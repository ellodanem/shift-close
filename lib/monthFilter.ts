import { businessTodayYmd } from '@/lib/datetime-policy'

export type MonthFilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

export function monthParamForFilter(
  filter: MonthFilterType,
  customMonth: string
): string | null {
  if (filter === 'all') return null
  if (filter === 'custom') return customMonth || null

  const todayYmd = businessTodayYmd()
  const [year, month] = todayYmd.split('-').map(Number)

  if (filter === 'thisMonth') {
    return `${year}-${String(month).padStart(2, '0')}`
  }
  if (filter === 'lastMonth') {
    const last = new Date(Date.UTC(year, month - 2, 1))
    return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return null
}

export function monthFilterLabel(
  filter: MonthFilterType,
  customMonth: string
): string | null {
  const param = monthParamForFilter(filter, customMonth)
  if (!param) return null
  return new Date(`${param}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

export function paymentDateMonth(paymentDate: string): string {
  return paymentDate.slice(0, 7)
}

export function matchesMonthFilter(
  paymentDate: string,
  filter: MonthFilterType,
  customMonth: string
): boolean {
  const param = monthParamForFilter(filter, customMonth)
  if (!param) return true
  return paymentDateMonth(paymentDate) === param
}

/** Current month first, then descending by month and payment date within each month. */
export function sortChecksCurrentMonthFirst<
  T extends { paymentDate: string; bankRef: string; id: string }
>(checks: T[]): T[] {
  const currentMonth = monthParamForFilter('thisMonth', '')

  return [...checks].sort((a, b) => {
    const aMonth = paymentDateMonth(a.paymentDate)
    const bMonth = paymentDateMonth(b.paymentDate)
    const aIsCurrent = aMonth === currentMonth
    const bIsCurrent = bMonth === currentMonth

    if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1
    if (aMonth !== bMonth) return bMonth.localeCompare(aMonth)

    const dateCmp = b.paymentDate.localeCompare(a.paymentDate)
    if (dateCmp !== 0) return dateCmp

    const refCmp = a.bankRef.localeCompare(b.bankRef)
    if (refCmp !== 0) return refCmp
    return a.id.localeCompare(b.id)
  })
}
