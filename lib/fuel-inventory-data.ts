import { addCalendarDaysYmd, businessTodayYmd } from '@/lib/datetime-policy'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'
import {
  computeBook,
  computeFuelExpectancy,
  type FuelDeliveryRow,
  type FuelDipRow,
  type FuelExpectancyComputed,
  type FuelOpeningRow,
  type FuelSaleRow
} from '@/lib/fuel-inventory'
import { prisma } from '@/lib/prisma'
import { loadCstoreTankCheck, type CstoreTankCheckPayload } from '@/lib/tank-check-data'

const HISTORY_DAYS = 180

export type FuelExpectancyPayload = FuelExpectancyComputed & {
  canManage: boolean
  /** Cstore's stick against the readings saved here, plus a stick waiting to be saved as an opening. */
  cstoreCheck: CstoreTankCheckPayload
  recentReadings: Array<{
    id: string
    date: string
    kind: string
    unleadedLitres: number
    dieselLitres: number
    unleadedDelta: number
    dieselDelta: number
    notes: string
    createdBy: string
    createdAt: string
  }>
}

function toIso(d: Date): string {
  return d.toISOString()
}

export async function loadFuelExpectancy(options: {
  asOfYmd?: string
  canManage: boolean
}): Promise<FuelExpectancyPayload> {
  const asOfYmd = options.asOfYmd ?? businessTodayYmd()
  const historyStart = addCalendarDaysYmd(asOfYmd, -HISTORY_DAYS)

  const [readings, invoices, sales] = await Promise.all([
    prisma.fuelTankReading.findMany({
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.invoice.findMany({
      where: {
        type: 'Fuel',
        OR: [{ unleadedLitres: { not: null } }, { dieselLitres: { not: null } }]
      },
      select: {
        invoiceDate: true,
        unleadedLitres: true,
        dieselLitres: true
      }
    }),
    prisma.shiftClose.findMany({
      where: { date: { gte: historyStart, lte: asOfYmd } },
      select: { date: true, shift: true, unleaded: true, diesel: true }
    })
  ])

  const openings: FuelOpeningRow[] = readings
    .filter((row) => row.kind === 'opening')
    .map((row) => ({
      id: row.id,
      date: row.date,
      createdAt: toIso(row.createdAt),
      unleadedLitres: row.unleadedLitres,
      dieselLitres: row.dieselLitres,
      notes: row.notes,
      createdBy: row.createdBy
    }))

  const dips: FuelDipRow[] = readings
    .filter((row) => row.kind === 'dip')
    .map((row) => ({
      id: row.id,
      date: row.date,
      createdAt: toIso(row.createdAt),
      unleadedLitres: row.unleadedLitres,
      dieselLitres: row.dieselLitres,
      unleadedDelta: row.unleadedDelta,
      dieselDelta: row.dieselDelta,
      notes: row.notes,
      createdBy: row.createdBy
    }))

  const deliveries: FuelDeliveryRow[] = invoices.map((row) => ({
    date: invoiceDateToInputValue(row.invoiceDate),
    unleadedLitres: row.unleadedLitres,
    dieselLitres: row.dieselLitres
  }))

  const saleRows: FuelSaleRow[] = sales.map((row) => ({
    date: row.date,
    shift: row.shift,
    unleaded: row.unleaded || 0,
    diesel: row.diesel || 0
  }))

  const computed = computeFuelExpectancy(
    { openings, dips, deliveries, sales: saleRows },
    asOfYmd
  )

  let cstoreCheck: CstoreTankCheckPayload = { days: [], suggestion: null }
  try {
    const bookInputs = { openings, dips, deliveries, sales: saleRows }
    cstoreCheck = await loadCstoreTankCheck(
      asOfYmd,
      openings.map((o) => ({
        date: o.date,
        createdAt: o.createdAt,
        unleadedLitres: o.unleadedLitres,
        dieselLitres: o.dieselLitres
      })),
      (ymd) => computeBook(bookInputs, ymd)?.onHand ?? null
    )
  } catch (error) {
    console.error('Cstore tank check unavailable:', error)
  }

  const recentReadings = [...readings]
    .sort((a, b) => {
      if (a.createdAt.getTime() !== b.createdAt.getTime()) {
        return b.createdAt.getTime() - a.createdAt.getTime()
      }
      return a.id < b.id ? 1 : -1
    })
    .slice(0, 12)
    .map((row) => ({
      id: row.id,
      date: row.date,
      kind: row.kind,
      unleadedLitres: row.unleadedLitres,
      dieselLitres: row.dieselLitres,
      unleadedDelta: row.unleadedDelta,
      dieselDelta: row.dieselDelta,
      notes: row.notes,
      createdBy: row.createdBy,
      createdAt: toIso(row.createdAt)
    }))

  return {
    ...computed,
    canManage: options.canManage,
    cstoreCheck,
    recentReadings
  }
}

export type FuelExpectancyGlance = {
  asOfDate: string
  weekdayName: string
  hasOpening: boolean
  unleadedOnHand: number
  dieselOnHand: number
  unleadedUsable: number
  dieselUsable: number
  todayEnoughTypical: { unleaded: boolean; diesel: boolean }
  todayShortByTypical: { unleaded: number; diesel: number }
  daysOfCoverTypical: { unleaded: number; diesel: number }
}

export function toFuelExpectancyGlance(payload: FuelExpectancyPayload): FuelExpectancyGlance {
  const rest = payload.horizons.find((h) => h.id === 'restOfToday')
  return {
    asOfDate: payload.asOfDate,
    weekdayName: payload.weekdayName,
    hasOpening: payload.book != null,
    unleadedOnHand: payload.book?.onHand.unleaded ?? 0,
    dieselOnHand: payload.book?.onHand.diesel ?? 0,
    unleadedUsable: payload.book?.usable.unleaded ?? 0,
    dieselUsable: payload.book?.usable.diesel ?? 0,
    todayEnoughTypical: {
      unleaded: rest?.typical.unleaded.enough ?? false,
      diesel: rest?.typical.diesel.enough ?? false
    },
    todayShortByTypical: {
      unleaded: rest?.typical.unleaded.shortBy ?? 0,
      diesel: rest?.typical.diesel.shortBy ?? 0
    },
    daysOfCoverTypical: {
      unleaded: payload.daysOfCoverTypical.unleaded.days,
      diesel: payload.daysOfCoverTypical.diesel.days
    }
  }
}
