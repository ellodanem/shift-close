import { toYmdInBusinessTz, businessTodayYmd, ymdToUtcNoonDate, addCalendarDaysYmd } from '@/lib/datetime-policy'
import { getDashboardDisclosedOverShort, getShiftListOkKind } from '@/lib/calculations'
import { formatAmount, groupBatchesForMonth } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
import {
  buildPresenceForDate,
  calendarYmdInTz,
  getPresentAbsenceSettings,
  loadRosterForCalendarYmd,
  readStationTimeZone
} from '@/lib/present-absence'
import { isSupervisorLike, normalizeAppRole } from '@/lib/roles'
import { getOccurrenceDates } from '@/lib/reminderRecurrence'
import { prisma } from '@/lib/prisma'

export type DashboardMonthSummary = {
  year: number
  month: number
  monthName: string
  totals: {
    deposits: number
    debitAndCredit: number
    debit: number
    credit: number
    fleet: number
    vouchers: number
    inhouse: number
    grandTotal: number
  }
  status: {
    lastShift: { date: string; shift: string; createdAt: string } | null
    pendingReviewCount: number
    incompleteDaysCount: number
    totalOverShort: number
  }
}

function sumDepositsFromShifts(shifts: { deposits: unknown }[]): number {
  let total = 0
  shifts.forEach((shift) => {
    try {
      const depositsArray =
        typeof shift.deposits === 'string'
          ? JSON.parse(shift.deposits || '[]')
          : Array.isArray(shift.deposits)
            ? shift.deposits
            : []
      const shiftTotal = (depositsArray as number[])
        .filter((d: unknown) => d !== null && d !== undefined && !Number.isNaN(Number(d)) && Number(d) > 0)
        .reduce((sum: number, d: unknown) => sum + (Number(d) || 0), 0)
      total += shiftTotal
    } catch {
      // skip invalid
    }
  })
  return total
}

export async function fetchDashboardMonthSummary(params: {
  year?: number
  month?: number
}): Promise<DashboardMonthSummary> {
  const now = new Date()
  const targetYear = params.year ?? now.getFullYear()
  const targetMonth = params.month ?? now.getMonth() + 1
  const monthStart = new Date(targetYear, targetMonth - 1, 1)
  const monthEnd = new Date(targetYear, targetMonth, 0)
  const startDate = toYmdInBusinessTz(monthStart)
  const endDate = toYmdInBusinessTz(monthEnd)

  const shifts = await prisma.shiftClose.findMany({
    where: { date: { gte: startDate, lte: endDate } }
  })

  let totalDeposits = 0
  let totalDebit = 0
  let totalCredit = 0
  let totalFleet = 0
  let totalVouchers = 0
  let totalInhouse = 0

  shifts.forEach((shift) => {
    try {
      const depositsArray =
        typeof shift.deposits === 'string'
          ? JSON.parse(shift.deposits || '[]')
          : Array.isArray(shift.deposits)
            ? shift.deposits
            : []
      totalDeposits += (depositsArray as number[])
        .filter((d: unknown) => d !== null && d !== undefined && !Number.isNaN(Number(d)) && Number(d) > 0)
        .reduce((sum: number, d: unknown) => sum + (Number(d) || 0), 0)
    } catch {
      // skip
    }
    totalDebit += shift.systemDebit || 0
    totalCredit += shift.otherCredit || 0
    totalFleet += shift.systemFleet || 0
    totalVouchers += shift.systemMassyCoupons || 0
    totalInhouse += shift.systemInhouse || 0
  })

  const [lastShift, allClosedShifts, allShiftsForMonth] = await Promise.all([
    prisma.shiftClose.findFirst({
      where: { OR: [{ status: 'closed' }, { status: 'reviewed' }] },
      orderBy: { createdAt: 'desc' },
      select: { date: true, shift: true, createdAt: true }
    }),
    prisma.shiftClose.findMany({
      where: { OR: [{ status: 'closed' }, { status: 'reopened' }] },
      select: {
        id: true,
        status: true,
        notes: true,
        osReviewed: true,
        osLegitAsIs: true
      }
    }),
    prisma.shiftClose.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true, shift: true, status: true }
    })
  ])

  const pendingReviewShifts = allClosedShifts.filter(
    (shift) =>
      getShiftListOkKind({
        status: shift.status,
        notes: shift.notes ?? '',
        osReviewed: shift.osReviewed,
        osLegitAsIs: shift.osLegitAsIs
      }) === 'needs_review'
  )

  const shiftsByDate = new Map<string, Array<{ shift: string; status: string }>>()
  allShiftsForMonth.forEach((shift) => {
    if (!shiftsByDate.has(shift.date)) shiftsByDate.set(shift.date, [])
    shiftsByDate.get(shift.date)!.push({ shift: shift.shift, status: shift.status })
  })

  let incompleteDaysCount = 0
  shiftsByDate.forEach((dayShifts) => {
    const shiftTypes = dayShifts.map((s) => s.shift)
    const hasDraft = dayShifts.some((s) => s.status === 'draft')
    const hasStandard = shiftTypes.some((s) => s === '6-1' || s === '1-9')
    const hasCustom = shiftTypes.some((s) => s === '7:30 - 2')
    if (hasDraft) incompleteDaysCount++
    else if (hasCustom && hasStandard) incompleteDaysCount++
    else if (hasCustom) {
      if (dayShifts.length !== 1) incompleteDaysCount++
    } else {
      if (!shiftTypes.includes('6-1') || !shiftTypes.includes('1-9')) incompleteDaysCount++
    }
  })

  let totalOverShort = 0
  shifts.forEach((shift) => {
    totalOverShort += getDashboardDisclosedOverShort({
      status: shift.status,
      overShortTotal: shift.overShortTotal,
      osReviewed: shift.osReviewed,
      osLegitAsIs: shift.osLegitAsIs
    })
  })

  return {
    year: targetYear,
    month: targetMonth,
    monthName: monthStart.toLocaleString('default', { month: 'long' }),
    totals: {
      deposits: totalDeposits,
      debitAndCredit: totalDebit + totalCredit,
      debit: totalDebit,
      credit: totalCredit,
      fleet: totalFleet,
      vouchers: totalVouchers,
      inhouse: totalInhouse,
      grandTotal: totalDeposits + totalDebit + totalCredit + totalFleet + totalVouchers
    },
    status: {
      lastShift: lastShift
        ? {
            date: lastShift.date,
            shift: lastShift.shift,
            createdAt: lastShift.createdAt.toISOString()
          }
        : null,
      pendingReviewCount: pendingReviewShifts.length,
      incompleteDaysCount,
      totalOverShort
    }
  }
}

export async function fetchDashboardToday() {
  const tz = await readStationTimeZone()
  const now = new Date()
  const todayYmd = calendarYmdInTz(now, tz)
  const settings = await getPresentAbsenceSettings()

  if (!settings.enabled) {
    const roster = await loadRosterForCalendarYmd(todayYmd, tz)
    return {
      date: todayYmd,
      weekStart: roster.weekStart,
      stationTimeZone: tz,
      scheduled: roster.scheduled.map((s) => ({
        staffId: s.staffId,
        staffName: s.staffName,
        staffFirstName: s.staffFirstName,
        shiftName: s.shiftName,
        shiftColor: s.shiftColor,
        shiftStartTime: s.shiftStartTime
      })),
      onVacation: roster.onVacation,
      off: roster.off,
      presentAbsenceEnabled: false
    }
  }

  const built = await buildPresenceForDate({
    dateYmd: todayYmd,
    tz,
    now,
    graceMinutes: settings.graceMinutes
  })

  const scheduled = built.scheduled.map((s) => {
    const p = built.presenceByStaffId[s.staffId]
    return {
      staffId: s.staffId,
      staffName: s.staffName,
      staffFirstName: s.staffFirstName,
      shiftName: s.shiftName,
      shiftColor: s.shiftColor,
      shiftStartTime: s.shiftStartTime,
      presence: p
        ? {
            status: p.status,
            lateReason: p.lateReason,
            graceEndsAt: p.graceEndsAtIso ?? null,
            isExpected: p.isExpected,
            manualPresent: p.manualPresent,
            manualAbsent: p.manualAbsent,
            punchExempt: p.punchExempt
          }
        : undefined
    }
  })

  return {
    date: todayYmd,
    weekStart: built.weekStart,
    stationTimeZone: tz,
    scheduled,
    onVacation: built.onVacation,
    off: built.off,
    presentAbsenceEnabled: true,
    presentAbsenceGraceMinutes: settings.graceMinutes
  }
}

export async function fetchDashboardUpcoming() {
  const upcoming: Array<{
    type: 'birthday' | 'invoice' | 'contract' | 'pay-day' | 'other'
    title: string
    date: string
    daysUntil: number
    priority: 'high' | 'medium' | 'low'
    reminderId?: string
    payDayId?: string
  }> = []

  const now = new Date()
  const todayStr = businessTodayYmd(now)
  const nextWeekStr = addCalendarDaysYmd(todayStr, 7)
  const today = ymdToUtcNoonDate(todayStr)

  const staff = await prisma.staff.findMany({
    where: { dateOfBirth: { not: null }, status: 'active' },
    select: { id: true, name: true, dateOfBirth: true }
  })

  staff.forEach((member) => {
    if (!member.dateOfBirth) return
    const [, month, day] = member.dateOfBirth.split('-').map(Number)
    if (!month || !day) return
    const thisYearBirthday = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day, 12, 0, 0, 0))
    if (thisYearBirthday < today) {
      thisYearBirthday.setUTCFullYear(today.getUTCFullYear() + 1)
    }
    const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil >= 0 && daysUntil <= 7) {
      const y = thisYearBirthday.getUTCFullYear()
      const m = String(thisYearBirthday.getUTCMonth() + 1).padStart(2, '0')
      const d = String(thisYearBirthday.getUTCDate()).padStart(2, '0')
      upcoming.push({
        type: 'birthday',
        title: `${member.name}'s Birthday`,
        date: `${y}-${m}-${d}`,
        daysUntil,
        priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low'
      })
    }
  })

  const payDays = await prisma.payDay.findMany({
    where: { date: { gte: todayStr, lte: nextWeekStr } },
    orderBy: { date: 'asc' }
  })
  payDays.forEach((pd) => {
    const daysUntil = Math.ceil(
      (new Date(pd.date + 'T12:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysUntil >= 0 && daysUntil <= 7) {
      upcoming.push({
        type: 'pay-day',
        title: pd.notes ? `Pay Day: ${pd.notes}` : 'Pay Day',
        date: pd.date,
        daysUntil,
        priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low',
        payDayId: pd.id
      })
    }
  })

  const reminders = await prisma.reminder.findMany({
    where: {
      OR: [
        { date: { gte: todayStr, lte: nextWeekStr }, recurrenceType: null },
        { recurrenceType: { not: null } }
      ]
    },
    orderBy: { date: 'asc' }
  })
  const reminderOccurrences = reminders.flatMap((r) =>
    getOccurrenceDates(
      {
        ...r,
        recurrenceDayOfWeek: r.recurrenceDayOfWeek ?? undefined,
        recurrenceDayOfMonth: r.recurrenceDayOfMonth ?? undefined
      },
      todayStr,
      nextWeekStr
    )
  )
  reminderOccurrences.forEach(({ date, reminder }) => {
    const daysUntil = Math.ceil(
      (new Date(date + 'T12:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysUntil >= 0 && daysUntil <= 7) {
      upcoming.push({
        type: 'other',
        title: reminder.title,
        date,
        daysUntil,
        priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low',
        reminderId: reminder.id
      })
    }
  })

  upcoming.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
    const priorityOrder = { high: 1, medium: 2, low: 3 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  return upcoming
}

export async function fetchDashboardFuelComparison() {
  const recentDates = await prisma.shiftClose.findMany({
    select: { date: true },
    orderBy: { date: 'desc' },
    distinct: ['date'],
    take: 5
  })
  if (recentDates.length === 0) return []

  const dates = recentDates.map((r) => r.date)
  const priorDates = dates.map((d) => {
    const dt = ymdToUtcNoonDate(d)
    dt.setFullYear(dt.getFullYear() - 1)
    return toYmdInBusinessTz(dt)
  })

  const [currentShifts, priorHistorical, priorShifts] = await Promise.all([
    prisma.shiftClose.findMany({
      where: { date: { in: dates } },
      select: { date: true, unleaded: true, diesel: true }
    }),
    prisma.historicalFuelData.findMany({ where: { date: { in: priorDates } } }),
    prisma.shiftClose.findMany({
      where: { date: { in: priorDates } },
      select: { date: true, unleaded: true, diesel: true }
    })
  ])

  const currentByDate = new Map<string, { unleaded: number; diesel: number }>()
  currentShifts.forEach((s) => {
    const existing = currentByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
    currentByDate.set(s.date, {
      unleaded: existing.unleaded + (s.unleaded || 0),
      diesel: existing.diesel + (s.diesel || 0)
    })
  })

  const priorHistoricalByDate = new Map(priorHistorical.map((r) => [r.date, r]))
  const priorShiftsByDate = new Map<string, { unleaded: number; diesel: number }>()
  priorShifts.forEach((s) => {
    const existing = priorShiftsByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
    priorShiftsByDate.set(s.date, {
      unleaded: existing.unleaded + (s.unleaded || 0),
      diesel: existing.diesel + (s.diesel || 0)
    })
  })

  const result = dates.map((date, i) => {
    const current = currentByDate.get(date) ?? { unleaded: 0, diesel: 0 }
    const hist = priorHistoricalByDate.get(priorDates[i])
    const priorShift = priorShiftsByDate.get(priorDates[i]) ?? { unleaded: 0, diesel: 0 }
    return {
      date,
      priorDate: priorDates[i],
      unleaded: current.unleaded,
      diesel: current.diesel,
      prevUnleaded: hist?.unleadedLitres ?? priorShift.unleaded,
      prevDiesel: hist?.dieselLitres ?? priorShift.diesel
    }
  })

  return result.reverse()
}

export async function fetchDashboardAverageDeposit() {
  const todayStr = businessTodayYmd()
  const today = ymdToUtcNoonDate(todayStr)
  const year = Number(todayStr.slice(0, 4))
  const month = Number(todayStr.slice(5, 7))
  const firstStr = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const lastOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`
  const mtdEndCap = todayStr < lastOfMonthStr ? todayStr : lastOfMonthStr

  const lastShiftAgg = await prisma.shiftClose.aggregate({
    where: { date: { gte: firstStr, lte: mtdEndCap } },
    _max: { date: true }
  })

  const lastShiftDate = lastShiftAgg._max.date
  if (!lastShiftDate) {
    return {
      avgDepositMTD: 0,
      totalDepositsMTD: 0,
      daysElapsed: 0,
      lastShiftDate: null,
      periodLabel: 'No shift closes recorded this month yet.',
      sameDayLastMonth: null,
      sameDayLastYear: null
    }
  }

  const mtdShifts = await prisma.shiftClose.findMany({
    where: { date: { gte: firstStr, lte: lastShiftDate } }
  })

  const totalDepositsMTD = sumDepositsFromShifts(mtdShifts)
  const anchorDay = Number(lastShiftDate.slice(8, 10))
  const daysElapsed = anchorDay
  const avgDepositMTD = daysElapsed > 0 ? totalDepositsMTD / daysElapsed : 0

  const sameDayLastMonth = new Date(Date.UTC(year, month - 2, anchorDay, 12, 0, 0, 0))
  const sameDayLastMonthStr = toYmdInBusinessTz(sameDayLastMonth)
  const sameDayLastYear = new Date(Date.UTC(year - 1, month - 1, anchorDay, 12, 0, 0, 0))
  const sameDayLastYearStr = toYmdInBusinessTz(sameDayLastYear)

  const [lastMonthShifts, lastYearShifts] = await Promise.all([
    prisma.shiftClose.findMany({ where: { date: sameDayLastMonthStr } }),
    prisma.shiftClose.findMany({ where: { date: sameDayLastYearStr } })
  ])

  const sameDayLastMonthTotal =
    lastMonthShifts.length > 0 ? sumDepositsFromShifts(lastMonthShifts) : null
  const sameDayLastYearTotal =
    lastYearShifts.length > 0 ? sumDepositsFromShifts(lastYearShifts) : null

  return {
    avgDepositMTD,
    totalDepositsMTD,
    daysElapsed,
    lastShiftDate,
    periodLabel: `Through ${lastShiftDate} (last shift close). Average = MTD total ÷ ${daysElapsed} (day of month).`,
    sameDayLastMonth:
      sameDayLastMonthTotal != null
        ? { date: sameDayLastMonthStr, total: sameDayLastMonthTotal }
        : null,
    sameDayLastYear:
      sameDayLastYearTotal != null ? { date: sameDayLastYearStr, total: sameDayLastYearTotal } : null
  }
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export async function fetchDashboardFuelMtdSold(year: number, month: number) {
  const now = new Date()
  const todayStr = businessTodayYmd(now)
  const firstStr = `${year}-${String(month).padStart(2, '0')}-01`
  const lastOfMonth = new Date(year, month, 0)
  const lastStr = `${year}-${String(month).padStart(2, '0')}-${String(lastOfMonth.getDate()).padStart(2, '0')}`

  if (firstStr > todayStr) {
    return {
      year,
      month,
      monthName: MONTH_NAMES[month - 1],
      isFutureMonth: true,
      daysInAverage: 0,
      totalUnleaded: 0,
      totalDiesel: 0,
      avgUnleadedPerDay: 0,
      avgDieselPerDay: 0,
      periodLabel: 'Future month'
    }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const endStr = isCurrentMonth ? todayStr : lastStr
  const divisorDays = isCurrentMonth ? now.getDate() : lastOfMonth.getDate()

  const shifts = await prisma.shiftClose.findMany({
    where: { date: { gte: firstStr, lte: endStr } },
    select: { unleaded: true, diesel: true }
  })

  let totalUnleaded = 0
  let totalDiesel = 0
  for (const s of shifts) {
    totalUnleaded += Number(s.unleaded) || 0
    totalDiesel += Number(s.diesel) || 0
  }

  return {
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    isFutureMonth: false,
    isCurrentMonth,
    daysInAverage: divisorDays,
    totalUnleaded,
    totalDiesel,
    avgUnleadedPerDay: divisorDays > 0 ? totalUnleaded / divisorDays : 0,
    avgDieselPerDay: divisorDays > 0 ? totalDiesel / divisorDays : 0,
    periodLabel: isCurrentMonth
      ? `Month-to-date (avg per calendar day through day ${divisorDays})`
      : `Full month (${divisorDays} days)`
  }
}

export async function fetchRecentFuelPayment() {
  const recentBatch = await prisma.paymentBatch.findFirst({
    orderBy: { paymentDate: 'desc' },
    include: { invoices: { orderBy: { invoiceDate: 'desc' } } }
  })
  if (!recentBatch) return null

  const balance = await prisma.balance.findUnique({ where: { id: 'balance' } })
  return {
    datePaid: formatInvoiceDate(recentBatch.paymentDate),
    referenceNumber: recentBatch.bankRef,
    totalPaid: formatAmount(recentBatch.totalAmount),
    availableBalance: balance ? formatAmount(balance.availableFunds) : '-',
    invoices: recentBatch.invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      amount: formatAmount(inv.amount)
    }))
  }
}

export async function fetchFuelMonthlyGrandTotal(monthKey: string): Promise<number | null> {
  const monthRegex = /^\d{4}-\d{2}$/
  if (!monthRegex.test(monthKey)) return null
  const [year, monthNum] = monthKey.split('-').map(Number)
  const startDate = new Date(year, monthNum - 1, 1)
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999)

  const batches = await prisma.paymentBatch.findMany({
    where: { paymentDate: { gte: startDate, lte: endDate } },
    include: { invoices: { orderBy: { invoiceNumber: 'asc' } } }
  })

  return groupBatchesForMonth(batches, monthKey).grandTotal
}

export async function fetchCustomerArSummaryFirst(year: number, month: number) {
  const summaries = await prisma.customerArSummary.findMany({
    where: { year, month },
    orderBy: { year: 'desc' }
  })
  return summaries[0] ?? null
}

export async function fetchCashbookSummary(startDate: string, endDate: string) {
  const entries = await prisma.cashbookEntry.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    include: { allocations: { include: { category: true } } },
    orderBy: [{ date: 'asc' }]
  })

  let totalIncome = 0
  let totalExpense = 0
  for (const entry of entries) {
    for (const alloc of entry.allocations) {
      const type = alloc.category.type || 'expense'
      if (type === 'income') totalIncome += alloc.amount
      else if (type === 'expense') totalExpense += alloc.amount
    }
  }

  return {
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
    entryCount: entries.length
  }
}

export async function buildDashboardBootstrap(role: string, year: number, month: number) {
  const norm = normalizeAppRole(role)
  const stakeholder = norm === 'stakeholder'
  const supervisorLike = isSupervisorLike(role)
  const skipFinancial = stakeholder || supervisorLike
  const skipFuelCharts = supervisorLike

  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const startDate = monthKey + '-01'
  const lastDay = new Date(year, month, 0)
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

  const [
    summary,
    upcoming,
    recentPayment,
    todayRoster,
    fuelComparison,
    averageDeposit,
    arSummary,
    cashbookSummary,
    fuelMtdSold
  ] = await Promise.all([
    fetchDashboardMonthSummary({ year, month }),
    fetchDashboardUpcoming(),
    fetchRecentFuelPayment(),
    fetchDashboardToday(),
    skipFuelCharts ? Promise.resolve([]) : fetchDashboardFuelComparison(),
    skipFuelCharts ? Promise.resolve(null) : fetchDashboardAverageDeposit(),
    skipFinancial ? Promise.resolve(null) : fetchCustomerArSummaryFirst(year, month),
    skipFinancial ? Promise.resolve(null) : fetchCashbookSummary(startDate, endDate),
    fetchDashboardFuelMtdSold(year, month)
  ])

  let fuelExpense: number | null = null
  if (!skipFinancial) {
    try {
      fuelExpense = await fetchFuelMonthlyGrandTotal(monthKey)
    } catch {
      fuelExpense = null
    }
  }

  return {
    summary,
    fuelExpense,
    upcoming,
    recentPayment,
    todayRoster,
    fuelComparison,
    averageDeposit,
    arSummary,
    cashbookSummary,
    fuelMtdSold
  }
}
