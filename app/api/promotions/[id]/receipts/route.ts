import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  buildDriverProfiles,
  isValidReceiptDate,
  parseReceiptAmount,
  resolveEntrant
} from '@/lib/promotion-receipts'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

const receiptSelect = {
  id: true,
  receiptDate: true,
  entrantName: true,
  staffId: true,
  amount: true,
  busRegistration: true,
  phone: true,
  createdAt: true,
  staff: { select: { id: true, name: true } }
} as const

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      select: { id: true }
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const limitParam = request.nextUrl.searchParams.get('limit')
    const showAll = request.nextUrl.searchParams.get('all') === '1'
    const limit = showAll
      ? 5000
      : limitParam && /^\d+$/.test(limitParam)
        ? Math.min(Number(limitParam), 200)
        : 25
    const dateFilter = request.nextUrl.searchParams.get('date')?.trim() || ''
    const monthFilter = request.nextUrl.searchParams.get('month')?.trim() || ''

    const dateWhere: Record<string, string> = {}
    if (dateFilter && isValidReceiptDate(dateFilter)) {
      dateWhere.equals = dateFilter
    } else if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
      dateWhere.gte = `${monthFilter}-01`
      dateWhere.lte = `${monthFilter}-31`
    }

    const receipts = await prisma.promotionReceipt.findMany({
      where: {
        promotionId: params.id,
        ...(Object.keys(dateWhere).length > 0 ? { receiptDate: dateWhere } : {})
      },
      orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: receiptSelect
    })

    return NextResponse.json(
      receipts.map((r) => ({
        id: r.id,
        receiptDate: r.receiptDate,
        entrantName: r.staff?.name || r.entrantName,
        staffId: r.staffId,
        amount: r.amount,
        busRegistration: r.busRegistration,
        phone: r.phone,
        createdAt: r.createdAt.toISOString()
      }))
    )
  } catch (error) {
    console.error('Error listing promotion receipts:', error)
    return NextResponse.json({ error: 'Failed to load receipts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      select: { id: true }
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const body = await request.json()
    const receiptDate =
      typeof body.receiptDate === 'string' ? body.receiptDate.trim() : ''
    if (!isValidReceiptDate(receiptDate)) {
      return NextResponse.json({ error: 'Valid receipt date is required (YYYY-MM-DD)' }, { status: 400 })
    }

    const amount = parseReceiptAmount(body.amount)
    if (amount == null) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 })
    }

    const entrant = await resolveEntrant({
      staffId: body.staffId,
      entrantName: body.entrantName
    })
    if ('error' in entrant) {
      return NextResponse.json({ error: entrant.error }, { status: 400 })
    }

    const busRegistration =
      typeof body.busRegistration === 'string' ? body.busRegistration.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''

    const receipt = await prisma.promotionReceipt.create({
      data: {
        promotionId: params.id,
        receiptDate,
        entrantName: entrant.entrantName,
        staffId: entrant.staffId,
        amount,
        busRegistration,
        phone
      },
      select: receiptSelect
    })

    const tallyCount = await prisma.promotionReceipt.count({
      where: {
        promotionId: params.id,
        ...(entrant.staffId
          ? { staffId: entrant.staffId }
          : { entrantName: entrant.entrantName })
      }
    })

    return NextResponse.json(
      {
        id: receipt.id,
        receiptDate: receipt.receiptDate,
        entrantName: receipt.staff?.name || receipt.entrantName,
        staffId: receipt.staffId,
        amount: receipt.amount,
        busRegistration: receipt.busRegistration,
        phone: receipt.phone,
        createdAt: receipt.createdAt.toISOString(),
        driverReceiptCount: tallyCount
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating promotion receipt:', error)
    return NextResponse.json({ error: 'Failed to save receipt' }, { status: 500 })
  }
}
