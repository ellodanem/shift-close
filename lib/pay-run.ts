import { computePayRunDeductions } from './pay-run-deductions'
import { isReportOnlyPayPeriodRow } from './pay-period-rows'
import {
  DEFAULT_PAY_CYCLE,
  parsePayCycle,
  splitPayPeriodHours,
  type PayCycle
} from './pay-cycle'

export const PAY_TYPE_VALUES = ['hourly', 'salaried'] as const
export type PayType = (typeof PAY_TYPE_VALUES)[number]
export const DEFAULT_PAY_TYPE: PayType = 'hourly'
export const OT_MULTIPLIER = 1.5

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: 'Hourly',
  salaried: 'Salaried'
}

/** Marks a salaried line that is unchecked for this run. Not an earning. */
export const SKIP_SALARY_LABEL = '__skipSalary'

export type PayRunExtraLine = {
  label: string
  amount: number
}

export type PayRunHoursRow = {
  staffId: string
  staffName: string
  transTtl: number
  shortage?: number
  payCycle?: string
  staffNo?: string | null
}

export type PayRunStaffProfile = {
  id: string
  name: string
  status: string
  role: string
  nicNumber: string | null
  payCycle: string
  payType: string
  hourlyRate: number | null
  salariedAmount: number | null
  staffLoan: number | null
  medicalAmount: number | null
  taxCode?: string | null
  bankName?: string | null
  accountNumber?: string | null
}

export type PayRateOverride = {
  hourlyRate?: number
  salariedAmount?: number
  taxCode?: string
}

export type BuiltPayRunLine = {
  staffId: string | null
  staffName: string
  staffNo: string | null
  payType: PayType
  payCycle: PayCycle
  transTtl: number
  basicHours: number
  otHours: number
  hourlyRate: number
  salariedAmount: number
  basicPay: number
  otPay: number
  extraPay: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  extraDeductionPay: number
  grossPay: number
  shortageReady: number
  nisEmployee: number
  nisEmployer: number
  staffLoan: number
  medical: number
  totalDeductions: number
  netPay: number
  taxCode: string
  bankCode?: string
  accountNo?: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function parsePayType(value: unknown): PayType {
  return typeof value === 'string' && (PAY_TYPE_VALUES as readonly string[]).includes(value)
    ? (value as PayType)
    : DEFAULT_PAY_TYPE
}

export function payTypeLabel(value: unknown): string {
  return PAY_TYPE_LABELS[parsePayType(value)]
}

export function formatMoney(value: number): string {
  return `$${parseMoney(value).toFixed(2)}`
}

export function parseMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return round2(n)
  }
  return 0
}

export function parseOptionalMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return round2(n)
  }
  return null
}

export function parseExtraLines(raw: unknown): PayRunExtraLine[] {
  if (typeof raw === 'string') {
    try {
      return parseExtraLines(JSON.parse(raw))
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((line) => {
      if (!line || typeof line !== 'object') return null
      const o = line as { label?: unknown; amount?: unknown }
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const amount = parseMoney(o.amount)
      if (!label && amount === 0) return null
      return { label: label || 'Extra', amount }
    })
    .filter((line): line is PayRunExtraLine => line !== null)
}

export function salarySkipped(lines: PayRunExtraLine[]): boolean {
  return lines.some((line) => line.label === SKIP_SALARY_LABEL)
}

export function visibleExtraLines(lines: PayRunExtraLine[]): PayRunExtraLine[] {
  return lines.filter((line) => line.label !== SKIP_SALARY_LABEL)
}

export function setSalarySkipped(lines: PayRunExtraLine[], skipped: boolean): PayRunExtraLine[] {
  const rest = lines.filter((line) => line.label !== SKIP_SALARY_LABEL)
  return skipped ? [...rest, { label: SKIP_SALARY_LABEL, amount: 0 }] : rest
}

export function extraPayTotal(lines: PayRunExtraLine[]): number {
  return round2(visibleExtraLines(lines).reduce((s, line) => s + line.amount, 0))
}

export function setSingleExtraAmount(lines: PayRunExtraLine[], amount: number): PayRunExtraLine[] {
  const skipped = salarySkipped(lines)
  const next = parseMoney(amount) > 0 ? [{ label: 'Extra', amount: parseMoney(amount) }] : []
  return setSalarySkipped(next, skipped)
}

export function computeGrossPay(input: {
  payType?: unknown
  basicHours?: number
  otHours?: number
  hourlyRate?: number
  salariedAmount?: number
  extraLines?: PayRunExtraLine[]
}): {
  payType: PayType
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
} {
  const payType = parsePayType(input.payType)
  const extraPay = extraPayTotal(input.extraLines ?? [])
  if (payType === 'salaried') {
    const basicPay = salarySkipped(input.extraLines ?? []) ? 0 : parseMoney(input.salariedAmount)
    return { payType, basicPay, otPay: 0, extraPay, grossPay: round2(basicPay + extraPay) }
  }
  const rate = parseMoney(input.hourlyRate)
  const basicPay = round2(parseMoney(input.basicHours) * rate)
  const otPay = round2(parseMoney(input.otHours) * rate * OT_MULTIPLIER)
  return { payType, basicPay, otPay, extraPay, grossPay: round2(basicPay + otPay + extraPay) }
}

export function ymdParts(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** Guess the run cycle from a saved hours window. Station default is semi-monthly. */
export function inferPayCycleFromRange(startDate: string, endDate: string): PayCycle {
  const start = ymdParts(startDate)
  const end = ymdParts(endDate)
  if (!start || !end) return DEFAULT_PAY_CYCLE
  const startUtc = Date.UTC(start.y, start.m - 1, start.d)
  const endUtc = Date.UTC(end.y, end.m - 1, end.d)
  const days = Math.floor((endUtc - startUtc) / 86400000) + 1
  const lastDay = new Date(end.y, end.m, 0).getDate()
  if (start.d === 1 && end.d === 15) return 'semimonthly'
  if (start.d === 16 && end.d === lastDay) return 'semimonthly'
  if (days <= 8) return 'weekly'
  if (days >= 27) return 'monthly'
  return DEFAULT_PAY_CYCLE
}

/** Prefer the cycle most staff on the hours list actually use. */
export function inferPayRunCycle(
  startDate: string,
  endDate: string,
  hoursRows: PayRunHoursRow[],
  staff: PayRunStaffProfile[]
): PayCycle {
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const counts = new Map<PayCycle, number>()
  for (const row of hoursRows) {
    if (isReportOnlyPayPeriodRow(row)) continue
    const cycle = parsePayCycle(staffById.get(row.staffId)?.payCycle ?? row.payCycle)
    counts.set(cycle, (counts.get(cycle) ?? 0) + 1)
  }
  let best: PayCycle | null = null
  let bestCount = 0
  for (const [cycle, count] of counts) {
    if (count > bestCount) {
      best = cycle
      bestCount = count
    }
  }
  if (best && bestCount > 0) return best
  return inferPayCycleFromRange(startDate, endDate)
}

export type DeductionOverride = {
  staffLoan?: number
  medical?: number
  shortageReady?: number
  extraDeductions?: PayRunExtraLine[]
}

export type NisTaken = {
  employee: number
  employer: number
}

function withDeductions(
  line: Omit<
    BuiltPayRunLine,
    | 'extraDeductions'
    | 'extraDeductionPay'
    | 'nisEmployee'
    | 'nisEmployer'
    | 'staffLoan'
    | 'medical'
    | 'totalDeductions'
    | 'netPay'
    | 'shortageReady'
  > & { shortageReady: number },
  profile: PayRunStaffProfile | undefined,
  deductionOverride?: DeductionOverride,
  nisTaken?: NisTaken
): BuiltPayRunLine {
  const deducted = computePayRunDeductions({
    grossPay: line.grossPay,
    staffLoan: deductionOverride?.staffLoan ?? parseMoney(profile?.staffLoan),
    medical: deductionOverride?.medical ?? parseMoney(profile?.medicalAmount),
    shortage: deductionOverride?.shortageReady ?? line.shortageReady,
    extraDeductions: deductionOverride?.extraDeductions ?? [],
    nisEmployeeTaken: nisTaken?.employee,
    nisEmployerTaken: nisTaken?.employer
  })
  return {
    ...line,
    extraDeductions: deducted.extraDeductions,
    extraDeductionPay: deducted.extraDeductionPay,
    shortageReady: deducted.shortage,
    nisEmployee: deducted.nisEmployee,
    nisEmployer: deducted.nisEmployer,
    staffLoan: deducted.staffLoan,
    medical: deducted.medical,
    totalDeductions: deducted.totalDeductions,
    netPay: deducted.netPay
  }
}

export function payPeriodSourceHash(rows: Array<{ staffId: string; transTtl: number }>): string {
  return [...rows]
    .map((r) => `${r.staffId}:${Number(r.transTtl || 0).toFixed(2)}`)
    .sort()
    .join('|')
}

function lineFromHoursRow(
  row: PayRunHoursRow,
  profile: PayRunStaffProfile | undefined,
  extras: PayRunExtraLine[],
  rateOverride?: PayRateOverride,
  deductionOverride?: DeductionOverride,
  nisTaken?: NisTaken
): BuiltPayRunLine {
  const payCycle = parsePayCycle(profile?.payCycle ?? row.payCycle)
  const payType = parsePayType(profile?.payType)
  const split = splitPayPeriodHours(row.transTtl, payCycle)
  const hourlyRate =
    rateOverride?.hourlyRate ??
    parseMoney(profile?.hourlyRate)
  const salariedAmount =
    rateOverride?.salariedAmount ??
    parseMoney(profile?.salariedAmount)
  const pay = computeGrossPay({
    payType,
    basicHours: split.basicHours,
    otHours: split.otHours,
    hourlyRate,
    salariedAmount,
    extraLines: extras
  })
  const base = {
    staffId: isReportOnlyPayPeriodRow(row) ? null : row.staffId,
    staffName: row.staffName.trim(),
    staffNo: (row.staffNo ?? profile?.nicNumber ?? '').trim() || null,
    payType,
    payCycle,
    transTtl: parseMoney(row.transTtl),
    basicHours: payType === 'salaried' ? 0 : split.basicHours,
    otHours: payType === 'salaried' ? 0 : split.otHours,
    hourlyRate,
    salariedAmount,
    basicPay: pay.basicPay,
    otPay: pay.otPay,
    extraPay: pay.extraPay,
    extraLines: extras,
    grossPay: pay.grossPay,
    shortageReady: parseMoney(row.shortage),
    taxCode: (rateOverride?.taxCode ?? profile?.taxCode ?? '').trim()
  }
  return withDeductions(base, profile, deductionOverride, nisTaken)
}

function salariedLine(
  profile: PayRunStaffProfile,
  extras: PayRunExtraLine[],
  rateOverride?: PayRateOverride,
  deductionOverride?: DeductionOverride,
  nisTaken?: NisTaken
): BuiltPayRunLine {
  const payCycle = parsePayCycle(profile.payCycle)
  const salariedAmount = rateOverride?.salariedAmount ?? parseMoney(profile.salariedAmount)
  const pay = computeGrossPay({
    payType: 'salaried',
    salariedAmount,
    extraLines: extras
  })
  return withDeductions(
    {
      staffId: profile.id,
      staffName: profile.name.trim(),
      staffNo: profile.nicNumber?.trim() || null,
      payType: 'salaried',
      payCycle,
      transTtl: 0,
      basicHours: 0,
      otHours: 0,
      hourlyRate: 0,
      salariedAmount,
      basicPay: pay.basicPay,
      otPay: 0,
      extraPay: pay.extraPay,
      extraLines: extras,
      grossPay: pay.grossPay,
      shortageReady: 0,
      taxCode: (rateOverride?.taxCode ?? profile.taxCode ?? '').trim()
    },
    profile,
    deductionOverride,
    nisTaken
  )
}

/** Build the station gross lines due on this run cycle. */
export function buildPayRunLines(input: {
  cycle: PayCycle
  hoursRows: PayRunHoursRow[]
  staff: PayRunStaffProfile[]
  extrasByStaffId?: Record<string, PayRunExtraLine[]>
  rateOverrides?: Record<string, PayRateOverride>
  deductionOverrides?: Record<string, DeductionOverride>
  nisTakenByStaffId?: Record<string, NisTaken>
}): BuiltPayRunLine[] {
  const cycle = parsePayCycle(input.cycle)
  const staffById = new Map(input.staff.map((s) => [s.id, s]))
  const used = new Set<string>()
  const lines: BuiltPayRunLine[] = []

  for (const row of input.hoursRows) {
    const reportOnly = isReportOnlyPayPeriodRow(row)
    const profile = reportOnly ? undefined : staffById.get(row.staffId)
    const rowCycle = parsePayCycle(profile?.payCycle ?? row.payCycle)
    if (!reportOnly && rowCycle !== cycle) continue
    if (!reportOnly) used.add(row.staffId)
    const key = reportOnly ? row.staffId : row.staffId
    lines.push(
      lineFromHoursRow(
        row,
        profile,
        input.extrasByStaffId?.[key] ?? [],
        input.rateOverrides?.[key],
        input.deductionOverrides?.[key],
        input.nisTakenByStaffId?.[row.staffId]
      )
    )
  }

  for (const profile of input.staff) {
    if (profile.status !== 'active') continue
    if (profile.role === 'manager') continue
    if (parsePayType(profile.payType) !== 'salaried') continue
    if (parsePayCycle(profile.payCycle) !== cycle) continue
    if (used.has(profile.id)) continue
    lines.push(
      salariedLine(
        profile,
        input.extrasByStaffId?.[profile.id] ?? [],
        input.rateOverrides?.[profile.id],
        input.deductionOverrides?.[profile.id],
        input.nisTakenByStaffId?.[profile.id]
      )
    )
  }

  return lines.sort((a, b) =>
    a.staffName.localeCompare(b.staffName, undefined, { sensitivity: 'base' })
  )
}

export function serializePayRunLine(line: BuiltPayRunLine, sortOrder: number) {
  return {
    staffId: line.staffId,
    staffName: line.staffName,
    staffNo: line.staffNo,
    bankCode: line.bankCode ?? '',
    accountNo: line.accountNo ?? null,
    payType: line.payType,
    payCycle: line.payCycle,
    transTtl: line.transTtl,
    basicHours: line.basicHours,
    otHours: line.otHours,
    hourlyRate: line.hourlyRate,
    salariedAmount: line.salariedAmount,
    basicPay: line.basicPay,
    otPay: line.otPay,
    extraPay: line.extraPay,
    extraLines: JSON.stringify(line.extraLines),
    extraDeductions: JSON.stringify(line.extraDeductions),
    extraDeductionPay: line.extraDeductionPay,
    grossPay: line.grossPay,
    shortageReady: line.shortageReady,
    nisEmployee: line.nisEmployee,
    nisEmployer: line.nisEmployer,
    staffLoan: line.staffLoan,
    medical: line.medical,
    totalDeductions: line.totalDeductions,
    netPay: line.netPay,
    taxCode: line.taxCode ?? '',
    sortOrder
  }
}

export function presentPayRunLine<T extends { extraLines: string; extraDeductions?: string }>(row: T) {
  return {
    ...row,
    extraLines: parseExtraLines(row.extraLines),
    extraDeductions: parseExtraLines(row.extraDeductions ?? '[]')
  }
}
