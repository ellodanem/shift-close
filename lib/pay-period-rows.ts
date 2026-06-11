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

/** Prefer current staff full name from the directory when showing saved report rows. */
export function resolvePayPeriodStaffDisplayName(
  row: Pick<PayPeriodRow, 'staffId' | 'staffName'>,
  nameByStaffId?: Record<string, string>
): string {
  return nameByStaffId?.[row.staffId]?.trim() || row.staffName
}

export function sortPayPeriodRowsByStaffName(
  rows: PayPeriodRow[],
  nameByStaffId?: Record<string, string>
): PayPeriodRow[] {
  return [...rows].sort((a, b) =>
    resolvePayPeriodStaffDisplayName(a, nameByStaffId).localeCompare(
      resolvePayPeriodStaffDisplayName(b, nameByStaffId),
      undefined,
      { sensitivity: 'base' }
    )
  )
}

export function withPayPeriodStaffFullNames<T extends { rows: PayPeriodRow[] }>(
  data: T,
  nameByStaffId: Record<string, string>
): T {
  const rows = sortPayPeriodRowsByStaffName(
    data.rows.map((r) => ({
      ...r,
      staffName: resolvePayPeriodStaffDisplayName(r, nameByStaffId)
    })),
    nameByStaffId
  )
  return { ...data, rows }
}
