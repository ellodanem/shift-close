import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildFuelTally, filterTallyRows, isValidReceiptDate } from '@/lib/promotion-receipts'
import { roundMoney } from '@/lib/fuelPayments'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const promotion = await prisma.promotion.findUnique({
      where: { id: params.id },
      select: { id: true, name: true }
    })
    if (!promotion) {
      return NextResponse.json({ error: 'Promotion not found' }, { status: 404 })
    }

    const yearParam = request.nextUrl.searchParams.get('year')
    const year =
      yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear())
    const search = request.nextUrl.searchParams.get('search') ?? ''
    const fromDate = request.nextUrl.searchParams.get('from')?.trim() || ''
    const toDate = request.nextUrl.searchParams.get('to')?.trim() || ''

    const dateWhere: { gte?: string; lte?: string } = {}
    if (fromDate && isValidReceiptDate(fromDate)) dateWhere.gte = fromDate
    else dateWhere.gte = `${year}-01-01`
    if (toDate && isValidReceiptDate(toDate)) dateWhere.lte = toDate
    else dateWhere.lte = `${year}-12-31`

    const receipts = await prisma.promotionReceipt.findMany({
      where: {
        promotionId: params.id,
        receiptDate: dateWhere
      },
      select: {
        receiptDate: true,
        entrantName: true,
        staffId: true,
        amount: true,
        busRegistration: true,
        phone: true,
        staff: { select: { name: true } }
      },
      orderBy: [{ receiptDate: 'asc' }]
    })

    const ranking = filterTallyRows(buildFuelTally(receipts), search)
    const totalReceipts = receipts.length
    const totalAmount = roundMoney(receipts.reduce((sum, r) => sum + r.amount, 0))

    return NextResponse.json({
      promotionId: promotion.id,
      promotionName: promotion.name,
      year,
      fromDate: dateWhere.gte,
      toDate: dateWhere.lte,
      totalReceipts,
      totalAmount,
      uniqueDrivers: ranking.length,
      ranking
    })
  } catch (error) {
    console.error('Error building fuel tally:', error)
    return NextResponse.json({ error: 'Failed to load tally' }, { status: 500 })
  }
}
