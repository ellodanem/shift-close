import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/fuelPayments'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const batch = await prisma.vendorPaymentBatch.findUnique({
      where: { id },
      include: {
        vendor: true,
        invoices: { orderBy: { invoiceNumber: 'asc' } }
      }
    })

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }

    const balanceBeforeFormatted =
      batch.balanceBefore != null ? formatAmount(batch.balanceBefore) : '-'
    const balanceAfterFormatted =
      batch.balanceAfter != null ? formatAmount(batch.balanceAfter) : '-'

    return NextResponse.json({
      ...batch,
      balanceBeforeFormatted,
      balanceAfterFormatted
    })
  } catch (error) {
    console.error('Error fetching vendor batch:', error)
    return NextResponse.json(
      { error: 'Failed to fetch batch' },
      { status: 500 }
    )
  }
}
