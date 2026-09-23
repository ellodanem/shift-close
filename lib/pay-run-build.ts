import { isReportOnlyPayPeriodRow } from '@/lib/pay-period-rows'
import {
  buildPayRunLines,
  parseExtraLines,
  payPeriodSourceHash,
  type PayRunHoursRow,
  type PayRunStaffProfile
} from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'
import { parsePayCycle, type PayCycle } from '@/lib/pay-cycle'

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
      salariedAmount: true
    }
  })
  return staff
}

export async function rebuildPayRunLines(
  payRunId: string,
  options: {
    hoursRows: PayRunHoursRow[]
    cycle: PayCycle
    keepOverrides?: boolean
  }
) {
  const staff = await loadPayRunStaffProfiles()
  const extrasByStaffId: Record<string, ReturnType<typeof parseExtraLines>> = {}
  const rateOverrides: Record<string, { hourlyRate?: number; salariedAmount?: number }> = {}

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
    }
    for (const row of options.hoursRows) {
      if (isReportOnlyPayPeriodRow(row) && extrasByStaffId[row.staffId] == null) {
        extrasByStaffId[row.staffId] = extrasByStaffId[`name:${row.staffName}`] ?? []
      }
    }
  }

  const lines = buildPayRunLines({
    cycle: parsePayCycle(options.cycle),
    hoursRows: options.hoursRows,
    staff,
    extrasByStaffId,
    rateOverrides: options.keepOverrides ? rateOverrides : undefined
  })

  return {
    lines,
    sourceHash: payPeriodSourceHash(options.hoursRows)
  }
}
