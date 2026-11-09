import { buildDayReports, type BuildDayReportsOptions } from '@/lib/day-reports'
import { loadCstoreSnapshots } from '@/lib/cstore-day-report'
import { reconcileDay, type DayReconcile } from '@/lib/day-reconcile'
import { loadDayTankChecks } from '@/lib/tank-check-data'
import type { DayTankCheck } from '@/lib/tank-check'
import type { DayReport } from '@/lib/types'

/** End of Day V2: the same day report plus the Cstore comparison and the tank check. */
export type DayReportV2 = DayReport & { reconcile: DayReconcile; tank: DayTankCheck }

export async function buildDayReportsV2(options?: BuildDayReportsOptions): Promise<DayReportV2[]> {
  const days = await buildDayReports(options)
  const dates = days.map((d) => d.date)
  const snapshots = await loadCstoreSnapshots(dates)
  const tanks = await loadDayTankChecks(dates, snapshots)
  return days.map((day) => ({
    ...day,
    tank: tanks.get(day.date) as DayTankCheck,
    reconcile: reconcileDay(
      day.shifts.map((s) => ({
        shift: s.shift,
        supervisor: s.supervisor,
        systemCash: s.systemCash,
        systemChecks: s.systemChecks,
        systemDebit: s.systemDebit,
        otherCredit: s.otherCredit,
        systemInhouse: s.systemInhouse,
        systemFleet: s.systemFleet,
        countCash: s.countCash,
        countChecks: s.countChecks,
        countCredit: s.countCredit,
        countInhouse: s.countInhouse,
        countFleet: s.countFleet,
        totalDeposits: s.totalDeposits,
        unleaded: s.unleaded,
        diesel: s.diesel
      })),
      snapshots.get(day.date) ?? null
    )
  }))
}
