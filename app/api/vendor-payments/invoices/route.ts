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

    const where: Prisma.VendorInvoiceWhereInput = {}
    if (status) {
      where.status = status
    }
    if (vendorId) {
      where.vendorId = vendorId
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
