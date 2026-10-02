import { capStaffLoanDeduction } from './staff-loan'
import { computePayRunDeductions, type PayeMonthTaken } from './pay-run-deductions'
import { normalizeOvertimeMultiplier } from './payroll-settings'
import { DEFAULT_VACATION_HOURS_PER_DAY, vacationDaysInPeriod, vacationEarning } from './vacation-pay'
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
  /** Set when this line is an added hour category. Amount is the pay for those hours. */
  hours?: number
  /** False leaves this amount out of PAYE. It is still paid, and it still counts for NIC. */
  taxable?: boolean
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
  /** When set, the loan deduction cannot exceed what is still owed. */
  loanRemaining?: number | null
  medicalAmount: number | null
  vacationStart?: string | null
  vacationEnd?: string | null
  taxCode?: string | null
  bankName?: string | null
  accountNumber?: string | null
}

export type PayRateOverride = {
  hourlyRate?: number
  salariedAmount?: number
  taxCode?: string
  /** Pay type stored on the line. A mismatch means the staff record has since changed. */
  payType?: string
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
  vacationDays: number
  vacationHours: number
  vacationPay: number
  extraPay: number
  extraLines: PayRunExtraLine[]
  extraDeductions: PayRunExtraLine[]
  extraDeductionPay: number
  grossPay: number
  shortageReady: number
  nisEmployee: number
  nisEmployer: number
  paye: number
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
      const o = line as { label?: unknown; amount?: unknown; hours?: unknown; taxable?: unknown }
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const amount = parseMoney(o.amount)
      const hours = typeof o.hours === 'number' && Number.isFinite(o.hours) ? parseMoney(o.hours) : undefined
      if (!label && amount === 0 && !hours) return null
      return {
        label: label || 'Extra',
        amount,
        ...(hours ? { hours } : {}),
        ...(o.taxable === false ? { taxable: false as const } : {})
      }
    })
    .filter((line): line is PayRunExtraLine => line !== null)
}

export function salarySkipped(lines: PayRunExtraLine[]): boolean {
  return lines.some((line) => line.label === SKIP_SALARY_LABEL)
}

export function visibleExtraLines(lines: PayRunExtraLine[]): PayRunExtraLine[] {
  return lines.filter((line) => line.label !== SKIP_SALARY_LABEL)
}

export function extraPayTotal(lines: PayRunExtraLine[]): number {
  return round2(visibleExtraLines(lines).reduce((s, line) => s + line.amount, 0))
}

/** Gross minus extras marked not taxed. Basic pay and overtime stay taxable. */
export function taxablePayFromGross(grossPay: number, lines: PayRunExtraLine[]): number {
  const excluded = visibleExtraLines(lines)
    .filter((line) => line.taxable === false)
    .reduce((sum, line) => sum + line.amount, 0)
  return round2(Math.max(0, parseMoney(grossPay) - excluded))
}

export function setSingleExtraAmount(_lines: PayRunExtraLine[], amount: number): PayRunExtraLine[] {
  return parseMoney(amount) > 0 ? [{ label: 'Extra', amount: parseMoney(amount) }] : []
}

export function computeGrossPay(input: {
  payType?: unknown
  basicHours?: number
  otHours?: number
  hourlyRate?: number
  salariedAmount?: number
  extraLines?: PayRunExtraLine[]
  /** Times the hourly rate. Defaults to time and a half. */
  otMultiplier?: number
  /** Calendar vacation days inside this pay period. Hourly only. */
  vacationDays?: number
  /** Straight-time hours paid for each vacation day. Defaults to 6. */
  vacationHoursPerDay?: number
}): {
  payType: PayType
  basicPay: number
  otPay: number
  extraPay: number
  vacationDays: number
  vacationHours: number
  vacationPay: number
  grossPay: number
} {
  const payType = parsePayType(input.payType)
  const extraPay = extraPayTotal(input.extraLines ?? [])
  const vacation = vacationEarning({
    payType,
    vacationDays: input.vacationDays,
    hourlyRate: input.hourlyRate,
    hoursPerDay: input.vacationHoursPerDay ?? DEFAULT_VACATION_HOURS_PER_DAY
  })
  if (payType === 'salaried') {
    const basicPay = parseMoney(input.salariedAmount)
    return { payType, basicPay, otPay: 0, extraPay, ...vacation, grossPay: round2(basicPay + extraPay) }
  }
  const rate = parseMoney(input.hourlyRate)
  const multiplier = normalizeOvertimeMultiplier(input.otMultiplier ?? OT_MULTIPLIER)
  const basicPay = round2(parseMoney(input.basicHours) * rate)
  const otPay = round2(parseMoney(input.otHours) * rate * multiplier)
  return {
    payType,
    basicPay,
    otPay,
    extraPay,
    ...vacation,
    grossPay: round2(basicPay + otPay + extraPay + vacation.vacationPay)
  }
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
  if (start.d === 1 && end.d === lastDay) return 'monthly'
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
    | 'paye'
    | 'staffLoan'
    | 'medical'
    | 'totalDeductions'
    | 'netPay'
    | 'shortageReady'
  > & { shortageReady: number },
  profile: PayRunStaffProfile | undefined,
  deductionOverride?: DeductionOverride,
  nisTaken?: NisTaken,
  payeTaken?: PayeMonthTaken
): BuiltPayRunLine {
  const deducted = computePayRunDeductions({
    grossPay: line.grossPay,
    taxablePay: taxablePayFromGross(line.grossPay, line.extraLines),
    staffLoan: capStaffLoanDeduction(
      deductionOverride?.staffLoan ?? parseMoney(profile?.staffLoan),
      profile?.loanRemaining
    ),
    medical: deductionOverride?.medical ?? parseMoney(profile?.medicalAmount),
    shortage: deductionOverride?.shortageReady ?? line.shortageReady,
    extraDeductions: deductionOverride?.extraDeductions ?? [],
    nisEmployeeTaken: nisTaken?.employee,
    nisEmployerTaken: nisTaken?.employer,
    payeTaken
  })
  return {
    ...line,
    extraDeductions: deducted.extraDeductions,
    extraDeductionPay: deducted.extraDeductionPay,
    shortageReady: deducted.shortage,
    nisEmployee: deducted.nisEmployee,
    nisEmployer: deducted.nisEmployer,
    paye: deducted.paye,
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
  nisTaken?: NisTaken,
  otMultiplier?: number,
  payeTaken?: PayeMonthTaken,
  vacation?: { days: number; hoursPerDay: number }
): BuiltPayRunLine {
  const payCycle = parsePayCycle(profile?.payCycle ?? row.payCycle)
  const payType = parsePayType(profile?.payType)
  const split = splitPayPeriodHours(row.transTtl, payCycle)
  const keepLineAmounts =
    !!rateOverride && (!rateOverride.payType || parsePayType(rateOverride.payType) === payType)
  const hourlyRate =
    keepLineAmounts && payType === 'hourly'
      ? parseMoney(rateOverride?.hourlyRate)
      : parseMoney(profile?.hourlyRate)
  const salariedAmount =
    keepLineAmounts && payType === 'salaried'
      ? parseMoney(rateOverride?.salariedAmount)
      : parseMoney(profile?.salariedAmount)
  const pay = computeGrossPay({
    payType,
    basicHours: split.basicHours,
    otHours: split.otHours,
    hourlyRate,
    salariedAmount,
    extraLines: extras,
    otMultiplier,
    vacationDays: vacation?.days,
    vacationHoursPerDay: vacation?.hoursPerDay
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
    vacationDays: pay.vacationDays,
    vacationHours: pay.vacationHours,
    vacationPay: pay.vacationPay,
    extraPay: pay.extraPay,
    extraLines: extras,
    grossPay: pay.grossPay,
    shortageReady: parseMoney(row.shortage),
    taxCode: (rateOverride?.taxCode ?? profile?.taxCode ?? '').trim()
  }
  return withDeductions(base, profile, deductionOverride, nisTaken, payeTaken)
}

function salariedLine(
  profile: PayRunStaffProfile,
  extras: PayRunExtraLine[],
  rateOverride?: PayRateOverride,
  deductionOverride?: DeductionOverride,
  nisTaken?: NisTaken,
  payeTaken?: PayeMonthTaken
): BuiltPayRunLine {
  const payCycle = parsePayCycle(profile.payCycle)
  const keepLineAmounts =
    !!rateOverride && (!rateOverride.payType || parsePayType(rateOverride.payType) === 'salaried')
  const salariedAmount = keepLineAmounts
    ? parseMoney(rateOverride?.salariedAmount)
    : parseMoney(profile.salariedAmount)
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
      vacationDays: 0,
      vacationHours: 0,
      vacationPay: 0,
      extraPay: pay.extraPay,
      extraLines: extras,
      grossPay: pay.grossPay,
      shortageReady: 0,
      taxCode: (rateOverride?.taxCode ?? profile.taxCode ?? '').trim()
    },
    profile,
    deductionOverride,
    nisTaken,
    payeTaken
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
  payeTakenByStaffId?: Record<string, PayeMonthTaken>
  otMultiplier?: number
  periodStart?: string
  periodEnd?: string
  vacationHoursPerDay?: number
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
    const vacationDays =
      profile && input.periodStart && input.periodEnd
        ? vacationDaysInPeriod(profile.vacationStart, profile.vacationEnd, input.periodStart, input.periodEnd)
        : 0
    lines.push(
      lineFromHoursRow(
        row,
        profile,
        input.extrasByStaffId?.[key] ?? [],
        input.rateOverrides?.[key],
        input.deductionOverrides?.[key],
        input.nisTakenByStaffId?.[row.staffId],
        input.otMultiplier,
        input.payeTakenByStaffId?.[row.staffId],
        { days: vacationDays, hoursPerDay: input.vacationHoursPerDay ?? DEFAULT_VACATION_HOURS_PER_DAY }
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
        input.nisTakenByStaffId?.[profile.id],
        input.payeTakenByStaffId?.[profile.id]
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
    vacationDays: line.vacationDays,
    vacationHours: line.vacationHours,
    vacationPay: line.vacationPay,
    extraPay: line.extraPay,
    extraLines: JSON.stringify(line.extraLines),
    extraDeductions: JSON.stringify(line.extraDeductions),
    extraDeductionPay: line.extraDeductionPay,
    grossPay: line.grossPay,
    shortageReady: line.shortageReady,
    nisEmployee: line.nisEmployee,
    nisEmployer: line.nisEmployer,
    paye: line.paye,
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
