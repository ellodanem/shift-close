import * as XLSX from 'xlsx'

export interface PayPeriodExcelRow {
  staffId: string
  staffName: string
  transTtl: number
  vacation: string
  shortage: number
  sickLeaveDays?: number
  sickLeaveRanges?: string
}

export interface PayPeriodExcelData {
  startDate: string
  endDate: string
  reportDate: string
  entityName: string
  notes?: string
  rows: PayPeriodExcelRow[]
}

export function formatDateDisplay(d: string): string {
  const [y, m, day] = d.split('-')
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(day!, 10))
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T23:59:59')
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 0:00 To ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 23:59`
}

export function buildPayPeriodWorksheetAoA(data: PayPeriodExcelData): (string | number)[][] {
  const rows = data.rows
  const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
  const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
  return [
    ['Summary Report'],
    ['Report Date:', formatDateDisplay(data.reportDate)],
    ['Date Range:', formatDateRange(data.startDate, data.endDate)],
    [data.entityName],
    ...(data.notes?.trim() ? [['Notes:', data.notes]] as (string | number)[][] : []),
    [],
    ['Staff', 'Trans Ttl', 'Vacation', 'Sick Days', 'Sick Leave', 'Shortage'],
    ...rows.map((r) => [
      r.staffName,
      r.transTtl,
      r.vacation,
      r.sickLeaveDays ?? 0,
      r.sickLeaveRanges ?? '',
      r.shortage > 0 ? r.shortage : ''
    ]),
    [
      'Total',
      totalTrans,
      '',
      rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0),
      '',
      totalShortage > 0 ? totalShortage : ''
    ]
  ]
}

export function payPeriodExcelWorkbook(data: PayPeriodExcelData) {
  const ws = XLSX.utils.aoa_to_sheet(buildPayPeriodWorksheetAoA(data))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pay Period')
  return wb
}

export function payPeriodExcelFilename(data: Pick<PayPeriodExcelData, 'startDate' | 'endDate'>) {
  return `pay-period-${data.startDate}-${data.endDate}.xlsx`
}

/** Browser download (same file as server-attached email). */
export function downloadPayPeriodExcel(data: PayPeriodExcelData) {
  const wb = payPeriodExcelWorkbook(data)
  XLSX.writeFile(wb, payPeriodExcelFilename(data))
}
