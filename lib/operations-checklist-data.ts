import { prisma } from '@/lib/prisma'
import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import { buildDayReports } from '@/lib/day-reports'
import { buildComparisonRowsFromShifts } from '@/lib/deposit-comparison-rows'
import { getStationClosedDates } from '@/lib/public-holidays'
import type { OperationsChecklistUser } from '@/lib/operations-checklist-access'
import { canSeeFinancialChecklistItems } from '@/lib/operations-checklist-access'
import { buildOperationsChecklist, ROLLING_WORK_DAYS } from '@/lib/operations-checklist'
import { weekKeyMonday } from '@/lib/operations-checklist-due-dates'
import type { ComparisonRow } from '@/lib/deposit-comparison-rows'
import type { DayReport } from '@/lib/types'
import type { OperationsChecklistPayload } from '@/lib/operations-checklist-types'

export async function loadOperationsChecklist(
  role: string,
  accessUser: OperationsChecklistUser
): Promise<OperationsChecklistPayload> {
  const asOf = businessTodayYmd()
  const sinceDate = addCalendarDaysYmd(asOf, -(ROLLING_WORK_DAYS + 2))

  const [dayReports, holidays, acknowledgements, customerAr, vendorPendingCount, vendorTouched] =
    await Promise.all([
      buildDayReports({ sinceDate }),
      prisma.publicHoliday.findMany({
        where: { countryCode: 'LC' },
        select: { date: true, stationClosed: true }
      }),
      prisma.checklistAcknowledgement.findMany({
        where: { weekKey: weekKeyMonday(asOf) }
      }),
      prisma.customerArSummary.findFirst({
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
      }),
      prisma.vendorInvoice.count({ where: { status: 'pending' } }),
      prisma.vendorInvoice.count({
        where: {
          updatedAt: {
            gte: new Date(`${weekKeyMonday(asOf)}T00:00:00.000Z`)
          }
        }
      })
    ])

  const dayReportsByDate = new Map<string, DayReport>(
    dayReports.map((r) => [r.date, r])
  )

  const datesInWindow: string[] = []
  for (let i = ROLLING_WORK_DAYS + 1; i >= 1; i--) {
    datesInWindow.push(addCalendarDaysYmd(asOf, -i))
  }

  const stationClosedDates = await getStationClosedDates(prisma, datesInWindow)
  const bankHolidayDates = new Set(holidays.map((h) => h.date))

  const shifts = await prisma.shiftClose.findMany({
    where: {
      date: { in: datesInWindow },
      status: { in: ['closed', 'reviewed', 'draft', 'reopened'] }
    },
    include: { depositRecords: true }
  })

  const comparisonRows = buildComparisonRowsFromShifts(shifts)
  const comparisonRowsByDate = new Map<string, ComparisonRow[]>()
  for (const row of comparisonRows) {
    if (!comparisonRowsByDate.has(row.date)) comparisonRowsByDate.set(row.date, [])
    comparisonRowsByDate.get(row.date)!.push(row)
  }

  return buildOperationsChecklist({
    asOf,
    role,
    showFinancial: canSeeFinancialChecklistItems(accessUser),
    dayReportsByDate,
    comparisonRowsByDate,
    stationClosedDates,
    bankHolidayDates,
    acknowledgements: acknowledgements.map((a) => ({
      taskId: a.taskId,
      weekKey: a.weekKey,
      kind: a.kind,
      note: a.note
    })),
    customerArUpdatedAt: customerAr?.updatedAt ?? null,
    vendorInvoicesTouchedThisWeek: vendorTouched,
    vendorPendingCount
  })
}
