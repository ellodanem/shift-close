import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { businessTodayYmd, isYmd } from '@/lib/datetime-policy'
import {
  computeBook,
  dipDeltasFromBook,
  openingBaselineConflict,
  parseRequiredLitres,
  roundLitres,
  type FuelDeliveryRow,
  type FuelDipRow,
  type FuelOpeningRow,
  type FuelPair,
  type FuelSaleRow
} from '@/lib/fuel-inventory'
import { invoiceDateToInputValue } from '@/lib/invoiceHelpers'

export const dynamic = 'force-dynamic'

async function requireManager(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isFullAccessRole(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

async function inventoryInputsForBook() {
  const [readings, invoices, sales] = await Promise.all([
    prisma.fuelTankReading.findMany({
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.invoice.findMany({
      where: {
        type: 'Fuel',
        OR: [{ unleadedLitres: { not: null } }, { dieselLitres: { not: null } }]
      },
      select: { invoiceDate: true, unleadedLitres: true, dieselLitres: true }
    }),
    prisma.shiftClose.findMany({
      select: { date: true, shift: true, unleaded: true, diesel: true }
    })
  ])

  const openings: FuelOpeningRow[] = readings
    .filter((row) => row.kind === 'opening')
    .map((row) => ({
      id: row.id,
      date: row.date,
      createdAt: row.createdAt.toISOString(),
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
      createdAt: row.createdAt.toISOString(),
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

  return { openings, dips, deliveries, sales: saleRows }
}

/** Litres already booked on this calendar day. An opening is the start of the day, so these move the stick. */
async function activityOnOpeningDate(date: string): Promise<{ sold: FuelPair; delivered: FuelPair }> {
  const [year, month, day] = date.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0))
  const [shifts, invoices] = await Promise.all([
    prisma.shiftClose.findMany({
      where: { date },
      select: { unleaded: true, diesel: true }
    }),
    prisma.invoice.findMany({
      where: {
        type: 'Fuel',
        invoiceDate: { gte: start, lt: end },
        OR: [{ unleadedLitres: { not: null } }, { dieselLitres: { not: null } }]
      },
      select: { unleadedLitres: true, dieselLitres: true }
    })
  ])

  const sold = { unleaded: 0, diesel: 0 }
  for (const row of shifts) {
    sold.unleaded += row.unleaded || 0
    sold.diesel += row.diesel || 0
  }
  const delivered = { unleaded: 0, diesel: 0 }
  for (const row of invoices) {
    if (row.unleadedLitres != null) delivered.unleaded += row.unleadedLitres
    if (row.dieselLitres != null) delivered.diesel += row.dieselLitres
  }
  return {
    sold: { unleaded: roundLitres(sold.unleaded), diesel: roundLitres(sold.diesel) },
    delivered: {
      unleaded: roundLitres(delivered.unleaded),
      diesel: roundLitres(delivered.diesel)
    }
  }
}

/** POST { kind: 'opening' | 'dip', date, unleadedLitres, dieselLitres, notes? } — admin/manager only. */
export async function POST(request: NextRequest) {
  const auth = await requireManager(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const kind = body.kind === 'dip' ? 'dip' : body.kind === 'opening' ? 'opening' : null
    if (!kind) {
      return NextResponse.json({ error: 'kind must be opening or dip' }, { status: 400 })
    }

    const date = String(body.date || businessTodayYmd())
    if (!isYmd(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }

    let unleadedLitres: number
    let dieselLitres: number
    try {
      unleadedLitres = parseRequiredLitres(body.unleadedLitres)
      dieselLitres = parseRequiredLitres(body.dieselLitres)
    } catch {
      return NextResponse.json(
        { error: 'unleadedLitres and dieselLitres are required (litres, 0 or more)' },
        { status: 400 }
      )
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    const createdBy = auth.session.userId

    if (kind === 'opening' && body.confirmSameDay !== true) {
      const conflict = openingBaselineConflict(date, await activityOnOpeningDate(date))
      if (conflict) {
        return NextResponse.json(
          {
            error:
              'This date already has shift sales or fuel deliveries. An opening is the start of the day, so those litres would change this reading. Save it as the next morning if the stick was taken after them.',
            code: 'same_day_activity',
            ...conflict
          },
          { status: 409 }
        )
      }
    }

    let unleadedDelta = 0
    let dieselDelta = 0

    if (kind === 'dip') {
      const book = computeBook(await inventoryInputsForBook(), date)
      if (!book) {
        return NextResponse.json(
          { error: 'Set an opening tank reading before matching a dip' },
          { status: 400 }
        )
      }
      const delta = dipDeltasFromBook(book, { unleaded: unleadedLitres, diesel: dieselLitres })
      unleadedDelta = delta.unleaded
      dieselDelta = delta.diesel
    }

    const reading = await prisma.fuelTankReading.create({
      data: {
        date,
        kind,
        unleadedLitres,
        dieselLitres,
        unleadedDelta,
        dieselDelta,
        notes,
        createdBy
      }
    })

    return NextResponse.json(reading, { status: 201 })
  } catch (error) {
    console.error('fuel-inventory readings POST', error)
    return NextResponse.json({ error: 'Failed to save tank reading' }, { status: 500 })
  }
}
