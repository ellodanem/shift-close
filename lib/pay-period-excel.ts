import * as XLSX from 'xlsx'
import { payCycleLabel, splitPayPeriodHours } from './pay-cycle'

export interface PayPeriodExcelRow {
  staffId: string
  staffName: string
  transTtl: number
  vacation: string
  shortage: number
  sickLeaveDays?: number
  sickLeaveRanges?: string
  /** weekly | biweekly | semimonthly | monthly — stamped at generate time. */
  payCycle?: string
  /** NIC / Pay+ staff # for the time-list export. */
  staffNo?: string | null
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

/** Known payroll note field starts (blocks copied without line breaks). */
const PAY_PERIOD_NOTE_FIELD_RE =
  /(?=(?:\bName\b|Address:|D\.O\.B\.|Date Started\s*:|N\.I\.C\s*#:?|Bank account:|Account number:))/i

/** Split stored notes into one line per field for Excel export. */
export function splitPayPeriodNotesForExport(notes: string): string[] {
  const trimmed = notes.trim()
  if (!trimmed) return []

  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return trimmed.split(/\r?\n/)
  }

  const parts = trimmed.split(PAY_PERIOD_NOTE_FIELD_RE).map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [trimmed]
}

/** One spreadsheet row per notes line so Excel shows each field on its own line. */
export function buildPayPeriodNotesRows(notes: string): (string | number)[][] {
  if (!notes.trim()) return []
  return splitPayPeriodNotesForExport(notes).map((line, i) => [i === 0 ? 'Notes:' : '', line])
}

export function buildPayPeriodWorksheetAoA(data: PayPeriodExcelData): (string | number)[][] {
  const rows = data.rows
  const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
  const totalBasic = rows.reduce((s, r) => s + splitPayPeriodHours(r.transTtl, r.payCycle).basicHours, 0)
  const totalOt = rows.reduce((s, r) => s + splitPayPeriodHours(r.transTtl, r.payCycle).otHours, 0)
  const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
  return [
    ['Summary Report'],
    ['Report Date:', formatDateDisplay(data.reportDate)],
    ['Date Range:', formatDateRange(data.startDate, data.endDate)],
    [data.entityName],
    ...buildPayPeriodNotesRows(data.notes ?? ''),
    [],
    ['Staff', 'Trans Ttl', 'Basic', 'OT', 'Cycle', 'Vacation', 'Sick Days', 'Sick Leave', 'Shortage'],
    ...rows.map((r) => {
      const split = splitPayPeriodHours(r.transTtl, r.payCycle)
      return [
        r.staffName,
        r.transTtl,
        split.basicHours,
        split.otHours,
        payCycleLabel(r.payCycle),
        r.vacation,
        r.sickLeaveDays ?? 0,
        r.sickLeaveRanges ?? '',
        r.shortage > 0 ? r.shortage : ''
      ]
    }),
    [
      'Total',
      totalTrans,
      totalBasic,
      totalOt,
      '',
      '',
      rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0),
      '',
      totalShortage > 0 ? totalShortage : ''
    ]
  ]
}

/** Pay+ BSC / OTH time list (Import Time List / copy-in). */
export function buildPayPeriodTimeListAoA(data: PayPeriodExcelData): (string | number)[][] {
  return [
    ['Time List'],
    ['Pay Range:', formatDateRange(data.startDate, data.endDate)],
    [data.entityName],
    [],
    ['STAFFNO', 'STAFFNAME', 'BSC', 'OTH', 'CYCLE'],
    ...data.rows.map((r) => {
      const split = splitPayPeriodHours(r.transTtl, r.payCycle)
      return [
        (r.staffNo ?? '').toString().trim(),
        r.staffName,
        split.basicHours,
        split.otHours,
        payCycleLabel(r.payCycle)
      ]
    })
  ]
}

export function payPeriodExcelWorkbook(data: PayPeriodExcelData) {
  const ws = XLSX.utils.aoa_to_sheet(buildPayPeriodWorksheetAoA(data))
  const timeList = XLSX.utils.aoa_to_sheet(buildPayPeriodTimeListAoA(data))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pay Period')
  XLSX.utils.book_append_sheet(wb, timeList, 'Time List')
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

export function payPeriodTimeListFilename(data: Pick<PayPeriodExcelData, 'startDate' | 'endDate'>) {
  return `time-list-${data.startDate}-${data.endDate}.xlsx`
}

/** Standalone BSC/OTH sheet for Pay+ (hours Excel still includes this as a second tab). */
export function downloadPayPeriodTimeList(data: PayPeriodExcelData) {
  const ws = XLSX.utils.aoa_to_sheet(buildPayPeriodTimeListAoA(data))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Time List')
  XLSX.writeFile(wb, payPeriodTimeListFilename(data))
}
