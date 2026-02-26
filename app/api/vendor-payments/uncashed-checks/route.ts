import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET all uncashed vendor checks
export async function GET() {
  try {
    const batches = await prisma.vendorPaymentBatch.findMany({
      where: {
        paymentMethod: 'check',
        clearedAt: null
      },
      include: {
        vendor: true,
        invoices: true
      },
      orderBy: { paymentDate: 'asc' }
    })

    return NextResponse.json(batches)
  } catch (error) {
    console.error('Error fetching uncashed checks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch uncashed checks' },
      { status: 500 }
    )
  }
}
