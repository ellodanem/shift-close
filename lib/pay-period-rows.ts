import type { PayPeriodExcelRow } from '@/lib/pay-period-excel'

export type PayPeriodRow = PayPeriodExcelRow

/** Synthetic staff ids for rows that exist only on this pay period report. */
export const REPORT_ONLY_PAY_PERIOD_STAFF_ID_PREFIX = 'report-only:'

export function isReportOnlyPayPeriodRow(row: Pick<PayPeriodRow, 'staffId'>): boolean {
  return row.staffId.startsWith(REPORT_ONLY_PAY_PERIOD_STAFF_ID_PREFIX)
}

export function createReportOnlyPayPeriodRow(): PayPeriodRow {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    staffId: `${REPORT_ONLY_PAY_PERIOD_STAFF_ID_PREFIX}${id}`,
    staffName: '',
    transTtl: 0,
    vacation: '',
    shortage: 0,
    sickLeaveDays: 0,
    sickLeaveRanges: ''
  }
}

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
  if (isReportOnlyPayPeriodRow(row)) {
    return row.staffName.trim() || 'New staff'
  }
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
