import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'
import {
  adjustOperatingBalance,
  chargedVendorBalanceAccount
} from '@/lib/checkBalanceAccount'

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

    // If this payment already reduced an operating balance, add it back to that account.
    const restoreAccount = chargedVendorBalanceAccount(batch)
    if (restoreAccount) {
      await adjustOperatingBalance(prisma, roundMoney(batch.totalAmount), restoreAccount, 'restore')
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
