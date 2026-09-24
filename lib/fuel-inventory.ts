import { addCalendarDaysYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'

/** Tanks read empty at these remaining litres. Shown on screen; subtracted for all forecasts. */
export const UNLEADED_UNUSABLE_LITRES = 2000
export const DIESEL_UNUSABLE_LITRES = 1500

export const WEEKDAY_SAMPLE_SIZE = 12
export const BUSY_PERCENTILE = 0.75
export const COVER_HORIZON_DAYS = 21

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const

export type FuelGrade = 'unleaded' | 'diesel'

export type FuelPair = {
  unleaded: number
  diesel: number
}

export type FuelTankReadingKind = 'opening' | 'dip'

export type FuelOpeningRow = {
  id: string
  date: string
  createdAt: string
  unleadedLitres: number
  dieselLitres: number
  notes: string
  createdBy: string
}

export type FuelDipRow = {
  id: string
  date: string
  createdAt: string
  unleadedLitres: number
  dieselLitres: number
  unleadedDelta: number
  dieselDelta: number
  notes: string
  createdBy: string
}

export type FuelDeliveryRow = {
  date: string
  unleadedLitres: number | null
  dieselLitres: number | null
}

export type FuelSaleRow = {
  date: string
  shift: string
  unleaded: number
  diesel: number
}

export type FuelInventoryInputs = {
  openings: FuelOpeningRow[]
  dips: FuelDipRow[]
  deliveries: FuelDeliveryRow[]
  sales: FuelSaleRow[]
}

export type FuelBook = {
  opening: FuelOpeningRow
  onHand: FuelPair
  usable: FuelPair
  delivered: FuelPair
  sold: FuelPair
  dipAdjust: FuelPair
}

export type WeekdayAverages = {
  weekday: number
  weekdayName: string
  samples: number
  typical: FuelPair
  busy: FuelPair
}

export type GradeHorizonResult = {
  demand: number
  projectedOnHand: number
  projectedUsable: number
  enough: boolean
  shortBy: number
}

export type HorizonPair = {
  unleaded: GradeHorizonResult
  diesel: GradeHorizonResult
}

export type FuelHorizon = {
  id: 'restOfToday' | 'tomorrow' | 'throughWeekend'
  label: string
  throughDate: string
  typicalDemand: FuelPair
  busyDemand: FuelPair
  typical: HorizonPair
  busy: HorizonPair
}

export type DaysOfCover = {
  days: number
  runsOutOn: string | null
}

export type FuelExpectancyComputed = {
  asOfDate: string
  weekday: number
  weekdayName: string
  book: FuelBook | null
  soldToday: FuelPair
  remainingTodayTypical: FuelPair
  remainingTodayBusy: FuelPair
  weekdayAverages: WeekdayAverages[]
  todayAverage: WeekdayAverages | null
  horizons: FuelHorizon[]
  daysOfCoverTypical: { unleaded: DaysOfCover; diesel: DaysOfCover }
  daysOfCoverBusy: { unleaded: DaysOfCover; diesel: DaysOfCover }
}

export function reserveLitres(grade: FuelGrade): number {
  return grade === 'unleaded' ? UNLEADED_UNUSABLE_LITRES : DIESEL_UNUSABLE_LITRES
}

export function usableLitres(onHand: number, grade: FuelGrade): number {
  return Math.max(0, roundLitres(onHand) - reserveLitres(grade))
}

export function roundLitres(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10) / 10
}

export function weekdayIndexFromYmd(ymd: string): number {
  return ymdToUtcNoonDate(ymd).getUTCDay()
}

export function weekendEndYmd(todayYmd: string): string {
  const dow = weekdayIndexFromYmd(todayYmd)
  if (dow === 0) return todayYmd
  return addCalendarDaysYmd(todayYmd, 7 - dow)
}

export type LitresParseResult = { ok: true; value: number | null } | { ok: false }

export function tryParseOptionalLitres(value: unknown): LitresParseResult {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n) || n < 0) return { ok: false }
  return { ok: true, value: n }
}

/** Fill blank Fuel invoice litres from harvest; never overwrite a value already stored (including 0). */
export function harvestFuelVolumePatch(
  existing: { unleadedLitres: number | null; dieselLitres: number | null },
  incoming: { unleadedLitres: number | null; dieselLitres: number | null }
): { unleadedLitres?: number | null; dieselLitres?: number | null } | null {
  const patch: { unleadedLitres?: number | null; dieselLitres?: number | null } = {}
  if (existing.unleadedLitres == null && incoming.unleadedLitres != null) {
    patch.unleadedLitres = incoming.unleadedLitres
  }
  if (existing.dieselLitres == null && incoming.dieselLitres != null) {
    patch.dieselLitres = incoming.dieselLitres
  }
  return Object.keys(patch).length ? patch : null
}

export function parseRequiredLitres(value: unknown): number {
  const parsed = tryParseOptionalLitres(value)
  if (!parsed.ok || parsed.value == null) {
    throw new Error('invalid')
  }
  return parsed.value
}

/** A dip corrects the opening it was taken against. A newer opening on that date replaces it. */
function dipAppliesToOpening(row: FuelDipRow, opening: FuelOpeningRow, asOfYmd: string): boolean {
  if (row.date < opening.date || row.date > asOfYmd) return false
  if (row.date > opening.date) return true
  return row.createdAt > opening.createdAt
}

/**
 * Opening is the start of `date`. Sales or deliveries already stored on that date would be
 * applied on top of the stick. Returns the next morning when that would double-count a
 * reading taken after those movements (last night's close entered on the sales date).
 */
export function openingBaselineConflict(
  date: string,
  activity: { sold: FuelPair; delivered: FuelPair }
): {
  date: string
  nextDate: string
  sold: FuelPair
  delivered: FuelPair
} | null {
  const sold = {
    unleaded: roundLitres(activity.sold.unleaded),
    diesel: roundLitres(activity.sold.diesel)
  }
  const delivered = {
    unleaded: roundLitres(activity.delivered.unleaded),
    diesel: roundLitres(activity.delivered.diesel)
  }
  const hasMovement =
    sold.unleaded > 0 || sold.diesel > 0 || delivered.unleaded > 0 || delivered.diesel > 0
  if (!hasMovement) return null
  return {
    date,
    nextDate: addCalendarDaysYmd(date, 1),
    sold,
    delivered
  }
}

function latestOpeningOnOrBefore(openings: FuelOpeningRow[], asOfYmd: string): FuelOpeningRow | null {
  const eligible = openings.filter((row) => row.date <= asOfYmd)
  if (eligible.length === 0) return null
  eligible.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
    return a.id < b.id ? 1 : -1
  })
  return eligible[0]
}

function addPair(a: FuelPair, b: FuelPair): FuelPair {
  return {
    unleaded: roundLitres(a.unleaded + b.unleaded),
    diesel: roundLitres(a.diesel + b.diesel)
  }
}

function subPair(a: FuelPair, b: FuelPair): FuelPair {
  return {
    unleaded: roundLitres(a.unleaded - b.unleaded),
    diesel: roundLitres(a.diesel - b.diesel)
  }
}

function clampPair(pair: FuelPair): FuelPair {
  return {
    unleaded: Math.max(0, pair.unleaded),
    diesel: Math.max(0, pair.diesel)
  }
}

function usablePair(onHand: FuelPair): FuelPair {
  return {
    unleaded: usableLitres(onHand.unleaded, 'unleaded'),
    diesel: usableLitres(onHand.diesel, 'diesel')
  }
}

export function computeBook(inputs: FuelInventoryInputs, asOfYmd: string): FuelBook | null {
  const opening = latestOpeningOnOrBefore(inputs.openings, asOfYmd)
  if (!opening) return null

  let delivered: FuelPair = { unleaded: 0, diesel: 0 }
  for (const row of inputs.deliveries) {
    if (row.date < opening.date || row.date > asOfYmd) continue
    if (row.unleadedLitres != null) delivered.unleaded += row.unleadedLitres
    if (row.dieselLitres != null) delivered.diesel += row.dieselLitres
  }

  let sold: FuelPair = { unleaded: 0, diesel: 0 }
  for (const row of inputs.sales) {
    if (row.date < opening.date || row.date > asOfYmd) continue
    sold.unleaded += row.unleaded || 0
    sold.diesel += row.diesel || 0
  }

  let dipAdjust: FuelPair = { unleaded: 0, diesel: 0 }
  for (const row of inputs.dips) {
    if (!dipAppliesToOpening(row, opening, asOfYmd)) continue
    dipAdjust.unleaded += row.unleadedDelta || 0
    dipAdjust.diesel += row.dieselDelta || 0
  }

  delivered = {
    unleaded: roundLitres(delivered.unleaded),
    diesel: roundLitres(delivered.diesel)
  }
  sold = { unleaded: roundLitres(sold.unleaded), diesel: roundLitres(sold.diesel) }
  dipAdjust = { unleaded: roundLitres(dipAdjust.unleaded), diesel: roundLitres(dipAdjust.diesel) }

  const onHand: FuelPair = {
    unleaded: roundLitres(opening.unleadedLitres + delivered.unleaded - sold.unleaded + dipAdjust.unleaded),
    diesel: roundLitres(opening.dieselLitres + delivered.diesel - sold.diesel + dipAdjust.diesel)
  }

  return {
    opening,
    onHand,
    usable: usablePair(onHand),
    delivered,
    sold,
    dipAdjust
  }
}

export function dailySalesTotals(sales: FuelSaleRow[]): Array<{ date: string } & FuelPair> {
  const byDate = new Map<string, FuelPair>()
  for (const row of sales) {
    const current = byDate.get(row.date) ?? { unleaded: 0, diesel: 0 }
    current.unleaded += row.unleaded || 0
    current.diesel += row.diesel || 0
    byDate.set(row.date, current)
  }
  return [...byDate.entries()]
    .map(([date, pair]) => ({
      date,
      unleaded: roundLitres(pair.unleaded),
      diesel: roundLitres(pair.diesel)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * (sortedAsc.length - 1))))
  return sortedAsc[idx]
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

export function lastWeekdaySamples(
  daily: Array<{ date: string } & FuelPair>,
  weekday: number,
  beforeYmd: string,
  n = WEEKDAY_SAMPLE_SIZE
): Array<{ date: string } & FuelPair> {
  const matches = daily.filter((row) => {
    if (row.date >= beforeYmd) return false
    if (weekdayIndexFromYmd(row.date) !== weekday) return false
    return row.unleaded + row.diesel > 0
  })
  return matches.slice(-n)
}

export function buildWeekdayAverages(
  daily: Array<{ date: string } & FuelPair>,
  beforeYmd: string
): WeekdayAverages[] {
  return WEEKDAY_NAMES.map((weekdayName, weekday) => {
    const samples = lastWeekdaySamples(daily, weekday, beforeYmd)
    const unleaded = samples.map((s) => s.unleaded)
    const diesel = samples.map((s) => s.diesel)
    const typical: FuelPair = {
      unleaded: roundLitres(mean(unleaded)),
      diesel: roundLitres(mean(diesel))
    }
    const busy: FuelPair = {
      unleaded: roundLitres(percentile([...unleaded].sort((a, b) => a - b), BUSY_PERCENTILE)),
      diesel: roundLitres(percentile([...diesel].sort((a, b) => a - b), BUSY_PERCENTILE))
    }
    return {
      weekday,
      weekdayName,
      samples: samples.length,
      typical,
      busy
    }
  })
}

function remainingToday(typicalOrBusy: FuelPair, soldToday: FuelPair): FuelPair {
  return clampPair(subPair(typicalOrBusy, soldToday))
}

function gradeHorizon(onHand: number, demand: number, grade: FuelGrade): GradeHorizonResult {
  const projectedOnHand = roundLitres(onHand - demand)
  const projectedUsable = usableLitres(projectedOnHand, grade)
  const usableNow = usableLitres(onHand, grade)
  const enough = usableNow >= demand - 1e-9
  return {
    demand: roundLitres(demand),
    projectedOnHand,
    projectedUsable,
    enough,
    shortBy: enough ? 0 : roundLitres(demand - usableNow)
  }
}

function horizonPair(onHand: FuelPair, demand: FuelPair): HorizonPair {
  return {
    unleaded: gradeHorizon(onHand.unleaded, demand.unleaded, 'unleaded'),
    diesel: gradeHorizon(onHand.diesel, demand.diesel, 'diesel')
  }
}

function demandBetween(
  startYmd: string,
  endYmd: string,
  remainingFirstDay: FuelPair,
  averages: WeekdayAverages[],
  mode: 'typical' | 'busy'
): FuelPair {
  let demand: FuelPair = { unleaded: 0, diesel: 0 }
  let cursor = startYmd
  let first = true
  while (cursor <= endYmd) {
    if (first) {
      demand = addPair(demand, remainingFirstDay)
      first = false
    } else {
      const avg = averages[weekdayIndexFromYmd(cursor)]
      demand = addPair(demand, avg?.[mode] ?? { unleaded: 0, diesel: 0 })
    }
    cursor = addCalendarDaysYmd(cursor, 1)
  }
  return demand
}

function projectCover(
  usableNow: number,
  startYmd: string,
  remainingFirstDay: number,
  dailyForDate: (ymd: string) => number
): DaysOfCover {
  if (usableNow <= 0) {
    return { days: 0, runsOutOn: startYmd }
  }
  let remaining = usableNow
  let cursor = startYmd
  let days = 0
  for (let i = 0; i < COVER_HORIZON_DAYS; i++) {
    const demand = i === 0 ? remainingFirstDay : dailyForDate(cursor)
    if (demand <= 0) {
      days += 1
      cursor = addCalendarDaysYmd(cursor, 1)
      continue
    }
    if (remaining >= demand) {
      remaining -= demand
      days += 1
      cursor = addCalendarDaysYmd(cursor, 1)
      continue
    }
    days += remaining / demand
    return {
      days: roundLitres(days),
      runsOutOn: cursor
    }
  }
  return { days: roundLitres(days), runsOutOn: null }
}

export function computeFuelExpectancy(
  inputs: FuelInventoryInputs,
  asOfYmd: string
): FuelExpectancyComputed {
  const weekday = weekdayIndexFromYmd(asOfYmd)
  const book = computeBook(inputs, asOfYmd)
  const daily = dailySalesTotals(inputs.sales)
  const weekdayAverages = buildWeekdayAverages(daily, asOfYmd)
  const todayAverage = weekdayAverages[weekday] ?? null

  const soldToday = daily.find((row) => row.date === asOfYmd) ?? { unleaded: 0, diesel: 0 }
  const remainingTodayTypical = remainingToday(todayAverage?.typical ?? { unleaded: 0, diesel: 0 }, soldToday)
  const remainingTodayBusy = remainingToday(todayAverage?.busy ?? { unleaded: 0, diesel: 0 }, soldToday)

  const emptyHorizonPair: HorizonPair = {
    unleaded: gradeHorizon(0, 0, 'unleaded'),
    diesel: gradeHorizon(0, 0, 'diesel')
  }

  const makeHorizon = (
    id: FuelHorizon['id'],
    label: string,
    throughDate: string,
    typicalDemand: FuelPair,
    busyDemand: FuelPair
  ): FuelHorizon => {
    const onHand = book?.onHand ?? { unleaded: 0, diesel: 0 }
    return {
      id,
      label,
      throughDate,
      typicalDemand,
      busyDemand,
      typical: book ? horizonPair(onHand, typicalDemand) : emptyHorizonPair,
      busy: book ? horizonPair(onHand, busyDemand) : emptyHorizonPair
    }
  }

  const tomorrowYmd = addCalendarDaysYmd(asOfYmd, 1)
  const weekendYmd = weekendEndYmd(asOfYmd)
  const tomorrowAvg = weekdayAverages[weekdayIndexFromYmd(tomorrowYmd)]

  const tomorrowTypicalDemand = addPair(
    remainingTodayTypical,
    tomorrowAvg?.typical ?? { unleaded: 0, diesel: 0 }
  )
  const tomorrowBusyDemand = addPair(remainingTodayBusy, tomorrowAvg?.busy ?? { unleaded: 0, diesel: 0 })

  const weekendTypicalDemand = demandBetween(
    asOfYmd,
    weekendYmd,
    remainingTodayTypical,
    weekdayAverages,
    'typical'
  )
  const weekendBusyDemand = demandBetween(asOfYmd, weekendYmd, remainingTodayBusy, weekdayAverages, 'busy')

  const horizons: FuelHorizon[] = [
    makeHorizon(
      'restOfToday',
      `Rest of ${WEEKDAY_NAMES[weekday]}`,
      asOfYmd,
      remainingTodayTypical,
      remainingTodayBusy
    ),
    makeHorizon('tomorrow', `Through tomorrow (${WEEKDAY_NAMES[weekdayIndexFromYmd(tomorrowYmd)]})`, tomorrowYmd, tomorrowTypicalDemand, tomorrowBusyDemand),
    makeHorizon(
      'throughWeekend',
      weekendYmd === asOfYmd ? 'Through today (Sunday)' : `Through Sunday ${weekendYmd}`,
      weekendYmd,
      weekendTypicalDemand,
      weekendBusyDemand
    )
  ]

  const daysOfCoverTypical = {
    unleaded: projectCover(
      book?.usable.unleaded ?? 0,
      asOfYmd,
      remainingTodayTypical.unleaded,
      (ymd) => weekdayAverages[weekdayIndexFromYmd(ymd)]?.typical.unleaded ?? 0
    ),
    diesel: projectCover(
      book?.usable.diesel ?? 0,
      asOfYmd,
      remainingTodayTypical.diesel,
      (ymd) => weekdayAverages[weekdayIndexFromYmd(ymd)]?.typical.diesel ?? 0
    )
  }
  const daysOfCoverBusy = {
    unleaded: projectCover(
      book?.usable.unleaded ?? 0,
      asOfYmd,
      remainingTodayBusy.unleaded,
      (ymd) => weekdayAverages[weekdayIndexFromYmd(ymd)]?.busy.unleaded ?? 0
    ),
    diesel: projectCover(
      book?.usable.diesel ?? 0,
      asOfYmd,
      remainingTodayBusy.diesel,
      (ymd) => weekdayAverages[weekdayIndexFromYmd(ymd)]?.busy.diesel ?? 0
    )
  }

  return {
    asOfDate: asOfYmd,
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday],
    book,
    soldToday,
    remainingTodayTypical,
    remainingTodayBusy,
    weekdayAverages,
    todayAverage,
    horizons,
    daysOfCoverTypical,
    daysOfCoverBusy
  }
}

export function formatLitres(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function dipDeltasFromBook(book: FuelBook, dip: FuelPair): FuelPair {
  return {
    unleaded: roundLitres(dip.unleaded - book.onHand.unleaded),
    diesel: roundLitres(dip.diesel - book.onHand.diesel)
  }
}
