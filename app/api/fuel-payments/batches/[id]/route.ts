import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney, formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

// GET single batch by id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const batch = await prisma.paymentBatch.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: {
            invoiceNumber: 'asc'
          }
        },
        corrections: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Last 10 corrections
        }
      }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Payment batch not found' },
        { status: 404 }
      )
    }

    // Recalculate totalAmount
    const calculatedTotal = roundMoney(
      batch.invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    // Use stored balance at time of payment (for historical accuracy)
    // For old records without stored balance, we cannot reliably reconstruct
    // because balance may have been adjusted manually or payments may have been deleted
    let balanceBeforeFormatted = '-'
    let balanceAfterFormatted = '-'
    
    if (batch.balanceBefore != null && batch.balanceAfter != null) {
      // Use stored historical balance (accurate)
      balanceBeforeFormatted = formatAmount(batch.balanceBefore)
      balanceAfterFormatted = formatAmount(batch.balanceAfter)
    }
    // For old records without stored balance, show "-" to indicate data not available
    // This is safer than trying to reconstruct, which can give incorrect results

    return NextResponse.json({
      ...batch,
      totalAmount: calculatedTotal,
      summary: {
        datePaid: formatInvoiceDate(batch.paymentDate),
        referenceNumber: batch.bankRef,
        totalPaid: formatAmount(calculatedTotal),
        balanceBefore: balanceBeforeFormatted,
        balanceAfter: balanceAfterFormatted,
        invoices: batch.invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          amount: formatAmount(inv.amount),
          type: inv.type,
          invoiceDate: formatInvoiceDate(inv.invoiceDate),
          dueDate: formatInvoiceDate(inv.dueDate)
        }))
      }
    })
  } catch (error) {
    console.error('Error fetching payment batch:', error)
    return NextResponse.json(
      { error: 'Failed to fetch payment batch' },
      { status: 500 }
    )
  }
}

// PATCH update batch
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { paymentDate, bankRef, reason, changedBy } = body

    // Verify batch exists
    const existing = await prisma.paymentBatch.findUnique({
      where: { id },
      include: { invoices: true }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Payment batch not found' },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {}

    if (paymentDate !== undefined) {
      const paymentDateObj = new Date(paymentDate)
      if (isNaN(paymentDateObj.getTime())) {
        return NextResponse.json(
          { error: 'Invalid paymentDate format' },
          { status: 400 }
        )
      }
      updateData.paymentDate = paymentDateObj
    }

    if (bankRef !== undefined) {
      updateData.bankRef = bankRef.trim()
    }

    // Check for duplicate if paymentDate or bankRef changed
    if (updateData.paymentDate || updateData.bankRef) {
      const finalPaymentDate = updateData.paymentDate || existing.paymentDate
      const finalBankRef = updateData.bankRef || existing.bankRef

      const duplicate = await prisma.paymentBatch.findUnique({
        where: {
          paymentDate_bankRef: {
            paymentDate: finalPaymentDate,
            bankRef: finalBankRef
          }
        }
      })

      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: 'A batch with this payment date and bank reference already exists' },
          { status: 409 }
        )
      }
    }

    // Update batch
    const updated = await prisma.paymentBatch.update({
      where: { id },
      data: updateData,
      include: {
        invoices: {
          orderBy: {
            invoiceNumber: 'asc'
          }
        }
      }
    })

    // Log corrections for changed fields
    if (reason && (updateData.paymentDate || updateData.bankRef)) {
      const corrections = []
      
      if (updateData.paymentDate && updateData.paymentDate.getTime() !== existing.paymentDate.getTime()) {
        corrections.push({
          batchId: id,
          field: 'paymentDate',
          oldValue: existing.paymentDate.toISOString(),
          newValue: updateData.paymentDate.toISOString(),
          reason: reason || 'Batch updated',
          changedBy: changedBy || 'admin'
        })
      }

      if (updateData.bankRef && updateData.bankRef !== existing.bankRef) {
        corrections.push({
          batchId: id,
          field: 'bankRef',
          oldValue: existing.bankRef,
          newValue: updateData.bankRef,
          reason: reason || 'Batch updated',
          changedBy: changedBy || 'admin'
        })
      }

      if (corrections.length > 0) {
        await prisma.paymentCorrection.createMany({
          data: corrections
        })
      }
    }

    // Recalculate totalAmount
    const calculatedTotal = roundMoney(
      updated.invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    return NextResponse.json({
      ...updated,
      totalAmount: calculatedTotal
    })
  } catch (error: any) {
    console.error('Error updating payment batch:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A batch with this payment date and bank reference already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update payment batch' },
      { status: 500 }
    )
  }
}

// DELETE batch
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Verify batch exists
    const existing = await prisma.paymentBatch.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Payment batch not found' },
        { status: 404 }
      )
    }

    // Delete batch (cascade will delete invoices and corrections)
    await prisma.paymentBatch.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting payment batch:', error)
    return NextResponse.json(
      { error: 'Failed to delete payment batch' },
      { status: 500 }
    )
  }
}

