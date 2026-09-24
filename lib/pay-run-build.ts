import { isReportOnlyPayPeriodRow } from '@/lib/pay-period-rows'
import { payMonthKey } from '@/lib/pay-run-deductions'
import {
  buildPayRunLines,
  parseExtraLines,
  payPeriodSourceHash,
  type DeductionOverride,
  type NisTaken,
  type PayRunHoursRow,
  type PayRunStaffProfile
} from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'
import { parsePayCycle, type PayCycle } from '@/lib/pay-cycle'

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
      medicalAmount: true
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
  const rateOverrides: Record<string, { hourlyRate?: number; salariedAmount?: number }> = {}
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
      rateOverrides[key] = { hourlyRate: line.hourlyRate, salariedAmount: line.salariedAmount }
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

  const lines = buildPayRunLines({
    cycle: parsePayCycle(options.cycle),
    hoursRows: options.hoursRows,
    staff,
    extrasByStaffId,
    rateOverrides: options.keepOverrides ? rateOverrides : undefined,
    deductionOverrides: options.keepOverrides ? deductionOverrides : undefined,
    nisTakenByStaffId
  })

  return {
    lines,
    sourceHash: payPeriodSourceHash(options.hoursRows)
  }
}
