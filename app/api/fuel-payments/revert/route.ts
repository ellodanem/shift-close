import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST revert payment by bank reference
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { bankRef } = body

    if (!bankRef) {
      return NextResponse.json(
        { error: 'bankRef is required' },
        { status: 400 }
      )
    }

    // Find batch by bank reference (most recent if multiple)
    const batches = await prisma.paymentBatch.findMany({
      where: {
        bankRef: bankRef.trim()
      },
      include: {
        invoices: true
      },
      orderBy: {
        paymentDate: 'desc'
      }
    })

    if (batches.length === 0) {
      return NextResponse.json(
        { error: 'No payment batch found with this bank reference' },
        { status: 404 }
      )
    }

    // Use the most recent batch
    const batch = batches[0]

    // Get all paid invoices for this batch
    const paidInvoices = await prisma.paidInvoice.findMany({
      where: { batchId: batch.id }
    })

    // Revert invoices back to pending
    const invoiceIds: string[] = []
    for (const paidInvoice of paidInvoices) {
      // Find the original invoice
      const invoice = await prisma.invoice.findFirst({
        where: {
          paidInvoiceId: paidInvoice.id
        }
      })

      if (invoice) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'pending',
            paidInvoiceId: null
          }
        })
        invoiceIds.push(invoice.id)
      }

      // Delete paid invoice
      await prisma.paidInvoice.delete({
        where: { id: paidInvoice.id }
      })
    }

    // Delete batch if no invoices remain
    const remainingInvoices = await prisma.paidInvoice.findMany({
      where: { batchId: batch.id }
    })

    if (remainingInvoices.length === 0) {
      await prisma.paymentBatch.delete({
        where: { id: batch.id }
      })
    } else {
      // Recalculate batch total
      const newTotal = remainingInvoices.reduce((sum, inv) => sum + inv.amount, 0)
      await prisma.paymentBatch.update({
        where: { id: batch.id },
        data: { totalAmount: newTotal }
      })
    }

    return NextResponse.json({
      success: true,
      revertedInvoiceIds: invoiceIds,
      batchId: batch.id
    })
  } catch (error) {
    console.error('Error reverting payment:', error)
    return NextResponse.json(
      { error: 'Failed to revert payment' },
      { status: 500 }
    )
  }
}

