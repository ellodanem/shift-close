import { isYmd } from '@/lib/datetime-policy'

/** Optional YYYY-MM-DD focus carried between Shift, End of Day, and Deposit Comparisons. */
export function parseFocusDate(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim()
  return isYmd(v) ? v : null
}

export function endOfDayPath(date?: string | null): string {
  const d = parseFocusDate(date)
  return d ? `/days?date=${encodeURIComponent(d)}` : '/days'
}

export function depositComparisonsPath(date?: string | null): string {
  const d = parseFocusDate(date)
  return d ? `/financial/deposit-comparisons?date=${encodeURIComponent(d)}` : '/financial/deposit-comparisons'
}
