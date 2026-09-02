import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney, vendorInvoiceTotal } from '@/lib/vendorVat'

export const dynamic = 'force-dynamic'

/** GET /api/vendor-payments/batches — all vendor payment batches (optional month / date range). */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const month = searchParams.get('month')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const vendorId = searchParams.get('vendorId')

    const where: {
      paymentDate?: { gte: Date; lte: Date }
      vendorId?: string
    } = {}

    if (vendorId) {
      where.vendorId = vendorId
    }

    if (month) {
      const [year, monthNum] = month.split('-').map(Number)
      const monthStart = new Date(year, monthNum - 1, 1)
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999)
      where.paymentDate = { gte: monthStart, lte: monthEnd }
    } else if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(`${endDate}T23:59:59.999`)
      }
    }

    const batches = await prisma.vendorPaymentBatch.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        invoices: {
          select: { id: true, invoiceNumber: true, amount: true, vat: true }
        },
        _count: { select: { invoices: true } }
      },
      orderBy: [{ paymentDate: 'desc' }, { bankRef: 'asc' }]
    })

    const rows = batches.map((batch) => {
      const calculatedTotal = roundMoney(
        batch.invoices.reduce(
          (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
          0
        )
      )
      return {
        id: batch.id,
        vendorId: batch.vendorId,
        vendorName: batch.vendor.name,
        paymentDate: batch.paymentDate,
        paymentMethod: batch.paymentMethod,
        bankRef: batch.bankRef,
        totalAmount: calculatedTotal,
        clearedAt: batch.clearedAt,
        transferDescription: batch.transferDescription,
        invoiceCount: batch._count.invoices,
        invoices: batch.invoices
      }
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error fetching vendor payment batches:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor payment batches' },
      { status: 500 }
    )
  }
}
