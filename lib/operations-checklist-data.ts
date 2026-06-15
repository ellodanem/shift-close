import { prisma } from '@/lib/prisma'
import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import { buildDayReports } from '@/lib/day-reports'
import { buildComparisonRowsFromShifts } from '@/lib/deposit-comparison-rows'
import { getStationClosedDates } from '@/lib/public-holidays'
import type { OperationsChecklistUser } from '@/lib/operations-checklist-access'
import { canSeeFinancialChecklistItems } from '@/lib/operations-checklist-access'
import { buildOperationsChecklist } from '@/lib/operations-checklist'
import { compareYmd, enumerateYmdRange, weekKeyMonday } from '@/lib/operations-checklist-due-dates'
import type { ComparisonRow } from '@/lib/deposit-comparison-rows'
import type { DayReport } from '@/lib/types'
import type { OperationsChecklistPayload } from '@/lib/operations-checklist-types'
import { CHECKLIST_EPOCH_YMD, CHECKLIST_ENABLE_DEPOSIT_COMPARISON } from '@/lib/operations-checklist-types'

export async function loadOperationsChecklist(
  role: string,
  accessUser: OperationsChecklistUser
): Promise<OperationsChecklistPayload> {
  const now = new Date()
  const asOf = businessTodayYmd(now)
  const latestWorkDate = addCalendarDaysYmd(asOf, -1)
  const datesInWindow =
    compareYmd(latestWorkDate, CHECKLIST_EPOCH_YMD) >= 0
      ? enumerateYmdRange(CHECKLIST_EPOCH_YMD, latestWorkDate)
      : []

  const [dayReports, holidays, acknowledgements, customerAr, vendorPendingCount, vendorTouched] =
    await Promise.all([
      buildDayReports({ sinceDate: CHECKLIST_EPOCH_YMD }),
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

  const dayReportsByDate = new Map<string, DayReport>(dayReports.map((r) => [r.date, r]))
  const stationClosedDates = await getStationClosedDates(prisma, datesInWindow)
  const bankHolidayDates = new Set(holidays.map((h) => h.date))

  const comparisonRowsByDate = new Map<string, ComparisonRow[]>()
  if (CHECKLIST_ENABLE_DEPOSIT_COMPARISON) {
    const shifts = await prisma.shiftClose.findMany({
      where: {
        date: { in: datesInWindow },
        status: { in: ['closed', 'reviewed', 'draft', 'reopened'] }
      },
      include: { depositRecords: true }
    })

    const comparisonRows = buildComparisonRowsFromShifts(shifts)
    for (const row of comparisonRows) {
      if (!comparisonRowsByDate.has(row.date)) comparisonRowsByDate.set(row.date, [])
      comparisonRowsByDate.get(row.date)!.push(row)
    }
  }

  return buildOperationsChecklist({
    asOf,
    now,
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
