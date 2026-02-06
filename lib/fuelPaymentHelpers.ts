import { prisma } from '@/lib/prisma'
import { roundMoney } from './fuelPayments'

/**
 * Update a PaymentBatch with correction logging.
 * Requires a reason for any changes to critical fields.
 */
export async function updatePaymentBatch(
  batchId: string,
  updates: {
    paymentDate?: Date
    bankRef?: string
    totalAmount?: number
  },
  reason: string,
  changedBy: string = 'admin'
) {
  // Get current batch
  const currentBatch = await prisma.paymentBatch.findUnique({
    where: { id: batchId },
    include: { invoices: true }
  })

  if (!currentBatch) {
    throw new Error(`Batch ${batchId} not found`)
  }

  // Validate reason is provided
  if (!reason || reason.trim() === '') {
    throw new Error('Reason is required for batch updates')
  }

  return await prisma.$transaction(async (tx) => {
    // Log corrections for changed fields
    const corrections = []

    if (updates.paymentDate && updates.paymentDate.getTime() !== currentBatch.paymentDate.getTime()) {
      corrections.push({
        batchId,
        field: 'paymentDate',
        oldValue: currentBatch.paymentDate.toISOString(),
        newValue: updates.paymentDate.toISOString(),
        reason,
        changedBy
      })
    }

    if (updates.bankRef && updates.bankRef !== currentBatch.bankRef) {
      corrections.push({
        batchId,
        field: 'bankRef',
        oldValue: currentBatch.bankRef,
        newValue: updates.bankRef,
        reason,
        changedBy
      })
    }

    if (updates.totalAmount !== undefined) {
      const newAmount = roundMoney(updates.totalAmount)
      const oldAmount = roundMoney(currentBatch.totalAmount)
      if (newAmount !== oldAmount) {
        corrections.push({
          batchId,
          field: 'totalAmount',
          oldValue: oldAmount.toString(),
          newValue: newAmount.toString(),
          reason,
          changedBy
        })
      }
    }

    // Create corrections
    if (corrections.length > 0) {
      await tx.paymentCorrection.createMany({
        data: corrections
      })
    }

    // Update batch
    const updatedBatch = await tx.paymentBatch.update({
      where: { id: batchId },
      data: {
        ...(updates.paymentDate && { paymentDate: updates.paymentDate }),
        ...(updates.bankRef && { bankRef: updates.bankRef }),
        ...(updates.totalAmount !== undefined && { totalAmount: roundMoney(updates.totalAmount) })
      }
    })

    return updatedBatch
  })
}

/**
 * Update a PaidInvoice with correction logging.
 * Requires a reason for any changes to critical fields.
 */
export async function updatePaidInvoice(
  invoiceId: string,
  updates: {
    amount?: number
    type?: string
    invoiceNumber?: string
    invoiceDate?: Date
    dueDate?: Date
    notes?: string
  },
  reason: string,
  changedBy: string = 'admin'
) {
  // Get current invoice
  const currentInvoice = await prisma.paidInvoice.findUnique({
    where: { id: invoiceId }
  })

  if (!currentInvoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }

  // Validate reason is provided
  if (!reason || reason.trim() === '') {
    throw new Error('Reason is required for invoice updates')
  }

  return await prisma.$transaction(async (tx) => {
    // Log corrections for changed fields
    const corrections = []

    if (updates.amount !== undefined) {
      const newAmount = roundMoney(updates.amount)
      const oldAmount = roundMoney(currentInvoice.amount)
      if (newAmount !== oldAmount) {
        corrections.push({
          invoiceId,
          field: 'amount',
          oldValue: oldAmount.toString(),
          newValue: newAmount.toString(),
          reason,
          changedBy
        })
      }
    }

    if (updates.type && updates.type !== currentInvoice.type) {
      corrections.push({
        invoiceId,
        field: 'type',
        oldValue: currentInvoice.type,
        newValue: updates.type,
        reason,
        changedBy
      })
    }

    if (updates.invoiceNumber && updates.invoiceNumber !== currentInvoice.invoiceNumber) {
      corrections.push({
        invoiceId,
        field: 'invoiceNumber',
        oldValue: currentInvoice.invoiceNumber,
        newValue: updates.invoiceNumber,
        reason,
        changedBy
      })
    }

    if (updates.invoiceDate && updates.invoiceDate.getTime() !== currentInvoice.invoiceDate.getTime()) {
      corrections.push({
        invoiceId,
        field: 'invoiceDate',
        oldValue: currentInvoice.invoiceDate.toISOString(),
        newValue: updates.invoiceDate.toISOString(),
        reason,
        changedBy
      })
    }

    if (updates.dueDate && updates.dueDate.getTime() !== currentInvoice.dueDate.getTime()) {
      corrections.push({
        invoiceId,
        field: 'dueDate',
        oldValue: currentInvoice.dueDate.toISOString(),
        newValue: updates.dueDate.toISOString(),
        reason,
        changedBy
      })
    }

    // Create corrections
    if (corrections.length > 0) {
      await tx.paymentCorrection.createMany({
        data: corrections
      })
    }

    // Update invoice
    const updatedInvoice = await tx.paidInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(updates.amount !== undefined && { amount: roundMoney(updates.amount) }),
        ...(updates.type && { type: updates.type }),
        ...(updates.invoiceNumber && { invoiceNumber: updates.invoiceNumber }),
        ...(updates.invoiceDate && { invoiceDate: updates.invoiceDate }),
        ...(updates.dueDate && { dueDate: updates.dueDate }),
        ...(updates.notes !== undefined && { notes: updates.notes })
      }
    })

    // Recalculate batch total
    const batchInvoices = await tx.paidInvoice.findMany({
      where: { batchId: currentInvoice.batchId }
    })

    const newBatchTotal = roundMoney(
      batchInvoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    await tx.paymentBatch.update({
      where: { id: currentInvoice.batchId },
      data: { totalAmount: newBatchTotal }
    })

    return updatedInvoice
  })
}

