import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

// GET most recent fuel payment
export async function GET() {
  try {
    // Get the most recent payment batch (with all invoices)
    const recentBatch = await prisma.paymentBatch.findFirst({
      orderBy: {
        paymentDate: 'desc'
      },
      include: {
        invoices: {
          orderBy: {
            invoiceDate: 'desc'
          }
        }
      }
    })

    if (!recentBatch) {
      return NextResponse.json(null)
    }

    // Get balance for available funds
    const balance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    // Format the response: include all invoices from the most recent batch
    const invoices = recentBatch.invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      amount: formatAmount(inv.amount)
    }))

    return NextResponse.json({
      datePaid: formatInvoiceDate(recentBatch.paymentDate),
      referenceNumber: recentBatch.bankRef,
      totalPaid: formatAmount(recentBatch.totalAmount),
      availableBalance: balance ? formatAmount(balance.availableFunds) : '-',
      invoices
    })
  } catch (error) {
    console.error('Error fetching recent fuel payment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recent fuel payment' },
      { status: 500 }
    )
  }
}

