import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { isFullAccessRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { businessTodayYmd, isYmd } from '@/lib/datetime-policy'
import {
  computeBook,
  dipDeltasFromBook,
  parseRequiredLitres,
  type FuelDeliveryRow,
  type FuelDipRow,
  type FuelOpeningRow,
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
