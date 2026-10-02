import { extraPayTotal, parseExtraLines, parseMoney, type PayRunExtraLine } from './pay-run'

export const NIS_RATE = 0.05
export const NIS_MONTHLY_CAP = 250
/** Flat rate on pay above the monthly free amount, after employee NIC. */
export const PAYE_RATE = 0.15
/** One free amount for the calendar month. A second pay in that month uses what is left. */
export const PAYE_MONTHLY_FREE = 2500

export type PayeMonthTaken = {
  taxablePay: number
  employeeNic: number
  paye: number
}

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

/**
 * PAYE for this pay. Employee NIC comes off taxable pay first, then whatever is left
 * of the monthly free amount, then 15% of the rest. Earlier approved pays this month
 * already used part of that free amount and already took their PAYE.
 */
export function computePaye(input: {
  taxablePay: number
  employeeNic: number
  prior?: PayeMonthTaken
  monthlyFree?: number
}): number {
  const free = parseMoney(input.monthlyFree ?? PAYE_MONTHLY_FREE)
  const mtdTaxable = round2(parseMoney(input.taxablePay) + parseMoney(input.prior?.taxablePay))
  const mtdNic = round2(parseMoney(input.employeeNic) + parseMoney(input.prior?.employeeNic))
  const chargeable = round2(Math.max(0, mtdTaxable - mtdNic - free))
  const mtdPaye = round2(chargeable * PAYE_RATE)
  return round2(Math.max(0, mtdPaye - parseMoney(input.prior?.paye)))
}

export function computePayRunDeductions(input: {
  grossPay: number
  /** Pay that can be taxed. Defaults to the full gross. */
  taxablePay?: number
  staffLoan?: number
  medical?: number
  shortage?: number
  extraDeductions?: PayRunExtraLine[]
  nisEmployeeTaken?: number
  nisEmployerTaken?: number
  payeTaken?: PayeMonthTaken
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
  const nisEmployee = computeNisShare(input.grossPay, input.nisEmployeeTaken)
  const nisEmployer = computeNisShare(input.grossPay, input.nisEmployerTaken)
  const taxablePay = input.taxablePay === undefined ? parseMoney(input.grossPay) : parseMoney(input.taxablePay)
  const paye = computePaye({
    taxablePay,
    employeeNic: nisEmployee,
    prior: input.payeTaken
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
