import { extraPayTotal, parseExtraLines, parseMoney, type PayRunExtraLine } from './pay-run'
import { payPeriodsPerYear, type PayCycle } from './pay-cycle'

export const NIS_RATE = 0.05
export const NIS_MONTHLY_CAP = 250
export const PAYE_MIN_TAX_CODE = 254
export const PAYE_ANNUAL_NIS_CAP = 3000
export const PAYE_BANDS = [
  { limit: 15000, rate: 0.15 },
  { limit: 30000, rate: 0.2 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.3 }
] as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function payMonthKey(ymd: string): string {
  return /^\d{4}-\d{2}/.test(ymd) ? ymd.slice(0, 7) : ''
}

/** Employee or employer NIS for one run, remaining monthly cap already taken elsewhere. */
export function computeNisShare(grossPay: number, alreadyTaken = 0): number {
  const raw = round2(Math.max(0, parseMoney(grossPay)) * NIS_RATE)
  const remaining = round2(Math.max(0, NIS_MONTHLY_CAP - parseMoney(alreadyTaken)))
  return round2(Math.min(raw, remaining))
}

/** Numeric part of the employee code, with PayMS's statutory minimum code. */
export function parsePayeTaxCode(value: unknown): number {
  const match = String(value ?? '').trim().match(/^\d+/)
  const parsed = match ? Number(match[0]) : PAYE_MIN_TAX_CODE
  return Math.max(PAYE_MIN_TAX_CODE, Number.isFinite(parsed) ? parsed : PAYE_MIN_TAX_CODE)
}

export function computeAnnualPayeTax(chargeableIncome: number): number {
  let remaining = Math.max(0, parseMoney(chargeableIncome))
  let lower = 0
  let tax = 0
  for (const band of PAYE_BANDS) {
    const amount = Math.max(0, Math.min(remaining, band.limit - lower))
    tax += amount * band.rate
    remaining -= amount
    lower = band.limit
    if (remaining <= 0) break
  }
  return round2(tax)
}

/** PayMS PAYE: annualize this pay, apply NIS/code allowances and annual bands, then de-annualize. */
export function computePaye(input: {
  taxablePay: number
  employeeNic: number
  payCycle?: PayCycle | string
  taxCode?: string | number | null
  nisExempt?: boolean
  payeExempt?: boolean
}): number {
  if (input.payeExempt) return 0
  const periods = payPeriodsPerYear(input.payCycle)
  const annualEarnings = round2(parseMoney(input.taxablePay) * periods)
  const annualNisAllowance = input.nisExempt
    ? 0
    : Math.min(PAYE_ANNUAL_NIS_CAP, round2(parseMoney(input.employeeNic) * periods))
  const codeAllowance = parsePayeTaxCode(input.taxCode) * 100
  const chargeable = round2(Math.max(0, annualEarnings - annualNisAllowance - codeAllowance))
  return round2(computeAnnualPayeTax(chargeable) / periods)
}

export function computePayRunDeductions(input: {
  grossPay: number
  /** Pay that can be taxed. Defaults to the full gross. */
  taxablePay?: number
  /** Pay subject to NIS. Defaults to the full gross. */
  nisEligiblePay?: number
  nisExempt?: boolean
  payCycle?: PayCycle | string
  taxCode?: string | number | null
  payeExempt?: boolean
  staffLoan?: number
  medical?: number
  shortage?: number
  extraDeductions?: PayRunExtraLine[]
  nisEmployeeTaken?: number
  nisEmployerTaken?: number
}): {
  nisEmployee: number
  nisEmployer: number
  paye: number
  staffLoan: number
  medical: number
  shortage: number
  extraDeductions: PayRunExtraLine[]
  extraDeductionPay: number
  totalDeductions: number
  netPay: number
} {
  const extraDeductions = parseExtraLines(input.extraDeductions ?? [])
  const extraDeductionPay = extraPayTotal(extraDeductions)
  const nisEligiblePay = input.nisEligiblePay === undefined ? input.grossPay : input.nisEligiblePay
  const nisEmployee = input.nisExempt ? 0 : computeNisShare(nisEligiblePay, input.nisEmployeeTaken)
  const nisEmployer = input.nisExempt ? 0 : computeNisShare(nisEligiblePay, input.nisEmployerTaken)
  const taxablePay = input.taxablePay === undefined ? parseMoney(input.grossPay) : parseMoney(input.taxablePay)
  const paye = computePaye({
    taxablePay,
    employeeNic: nisEmployee,
    payCycle: input.payCycle,
    taxCode: input.taxCode,
    nisExempt: input.nisExempt,
    payeExempt: input.payeExempt
  })
  const staffLoan = parseMoney(input.staffLoan)
  const medical = parseMoney(input.medical)
  const shortage = parseMoney(input.shortage)
  const totalDeductions = round2(paye + nisEmployee + staffLoan + medical + shortage + extraDeductionPay)
  return {
    nisEmployee,
    nisEmployer,
    paye,
    staffLoan,
    medical,
    shortage,
    extraDeductions,
    extraDeductionPay,
    totalDeductions,
    netPay: round2(parseMoney(input.grossPay) - totalDeductions)
  }
}
