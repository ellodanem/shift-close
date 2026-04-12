import { prisma } from '@/lib/prisma'

type LogLike = { staffId: string | null; deviceUserId: string }

/**
 * Distinct staff IDs implied by attendance logs (direct staffId or resolved deviceUserId).
 */
export async function staffIdsFromAttendanceLogs(logs: LogLike[]): Promise<Set<string>> {
  const ids = new Set<string>()
  const deviceIds: string[] = []
  for (const log of logs) {
    if (log.staffId) {
      ids.add(log.staffId)
    } else {
      const d = log.deviceUserId?.trim()
      if (d) deviceIds.push(d)
    }
  }
  const uniqueDevices = [...new Set(deviceIds)]
  if (uniqueDevices.length > 0) {
    const rows = await prisma.staff.findMany({
      where: { deviceUserId: { in: uniqueDevices } },
      select: { id: true }
    })
    for (const r of rows) ids.add(r.id)
  }
  return ids
}

/** Inactive non-manager staff whose vacation window overlaps [startYmd, endYmd] (YYYY-MM-DD). */
export async function inactiveStaffIdsWithVacationOverlap(
  startYmd: string,
  endYmd: string
): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      status: 'inactive',
      role: { not: 'manager' },
      vacationStart: { not: null },
      vacationEnd: { not: null },
      AND: [{ vacationStart: { lte: endYmd } }, { vacationEnd: { gte: startYmd } }]
    },
    select: { id: true }
  })
  return rows.map((r) => r.id)
}

export type PayPeriodStaffRow = {
  id: string
  name: string
  firstName: string
  deviceUserId: string | null
  vacationStart: string | null
  vacationEnd: string | null
  sortOrder: number
}

const payPeriodStaffSelect = {
  id: true,
  name: true,
  firstName: true,
  deviceUserId: true,
  vacationStart: true,
  vacationEnd: true,
  sortOrder: true
} as const

/** Merge active baseline + inactive staff with period signals; sort by sortOrder, name. */
export function mergePayPeriodStaffLists(
  activeBaseline: PayPeriodStaffRow[],
  inactiveSupplemental: PayPeriodStaffRow[]
): PayPeriodStaffRow[] {
  const byId = new Map<string, PayPeriodStaffRow>()
  for (const s of activeBaseline) byId.set(s.id, s)
  for (const s of inactiveSupplemental) {
    if (!byId.has(s.id)) byId.set(s.id, s)
  }
  return [...byId.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

export { payPeriodStaffSelect }
