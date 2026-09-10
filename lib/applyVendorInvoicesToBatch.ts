import { prisma } from '@/lib/prisma'
import { balanceAfterFromAvailable } from '@/lib/fuelBalance'
import { mapExpenseDebits } from '@/lib/cashbook-expense'
import { roundMoney, vendorInvoiceTotal } from '@/lib/vendorVat'
import type { Prisma } from '@prisma/client'

export class ApplyVendorInvoicesError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApplyVendorInvoicesError'
    this.status = status
  }
}

async function deductAvailableFunds(tx: Prisma.TransactionClient, amount: number) {
  const existingBalance = await tx.balance.findUnique({ where: { id: 'balance' } })
  if (existingBalance) {
    const updatedAvailable = roundMoney(existingBalance.availableFunds - amount)
    await tx.balance.update({
      where: { id: 'balance' },
      data: {
        availableFunds: updatedAvailable,
        balanceAfter: balanceAfterFromAvailable(updatedAvailable)
      }
    })
  } else {
    await tx.balance.create({
      data: {
        id: 'balance',
        currentBalance: 0,
        availableFunds: roundMoney(0 - amount),
        planned: 0,
        balanceAfter: roundMoney(0 - amount)
      }
    })
  }
}

async function updateLinkedCashbook(
  tx: Prisma.TransactionClient,
  batchId: string,
  paymentMethod: string,
  newTotal: number,
  delta: number
) {
  const entry = await tx.cashbookEntry.findFirst({
    where: { vendorPaymentBatchId: batchId },
    include: { allocations: { orderBy: { id: 'asc' } } }
  })
  if (!entry) return

  const mapped = mapExpenseDebits(paymentMethod, newTotal)
  await tx.cashbookEntry.update({
    where: { id: entry.id },
    data: {
      debitCash: mapped.debitCash,
      debitCheck: mapped.debitCheck,
      debitEcard: mapped.debitEcard,
      debitDcard: mapped.debitDcard,
      paymentMethod: mapped.paymentMethod
    }
  })

  if (entry.allocations.length === 1) {
    await tx.cashbookAllocation.update({
      where: { id: entry.allocations[0].id },
      data: { amount: newTotal }
    })
  } else if (entry.allocations.length > 1) {
    const first = entry.allocations[0]
    await tx.cashbookAllocation.update({
      where: { id: first.id },
      data: { amount: roundMoney(first.amount + delta) }
    })
  }
}

export async function applyVendorInvoicesToBatch(opts: {
  batchId: string
  selectedInvoiceIds: string[]
  transferDescription?: string | null
}) {
  const batchId = opts.batchId.trim()
  const selectedInvoiceIds = opts.selectedInvoiceIds.map((id) => String(id).trim()).filter(Boolean)

  if (!batchId) {
    throw new ApplyVendorInvoicesError(400, 'batchId is required')
  }
  if (selectedInvoiceIds.length === 0) {
    throw new ApplyVendorInvoicesError(400, 'selectedInvoiceIds array is required')
  }

  return prisma.$transaction(async (tx) => {
    const batch = await tx.vendorPaymentBatch.findUnique({
      where: { id: batchId },
      include: { vendor: true, invoices: true }
    })
    if (!batch) {
      throw new ApplyVendorInvoicesError(404, 'Payment batch not found')
    }

    const invoices = await tx.vendorInvoice.findMany({
      where: {
        id: { in: selectedInvoiceIds },
        vendorId: batch.vendorId,
        status: 'pending'
      }
    })

    if (invoices.length !== selectedInvoiceIds.length) {
      throw new ApplyVendorInvoicesError(
        400,
        'Some invoices not found, already paid, or belong to another vendor'
      )
    }

    const delta = roundMoney(
      invoices.reduce((sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat), 0)
    )
    const newTotal = roundMoney(batch.totalAmount + delta)

    const fundsAlreadyDeducted = batch.paymentMethod === 'eft' || batch.clearedAt != null
    if (fundsAlreadyDeducted) {
      await deductAvailableFunds(tx, delta)
    }

    for (const inv of invoices) {
      await tx.paidVendorInvoice.create({
        data: {
          vendorInvoiceId: inv.id,
          batchId: batch.id,
          invoiceNumber: inv.invoiceNumber,
          amount: vendorInvoiceTotal(inv.amount, inv.vat),
          invoiceDate: inv.invoiceDate,
          vat: inv.vat ?? 0
        }
      })
      await tx.vendorInvoice.update({
        where: { id: inv.id },
        data: { status: 'paid' }
      })
    }

    const allInvoiceNumbers = [
      ...batch.invoices.map((inv) => inv.invoiceNumber),
      ...invoices.map((inv) => inv.invoiceNumber)
    ].filter(Boolean)

    let nextTransfer = batch.transferDescription
    if (opts.transferDescription !== undefined) {
      const trimmed = opts.transferDescription?.trim() || null
      nextTransfer = trimmed
    } else if (batch.paymentMethod === 'eft' && allInvoiceNumbers.length > 0) {
      nextTransfer = `Total Auto ${allInvoiceNumbers.join(' ')}`
    }

    const nextBalanceAfter =
      batch.balanceBefore != null ? roundMoney(batch.balanceBefore - newTotal) : batch.balanceAfter

    await tx.vendorPaymentBatch.update({
      where: { id: batch.id },
      data: {
        totalAmount: newTotal,
        transferDescription: nextTransfer,
        balanceAfter: nextBalanceAfter
      }
    })

    await updateLinkedCashbook(tx, batch.id, batch.paymentMethod, newTotal, delta)

    const updated = await tx.vendorPaymentBatch.findUnique({
      where: { id: batch.id },
      include: { invoices: true, vendor: true }
    })
    if (!updated) {
      throw new ApplyVendorInvoicesError(500, 'Failed to reload payment batch')
    }
    return updated
  })
}
