import { isReportOnlyPayPeriodRow } from '@/lib/pay-period-rows'
import { payrollBankCode } from '@/lib/pay-run-banking'
import { payMonthKey } from '@/lib/pay-run-deductions'
import { computePayRunDeductions } from '@/lib/pay-run-deductions'
import {
  buildPayRunLines,
  computeGrossPay,
  parseExtraLines,
  parseMoney,
  parsePayType,
  payPeriodSourceHash,
  type BuiltPayRunLine,
  type DeductionOverride,
  type NisTaken,
  type PayRateOverride,
  type PayRunHoursRow,
  type PayRunStaffProfile
} from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'
import { parsePayCycle, splitPayPeriodHours, type PayCycle } from '@/lib/pay-cycle'

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
  return staff
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

  const built = buildPayRunLines({
    cycle: parsePayCycle(options.cycle),
    hoursRows: options.hoursRows,
    staff,
    extrasByStaffId,
    rateOverrides: options.keepOverrides ? rateOverrides : undefined,
    deductionOverrides: options.keepOverrides ? deductionOverrides : undefined,
    nisTakenByStaffId
  })
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const lines = attachBankingToLines(built, staffById)

  return {
    lines,
    sourceHash: payPeriodSourceHash(options.hoursRows)
  }
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
      extraLines
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
      accountNo: line.accountNo || profile?.accountNumber || null
    }
  })
}
