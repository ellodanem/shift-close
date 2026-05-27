import type { PayPeriodExcelRow } from '@/lib/pay-period-excel'

export type PayPeriodRow = PayPeriodExcelRow

export function parsePayPeriodPreviousRows(raw: string | null | undefined): PayPeriodRow[] | null {
  if (raw == null || !String(raw).trim()) return null
  try {
    const p = JSON.parse(raw) as PayPeriodRow[]
    return Array.isArray(p) ? p : null
  } catch {
    return null
  }
}

export function resolvePayPeriodPreviousRow(
  prevRows: PayPeriodRow[] | null,
  staffId: string,
  index: number
): PayPeriodRow | undefined {
  if (!prevRows?.length) return undefined
  return prevRows.find((r) => r.staffId === staffId) ?? prevRows[index]
}
