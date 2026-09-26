import { isReportOnlyPayPeriodRow } from '@/lib/pay-period-rows'
import { payrollBankCode } from '@/lib/pay-run-banking'
import { payMonthKey } from '@/lib/pay-run-deductions'
import { computePayRunDeductions } from '@/lib/pay-run-deductions'
import {
  buildPayRunLines,
  computeGrossPay,
  inferPayCycleFromRange,
  parseExtraLines,
  parseMoney,
  parsePayType,
  payPeriodSourceHash,
  serializePayRunLine,
  type BuiltPayRunLine,
  type DeductionOverride,
  type NisTaken,
  type PayRateOverride,
  type PayRunHoursRow,
  type PayRunStaffProfile
} from '@/lib/pay-run'
import { readOvertimeMultiplier } from '@/lib/payroll-settings-store'
import { prisma } from '@/lib/prisma'
import { parsePayCycle, splitPayPeriodHours, type PayCycle } from '@/lib/pay-cycle'
import { loanDeductionForProfile, loadStaffLoanSnapshots } from '@/lib/staff-loan-store'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function parsePayPeriodHoursRows(raw: string): PayRunHoursRow[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const rows: PayRunHoursRow[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      if (typeof r.staffId !== 'string' || typeof r.staffName !== 'string') continue
      rows.push({
        staffId: r.staffId,
        staffName: r.staffName,
        transTtl: typeof r.transTtl === 'number' ? r.transTtl : Number(r.transTtl) || 0,
        shortage: typeof r.shortage === 'number' ? r.shortage : Number(r.shortage) || 0,
        payCycle: typeof r.payCycle === 'string' ? r.payCycle : undefined,
        staffNo: typeof r.staffNo === 'string' ? r.staffNo : null
      })
    }
    return rows
  } catch {
    return []
  }
}

export async function loadPayRunStaffProfiles(): Promise<PayRunStaffProfile[]> {
  const staff = await prisma.staff.findMany({
    where: { role: { not: 'manager' } },
    select: {
      id: true,
      name: true,
      status: true,
      role: true,
      nicNumber: true,
      payCycle: true,
      payType: true,
      hourlyRate: true,
      salariedAmount: true,
      staffLoan: true,
      medicalAmount: true,
      taxCode: true,
      bankName: true,
      accountNumber: true
    }
  })
  const loans = await loadStaffLoanSnapshots(staff.map((person) => person.id))
  return staff.map((person) => {
    const deducted = loanDeductionForProfile(person.staffLoan, loans[person.id])
    return {
      ...person,
      staffLoan: deducted.staffLoan,
      loanRemaining: deducted.loanRemaining
    }
  })
}

/** NIS already taken this pay-date month on other processed runs. */
export async function loadNisTakenByStaffId(
  payDate: string,
  excludePayRunId?: string
): Promise<Record<string, NisTaken>> {
  const month = payMonthKey(payDate)
  if (!month) return {}
  const lines = await prisma.payRunLine.findMany({
    where: {
      staffId: { not: null },
      payRun: {
        status: 'processed',
        payDate: { startsWith: month },
        ...(excludePayRunId ? { id: { not: excludePayRunId } } : {})
      }
    },
    select: { staffId: true, nisEmployee: true, nisEmployer: true }
  })
  const taken: Record<string, NisTaken> = {}
  for (const line of lines) {
    if (!line.staffId) continue
    const prev = taken[line.staffId] ?? { employee: 0, employer: 0 }
    taken[line.staffId] = {
      employee: round2(prev.employee + line.nisEmployee),
      employer: round2(prev.employer + line.nisEmployer)
    }
  }
  return taken
}

export async function rebuildPayRunLines(
  payRunId: string,
  options: {
    hoursRows: PayRunHoursRow[]
    cycle: PayCycle
    payDate: string
    keepOverrides?: boolean
  }
) {
  const staff = await loadPayRunStaffProfiles()
  const extrasByStaffId: Record<string, ReturnType<typeof parseExtraLines>> = {}
  const rateOverrides: Record<string, PayRateOverride> = {}
  const deductionOverrides: Record<string, DeductionOverride> = {}
  const excludePayRunId = payRunId === 'new' ? undefined : payRunId
  const nisTakenByStaffId = await loadNisTakenByStaffId(options.payDate, excludePayRunId)

  if (options.keepOverrides) {
    const existing = await prisma.payRunLine.findMany({ where: { payRunId } })
    for (const line of existing) {
      const key = line.staffId || `name:${line.staffName}`
      extrasByStaffId[key] = parseExtraLines(line.extraLines)
      if (line.staffId) {
        extrasByStaffId[line.staffId] = extrasByStaffId[key]
      }
      rateOverrides[key] = {
        hourlyRate: line.hourlyRate,
        salariedAmount: line.salariedAmount,
        taxCode: line.taxCode,
        payType: line.payType
      }
      if (line.staffId) rateOverrides[line.staffId] = rateOverrides[key]
      deductionOverrides[key] = {
        staffLoan: line.staffLoan,
        medical: line.medical,
        shortageReady: line.shortageReady,
        extraDeductions: parseExtraLines(line.extraDeductions)
      }
      if (line.staffId) deductionOverrides[line.staffId] = deductionOverrides[key]
    }
    for (const row of options.hoursRows) {
      if (isReportOnlyPayPeriodRow(row) && extrasByStaffId[row.staffId] == null) {
        extrasByStaffId[row.staffId] = extrasByStaffId[`name:${row.staffName}`] ?? []
      }
      if (isReportOnlyPayPeriodRow(row) && deductionOverrides[row.staffId] == null) {
        deductionOverrides[row.staffId] = deductionOverrides[`name:${row.staffName}`] ?? {}
      }
    }
  }

  const otMultiplier = await readOvertimeMultiplier()
  const built = buildPayRunLines({
    cycle: parsePayCycle(options.cycle),
    hoursRows: options.hoursRows,
    staff,
    extrasByStaffId,
    rateOverrides: options.keepOverrides ? rateOverrides : undefined,
    deductionOverrides: options.keepOverrides ? deductionOverrides : undefined,
    nisTakenByStaffId,
    otMultiplier
  })
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const lines = attachBankingToLines(built, staffById)

  return {
    lines,
    sourceHash: payPeriodSourceHash(options.hoursRows)
  }
}

/** Save the pay range, pay date, and Pay+ cycle number. Rebuild lines when the range implies a different staff frequency. */
export async function updatePayRunSchedule(
  payRunId: string,
  input: { startDate: string; endDate: string; payDate: string; cycleNumber: number }
): Promise<{ rebuilt: boolean }> {
  const run = await prisma.payRun.findUnique({
    where: { id: payRunId },
    include: { payPeriod: true }
  })
  if (!run) throw new Error('Pay run not found')
  const frequency = inferPayCycleFromRange(input.startDate, input.endDate)
  const header = {
    startDate: input.startDate,
    endDate: input.endDate,
    payDate: input.payDate,
    cycle: frequency,
    cycleNumber: input.cycleNumber
  }
  if (parsePayCycle(run.cycle) === frequency) {
    await prisma.payRun.update({ where: { id: payRunId }, data: header })
    return { rebuilt: false }
  }
  const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
  const built = await rebuildPayRunLines(payRunId, {
    hoursRows,
    cycle: frequency,
    payDate: input.payDate,
    keepOverrides: true
  })
  await prisma.$transaction(async (tx) => {
    await tx.payRunLine.deleteMany({ where: { payRunId } })
    await tx.payRun.update({
      where: { id: payRunId },
      data: {
        ...header,
        sourceHash: built.sourceHash,
        lines: { create: built.lines.map((line, i) => serializePayRunLine(line, i)) }
      }
    })
  })
  return { rebuilt: true }
}

/** Draft lines keep the pay type from when the run was opened. Follow the staff record instead. */
export async function syncDraftPayTypes(payRunId: string): Promise<void> {
  const run = await prisma.payRun.findUnique({
    where: { id: payRunId },
    include: { lines: true, payPeriod: true }
  })
  if (!run || run.status !== 'draft') return
  const staff = await loadPayRunStaffProfiles()
  const staffById = new Map(staff.map((person) => [person.id, person]))
  const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
  const nisTaken = await loadNisTakenByStaffId(run.payDate, payRunId)
  const otMultiplier = await readOvertimeMultiplier()

  for (const line of run.lines) {
    if (!line.staffId) continue
    const profile = staffById.get(line.staffId)
    if (!profile) continue
    const nextType = parsePayType(profile.payType)
    if (nextType === parsePayType(line.payType)) continue
    const hoursRow = hoursRows.find((row) => row.staffId === line.staffId)
    const split = splitPayPeriodHours(hoursRow?.transTtl ?? line.transTtl, profile.payCycle)
    const hourlyRate = nextType === 'hourly' ? parseMoney(profile.hourlyRate) : line.hourlyRate
    const salariedAmount = nextType === 'salaried' ? parseMoney(profile.salariedAmount) : line.salariedAmount
    const basicHours = nextType === 'salaried' ? 0 : split.basicHours
    const otHours = nextType === 'salaried' ? 0 : split.otHours
    const extraLines = parseExtraLines(line.extraLines)
    const extraDeductions = parseExtraLines(line.extraDeductions)
    const pay = computeGrossPay({
      payType: nextType,
      basicHours,
      otHours,
      hourlyRate,
      salariedAmount,
      extraLines,
      otMultiplier
    })
    const taken = nisTaken[line.staffId]
    const deducted = computePayRunDeductions({
      grossPay: pay.grossPay,
      staffLoan: line.staffLoan,
      medical: line.medical,
      shortage: line.shortageReady,
      extraDeductions,
      nisEmployeeTaken: taken?.employee,
      nisEmployerTaken: taken?.employer
    })
    await prisma.payRunLine.update({
      where: { id: line.id },
      data: {
        payType: nextType,
        payCycle: parsePayCycle(profile.payCycle),
        basicHours,
        otHours,
        transTtl: nextType === 'salaried' ? line.transTtl : round2(basicHours + otHours),
        hourlyRate,
        salariedAmount,
        basicPay: pay.basicPay,
        otPay: pay.otPay,
        extraPay: pay.extraPay,
        grossPay: pay.grossPay,
        extraDeductions: JSON.stringify(deducted.extraDeductions),
        extraDeductionPay: deducted.extraDeductionPay,
        shortageReady: deducted.shortage,
        nisEmployee: deducted.nisEmployee,
        nisEmployer: deducted.nisEmployer,
        staffLoan: deducted.staffLoan,
        medical: deducted.medical,
        totalDeductions: deducted.totalDeductions,
        netPay: deducted.netPay
      }
    })
  }
}

export type PayRunYtd = {
  basicPay: number
  otPay: number
  extraPay: number
  grossPay: number
  nisEmployee: number
  staffLoan: number
  medical: number
  shortageReady: number
  extraDeductionPay: number
  totalDeductions: number
  netPay: number
}

const ZERO_YTD: PayRunYtd = {
  basicPay: 0,
  otPay: 0,
  extraPay: 0,
  grossPay: 0,
  nisEmployee: 0,
  staffLoan: 0,
  medical: 0,
  shortageReady: 0,
  extraDeductionPay: 0,
  totalDeductions: 0,
  netPay: 0
}

function addYtd(left: PayRunYtd, right: PayRunYtd): PayRunYtd {
  return {
    basicPay: round2(left.basicPay + right.basicPay),
    otPay: round2(left.otPay + right.otPay),
    extraPay: round2(left.extraPay + right.extraPay),
    grossPay: round2(left.grossPay + right.grossPay),
    nisEmployee: round2(left.nisEmployee + right.nisEmployee),
    staffLoan: round2(left.staffLoan + right.staffLoan),
    medical: round2(left.medical + right.medical),
    shortageReady: round2(left.shortageReady + right.shortageReady),
    extraDeductionPay: round2(left.extraDeductionPay + right.extraDeductionPay),
    totalDeductions: round2(left.totalDeductions + right.totalDeductions),
    netPay: round2(left.netPay + right.netPay)
  }
}

/** Approved pay in the same calendar year, up to this pay date, excluding this run. */
export async function loadPriorYtdByStaffId(
  payDate: string,
  excludePayRunId: string
): Promise<Record<string, PayRunYtd>> {
  const year = payDate.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return {}
  const lines = await prisma.payRunLine.findMany({
    where: {
      staffId: { not: null },
      payRun: {
        status: 'processed',
        payDate: { gte: `${year}-01-01`, lte: payDate },
        id: { not: excludePayRunId }
      }
    },
    select: {
      staffId: true,
      basicPay: true,
      otPay: true,
      extraPay: true,
      grossPay: true,
      nisEmployee: true,
      staffLoan: true,
      medical: true,
      shortageReady: true,
      extraDeductionPay: true,
      totalDeductions: true,
      netPay: true
    }
  })
  const totals: Record<string, PayRunYtd> = {}
  for (const line of lines) {
    if (!line.staffId) continue
    const current = totals[line.staffId] ?? { ...ZERO_YTD }
    totals[line.staffId] = addYtd(current, {
      basicPay: line.basicPay,
      otPay: line.otPay,
      extraPay: line.extraPay,
      grossPay: line.grossPay,
      nisEmployee: line.nisEmployee,
      staffLoan: line.staffLoan,
      medical: line.medical,
      shortageReady: line.shortageReady,
      extraDeductionPay: line.extraDeductionPay,
      totalDeductions: line.totalDeductions,
      netPay: line.netPay
    })
  }
  return totals
}

export function ytdIncludingCurrent(
  prior: PayRunYtd | undefined,
  current: PayRunYtd
): PayRunYtd {
  return addYtd(prior ?? ZERO_YTD, current)
}

/** Year-to-date through this pay date, including this run and excluding later runs. */
export function ytdAsOfLine(
  history: Array<PayRunYtd & { payRunId: string; payDate: string }>,
  current: PayRunYtd & { payRunId: string; payDate: string }
): PayRunYtd {
  const year = current.payDate.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return ytdIncludingCurrent(undefined, current)
  const from = `${year}-01-01`
  let prior: PayRunYtd | undefined
  for (const line of history) {
    if (line.payRunId === current.payRunId) continue
    if (line.payDate < from || line.payDate > current.payDate) continue
    prior = addYtd(prior ?? { ...ZERO_YTD }, line)
  }
  return ytdIncludingCurrent(prior, current)
}

export function attachBankingToLines<
  T extends { staffId?: string | null; bankCode?: string; accountNo?: string | null }
>(
  lines: T[],
  staffById: Map<string, Pick<PayRunStaffProfile, 'bankName' | 'accountNumber'>>
): T[] {
  return lines.map((line) => {
    const profile = line.staffId ? staffById.get(line.staffId) : undefined
    return {
      ...line,
      bankCode: line.bankCode || payrollBankCode(profile?.bankName, profile?.accountNumber),
      accountNo: line.accountNo || profile?.accountNumber || null,
      bankName: profile?.bankName ?? null
    }
  })
}
