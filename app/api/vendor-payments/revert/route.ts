import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// POST revert vendor payment by bank reference/check number
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const vendorId = String(body.vendorId || '').trim()
    const bankRef = String(body.bankRef || '').trim()

    if (!vendorId || !bankRef) {
      return NextResponse.json({ error: 'vendorId and bankRef are required' }, { status: 400 })
    }

    // Find most recent matching batch for this vendor + reference
    const batch = await prisma.vendorPaymentBatch.findFirst({
      where: { vendorId, bankRef },
      orderBy: { paymentDate: 'desc' }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'No vendor payment batch found with this reference' },
        { status: 404 }
      )
    }

    // If this payment already reduced available funds, add it back.
    const shouldRestoreBalance = batch.paymentMethod === 'eft' || batch.clearedAt != null
    if (shouldRestoreBalance) {
      const existingBalance = await prisma.balance.findUnique({ where: { id: 'balance' } })
      const amount = roundMoney(batch.totalAmount)
      if (existingBalance) {
        const updatedAvailable = roundMoney(existingBalance.availableFunds + amount)
        await prisma.balance.update({
          where: { id: 'balance' },
          data: {
            availableFunds: updatedAvailable,
            balanceAfter: roundMoney(updatedAvailable - existingBalance.planned)
          }
        })
      } else {
        await prisma.balance.create({
          data: {
            id: 'balance',
            currentBalance: amount,
            availableFunds: amount,
            planned: 0,
            balanceAfter: amount
          }
        })
      }
    }

    // Remove any linked cashbook rows generated from this vendor payment batch
    await prisma.cashbookEntry.deleteMany({
      where: { vendorPaymentBatchId: batch.id }
    })

    const paidInvoices = await prisma.paidVendorInvoice.findMany({
      where: { batchId: batch.id }
    })

    const revertedInvoiceIds: string[] = []
    for (const paid of paidInvoices) {
      await prisma.vendorInvoice.update({
        where: { id: paid.vendorInvoiceId },
        data: { status: 'pending' }
      })
      revertedInvoiceIds.push(paid.vendorInvoiceId)
    }

    await prisma.paidVendorInvoice.deleteMany({
      where: { batchId: batch.id }
    })

    await prisma.vendorPaymentBatch.delete({
      where: { id: batch.id }
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      revertedInvoiceIds
    })
  } catch (error) {
    console.error('Error reverting vendor payment:', error)
    return NextResponse.json({ error: 'Failed to revert payment' }, { status: 500 })
  }
}
