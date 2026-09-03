import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  buildFuelTally,
  generatePromotionReceiptExcelBuffer,
  isValidReceiptDate
} from '@/lib/promotion-receipts'

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
        id: true,
        receiptDate: true,
        entrantName: true,
        staffId: true,
        amount: true,
        busRegistration: true,
        phone: true,
        createdAt: true,
        staff: { select: { name: true } }
      },
      orderBy: [{ receiptDate: 'asc' }, { entrantName: 'asc' }]
    })

    const tally = buildFuelTally(receipts)
    const { buffer, filename } = generatePromotionReceiptExcelBuffer({
      promotionName: promotion.name,
      tally,
      receipts: receipts.map((r) => ({
        id: r.id,
        receiptDate: r.receiptDate,
        entrantName: r.staff?.name || r.entrantName,
        staffId: r.staffId,
        amount: r.amount,
        busRegistration: r.busRegistration,
        phone: r.phone,
        createdAt: r.createdAt.toISOString()
      }))
    })

    // NextResponse expects a web payload, not a Node.js Buffer.
    // We convert the Node Buffer -> Uint8Array to satisfy Next/TypeScript types.
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer

    return new NextResponse(new Uint8Array(arrayBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Error exporting promotion receipts:', error)
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
