import { prisma } from '@/lib/prisma'
import { litresToGallons } from '@/lib/fuel-constants'
import { businessTodayYmd } from '@/lib/datetime-policy'

export const FUEL_COMPARISON_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const

const EXPECTED_STANDARD_SHIFTS = ['6-1', '1-9']
const EXPECTED_CUSTOM_SHIFT = '7:30 - 2'

export type FuelComparisonTotals = {
  gasLitresCur: number
  gasLitresPrev: number
  dieselLitresCur: number
  dieselLitresPrev: number
  gasGallonsCur: number
  gasGallonsPrev: number
  dieselGallonsCur: number
  dieselGallonsPrev: number
  totalGallonsCur: number
  totalGallonsPrev: number
  variance: number
}

export type FuelComparisonDay = FuelComparisonTotals & {
  date: string
  day: number
  hasMissingShiftData?: boolean
  missingShiftInfo?: string
}

export type FuelComparisonMonth = FuelComparisonTotals & {
  month: number
  monthName: string
  hasMissingShiftData?: boolean
  missingShiftInfo?: string
  isIncomplete: boolean
  isFuture: boolean
}

export type HistoricalFuelRow = {
  date: string
  unleadedLitres?: number | null
  dieselLitres?: number | null
}

export type ShiftFuelRow = {
  date: string
  shift?: string | null
  unleaded: number | null
  diesel: number | null
}

export type FuelVolumeMaps = {
  curHistoricalByDate: Map<string, HistoricalFuelRow>
  prevHistoricalByDate: Map<string, HistoricalFuelRow>
  currentByDate: Map<string, { unleaded: number; diesel: number }>
  currentShiftsByDate: Map<string, Array<{ shift: string; unleaded: number; diesel: number }>>
  prevShiftsByDate: Map<string, { unleaded: number; diesel: number }>
}

const EMPTY_TOTALS: FuelComparisonTotals = {
  gasLitresCur: 0,
  gasLitresPrev: 0,
  dieselLitresCur: 0,
  dieselLitresPrev: 0,
  gasGallonsCur: 0,
  gasGallonsPrev: 0,
  dieselGallonsCur: 0,
  dieselGallonsPrev: 0,
  totalGallonsCur: 0,
  totalGallonsPrev: 0,
  variance: 0
}

export function emptyFuelComparisonTotals(): FuelComparisonTotals {
  return { ...EMPTY_TOTALS }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function buildFuelVolumeMaps(
  curHistorical: HistoricalFuelRow[],
  prevHistorical: HistoricalFuelRow[],
  currentShifts: ShiftFuelRow[],
  prevShifts: ShiftFuelRow[]
): FuelVolumeMaps {
  const currentByDate = new Map<string, { unleaded: number; diesel: number }>()
  const currentShiftsByDate = new Map<string, Array<{ shift: string; unleaded: number; diesel: number }>>()
  currentShifts.forEach(s => {
    const existing = currentByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
    currentByDate.set(s.date, {
      unleaded: existing.unleaded + (s.unleaded || 0),
      diesel: existing.diesel + (s.diesel || 0)
    })
    if (!currentShiftsByDate.has(s.date)) currentShiftsByDate.set(s.date, [])
    currentShiftsByDate.get(s.date)!.push({
      shift: s.shift ?? '',
      unleaded: s.unleaded ?? 0,
      diesel: s.diesel ?? 0
    })
  })

  const prevShiftsByDate = new Map<string, { unleaded: number; diesel: number }>()
  prevShifts.forEach(s => {
    const existing = prevShiftsByDate.get(s.date) ?? { unleaded: 0, diesel: 0 }
    prevShiftsByDate.set(s.date, {
      unleaded: existing.unleaded + (s.unleaded || 0),
      diesel: existing.diesel + (s.diesel || 0)
    })
  })

  return {
    curHistoricalByDate: new Map(curHistorical.map(r => [r.date, r])),
    prevHistoricalByDate: new Map(prevHistorical.map(r => [r.date, r])),
    currentByDate,
    currentShiftsByDate,
    prevShiftsByDate
  }
}

export function totalsFromRows(rows: FuelComparisonTotals[]): FuelComparisonTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      gasLitresCur: acc.gasLitresCur + row.gasLitresCur,
      gasLitresPrev: acc.gasLitresPrev + row.gasLitresPrev,
      dieselLitresCur: acc.dieselLitresCur + row.dieselLitresCur,
      dieselLitresPrev: acc.dieselLitresPrev + row.dieselLitresPrev,
      gasGallonsCur: acc.gasGallonsCur + row.gasGallonsCur,
      gasGallonsPrev: acc.gasGallonsPrev + row.gasGallonsPrev,
      dieselGallonsCur: acc.dieselGallonsCur + row.dieselGallonsCur,
      dieselGallonsPrev: acc.dieselGallonsPrev + row.dieselGallonsPrev,
      totalGallonsCur: acc.totalGallonsCur + row.totalGallonsCur,
      totalGallonsPrev: acc.totalGallonsPrev + row.totalGallonsPrev,
      variance: 0
    }),
    emptyFuelComparisonTotals()
  )
  totals.variance = totals.totalGallonsCur - totals.totalGallonsPrev
  return totals
}

export function buildDaysForMonth(
  year: number,
  month: number,
  maps: FuelVolumeMaps
): FuelComparisonDay[] {
  const prevYear = year - 1
  const count = daysInMonth(year, month)
  const days: FuelComparisonDay[] = []

  for (let day = 1; day <= count; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const prevDate = `${prevYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const curHist = maps.curHistoricalByDate.get(date)
    const curShift = maps.currentByDate.get(date) ?? { unleaded: 0, diesel: 0 }
    const dayShifts = maps.currentShiftsByDate.get(date) ?? []
    const hist = maps.prevHistoricalByDate.get(prevDate)
    const prevShift = maps.prevShiftsByDate.get(prevDate) ?? { unleaded: 0, diesel: 0 }

    const gasLitresCur = curHist?.unleadedLitres ?? curShift.unleaded
    const dieselLitresCur = curHist?.dieselLitres ?? curShift.diesel

    let hasMissingShiftData = false
    let missingShiftInfo = ''
    if (!curHist && dayShifts.length > 0) {
      const hasCustom = dayShifts.some(s => s.shift === EXPECTED_CUSTOM_SHIFT)
      const expectedShifts = hasCustom ? [EXPECTED_CUSTOM_SHIFT] : EXPECTED_STANDARD_SHIFTS
      const missing: string[] = []
      for (const exp of expectedShifts) {
        const found = dayShifts.find(s => s.shift === exp)
        if (!found) {
          missing.push(`${exp} (missing)`)
        } else if (found.unleaded + found.diesel === 0) {
          missing.push(`${exp} (no fuel data)`)
        }
      }
      if (missing.length > 0) {
        hasMissingShiftData = true
        missingShiftInfo = missing.join(', ')
      }
    }

    const gasLitresPrev = hist?.unleadedLitres ?? prevShift.unleaded
    const dieselLitresPrev = hist?.dieselLitres ?? prevShift.diesel

    const gasGallonsCur = litresToGallons(gasLitresCur)
    const gasGallonsPrev = litresToGallons(gasLitresPrev)
    const dieselGallonsCur = litresToGallons(dieselLitresCur)
    const dieselGallonsPrev = litresToGallons(dieselLitresPrev)
    const totalGallonsCur = gasGallonsCur + dieselGallonsCur
    const totalGallonsPrev = gasGallonsPrev + dieselGallonsPrev

    days.push({
      date,
      day,
      gasLitresCur,
      gasLitresPrev,
      dieselLitresCur,
      dieselLitresPrev,
      gasGallonsCur,
      gasGallonsPrev,
      dieselGallonsCur,
      dieselGallonsPrev,
      totalGallonsCur,
      totalGallonsPrev,
      variance: totalGallonsCur - totalGallonsPrev,
      ...(hasMissingShiftData && { hasMissingShiftData: true, missingShiftInfo })
    })
  }

  return days
}

export function buildMonthsForYear(
  year: number,
  maps: FuelVolumeMaps,
  asOf: { year: number; month: number }
): { months: FuelComparisonMonth[]; totals: FuelComparisonTotals } {
  const asOfYear = asOf.year
  const asOfMonth = asOf.month
  const months: FuelComparisonMonth[] = []

  for (let month = 1; month <= 12; month++) {
    const days = buildDaysForMonth(year, month, maps)
    const totals = totalsFromRows(days)
    const isFuture = year > asOfYear || (year === asOfYear && month > asOfMonth)
    const isIncomplete = year === asOfYear && month === asOfMonth
    const missingDays = days.filter(d => d.hasMissingShiftData)
    const hasMissingShiftData = missingDays.length > 0
    const missingShiftInfo = hasMissingShiftData
      ? `${missingDays.length} day${missingDays.length === 1 ? '' : 's'} with incomplete shift data`
      : undefined

    months.push({
      month,
      monthName: FUEL_COMPARISON_MONTHS[month - 1],
      ...totals,
      isIncomplete,
      isFuture,
      ...(hasMissingShiftData && { hasMissingShiftData: true, missingShiftInfo })
    })
  }

  return {
    months,
    totals: totalsFromRows(months.filter(m => !m.isFuture))
  }
}

function shiftSelect() {
  return { date: true, shift: true, unleaded: true, diesel: true } as const
}

export async function getFuelComparisonByDay(year: number, month: number) {
  const prevYear = year - 1
  const count = daysInMonth(year, month)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(count).padStart(2, '0')}`
  const prevStartDate = `${prevYear}-${String(month).padStart(2, '0')}-01`
  const prevEndDate = `${prevYear}-${String(month).padStart(2, '0')}-${String(count).padStart(2, '0')}`

  const [curHistorical, prevHistorical, currentShifts, prevShifts] = await Promise.all([
    prisma.historicalFuelData.findMany({ where: { year, month } }),
    prisma.historicalFuelData.findMany({ where: { year: prevYear, month } }),
    prisma.shiftClose.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: shiftSelect()
    }),
    prisma.shiftClose.findMany({
      where: { date: { gte: prevStartDate, lte: prevEndDate } },
      select: { date: true, unleaded: true, diesel: true }
    })
  ])

  const days = buildDaysForMonth(
    year,
    month,
    buildFuelVolumeMaps(curHistorical, prevHistorical, currentShifts, prevShifts)
  )

  return {
    view: 'day' as const,
    year,
    month,
    prevYear,
    days,
    totals: totalsFromRows(days)
  }
}

function businessAsOf(now = new Date()): { year: number; month: number } {
  const [y, m] = businessTodayYmd(now).split('-').map(Number)
  return { year: y, month: m }
}

export async function getFuelComparisonByMonth(
  year: number,
  asOf: { year: number; month: number } = businessAsOf()
) {
  const prevYear = year - 1

  const [curHistorical, prevHistorical, currentShifts, prevShifts] = await Promise.all([
    prisma.historicalFuelData.findMany({ where: { year } }),
    prisma.historicalFuelData.findMany({ where: { year: prevYear } }),
    prisma.shiftClose.findMany({
      where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
      select: shiftSelect()
    }),
    prisma.shiftClose.findMany({
      where: { date: { gte: `${prevYear}-01-01`, lte: `${prevYear}-12-31` } },
      select: { date: true, unleaded: true, diesel: true }
    })
  ])

  const { months, totals } = buildMonthsForYear(
    year,
    buildFuelVolumeMaps(curHistorical, prevHistorical, currentShifts, prevShifts),
    asOf
  )

  return {
    view: 'month' as const,
    year,
    prevYear,
    months,
    totals
  }
}
