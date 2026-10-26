import { isRubisWestIndiesVendor } from '@/lib/vendor-rubis-skip'

export function invoiceYmdInMonth(ymd: string, year: number, month: number): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return false
  return Number(match[1]) === year && Number(match[2]) === month
}

export function harvestInvoiceRejectReason(
  row: { ymd: string | null; type: string; vendor?: string | null },
  bounds?: { year?: number; month?: number }
): string | null {
  if (row.type === 'LPG' && !isRubisWestIndiesVendor(row.vendor || '')) {
    return 'not Rubis West Indies'
  }

  const year = bounds?.year
  const month = bounds?.month
  const hasMonth =
    typeof year === 'number' &&
    typeof month === 'number' &&
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    year > 0 &&
    month >= 1 &&
    month <= 12

  if (hasMonth && (!row.ymd || !invoiceYmdInMonth(row.ymd, year, month))) {
    const label = `${year}-${String(month).padStart(2, '0')}`
    return `outside ${label}`
  }

  return null
}
