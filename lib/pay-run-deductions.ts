import { extraPayTotal, parseExtraLines, parseMoney, type PayRunExtraLine } from './pay-run'

export const NIS_RATE = 0.05
export const NIS_MONTHLY_CAP = 250

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

export function computePayRunDeductions(input: {
  grossPay: number
  staffLoan?: number
  medical?: number
  shortage?: number
  extraDeductions?: PayRunExtraLine[]
  nisEmployeeTaken?: number
  nisEmployerTaken?: number
}): {
  nisEmployee: number
  nisEmployer: number
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
  const staffLoan = parseMoney(input.staffLoan)
  const medical = parseMoney(input.medical)
  const shortage = parseMoney(input.shortage)
  const totalDeductions = round2(nisEmployee + staffLoan + medical + shortage + extraDeductionPay)
  return {
    nisEmployee,
    nisEmployer,
    staffLoan,
    medical,
    shortage,
    extraDeductions,
    extraDeductionPay,
    totalDeductions,
    netPay: round2(parseMoney(input.grossPay) - totalDeductions)
  }
}
