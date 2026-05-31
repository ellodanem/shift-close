import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET all vendor invoices (optional status + vendor filter)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') // 'pending' | 'paid' | null (all)
    const vendorId = searchParams.get('vendorId')
    const month = searchParams.get('month') // YYYY-MM

    const where: Prisma.VendorInvoiceWhereInput = {}
    if (status) {
      where.status = status
    }
    if (vendorId) {
      where.vendorId = vendorId
    }
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [yearStr, monthStr] = month.split('-')
      const year = parseInt(yearStr, 10)
      const monthIndex = parseInt(monthStr, 10) - 1
      where.invoiceDate = {
        gte: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
        lt: new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0))
      }
    }

    const invoices = await prisma.vendorInvoice.findMany({
      where,
      include: {
        vendor: {
          select: { id: true, name: true }
        },
        paidInvoice: {
          include: {
            batch: true
          }
        }
      },
      orderBy: [{ invoiceDate: 'desc' }, { invoiceNumber: 'asc' }]
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error('Error fetching vendor invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor invoices' },
      { status: 500 }
    )
  }
}
