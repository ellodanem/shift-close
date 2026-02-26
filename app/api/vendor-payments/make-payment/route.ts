import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// POST create vendor payment batch (EFT or check)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      vendorId,
      paymentDate,
      paymentMethod,
      bankRef,
      selectedInvoiceIds,
      transferDescription,
      addToCashbook = true
    } = body

    if (
      !vendorId ||
      !paymentDate ||
      !paymentMethod ||
      !bankRef ||
      !Array.isArray(selectedInvoiceIds) ||
      selectedInvoiceIds.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'vendorId, paymentDate, paymentMethod, bankRef, and selectedInvoiceIds array are required'
        },
        { status: 400 }
      )
    }

    const method = String(paymentMethod).toLowerCase()
    if (method !== 'eft' && method !== 'check') {
      return NextResponse.json(
        { error: 'paymentMethod must be "eft" or "check"' },
        { status: 400 }
      )
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate)
    if (!match) {
      return NextResponse.json({ error: 'Invalid paymentDate format (YYYY-MM-DD)' }, { status: 400 })
    }
    const [, year, month, day] = match
    const paymentDateObj = new Date(Number(year), Number(month) - 1, Number(day))

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const invoices = await prisma.vendorInvoice.findMany({
      where: {
        id: { in: selectedInvoiceIds },
        vendorId,
        status: 'pending'
      }
    })

    if (invoices.length !== selectedInvoiceIds.length) {
      return NextResponse.json(
        { error: 'Some invoices not found, already paid, or belong to another vendor' },
        { status: 400 }
      )
    }

    const totalAmount = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    const existingBalance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })
    const balanceBefore = existingBalance ? existingBalance.availableFunds : 0
    const balanceAfter = roundMoney(balanceBefore - totalAmount)

    // EFT: deduct from balance immediately. Check: do NOT deduct until cleared
    if (method === 'eft') {
      if (existingBalance) {
        const updatedAvailable = roundMoney(existingBalance.availableFunds - totalAmount)
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
            currentBalance: 0,
            availableFunds: roundMoney(0 - totalAmount),
            planned: 0,
            balanceAfter: roundMoney(0 - totalAmount)
          }
        })
      }
    }

    const batch = await prisma.vendorPaymentBatch.create({
      data: {
        vendorId,
        paymentDate: paymentDateObj,
        paymentMethod: method,
        bankRef: String(bankRef).trim(),
        totalAmount,
        transferDescription:
          transferDescription && String(transferDescription).trim()
            ? String(transferDescription).trim()
            : null,
        balanceBefore,
        balanceAfter,
        clearedAt: method === 'eft' ? paymentDateObj : null
      }
    })

    for (const inv of invoices) {
      await prisma.paidVendorInvoice.create({
        data: {
          vendorInvoiceId: inv.id,
          batchId: batch.id,
          invoiceNumber: inv.invoiceNumber,
          amount: roundMoney(inv.amount),
          invoiceDate: inv.invoiceDate,
          vat: inv.vat ?? 0
        }
      })
      await prisma.vendorInvoice.update({
        where: { id: inv.id },
        data: { status: 'paid' }
      })
    }

    if (addToCashbook) {
      try {
        const paymentDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        const getOrCreateCategory = async (name: string, code: string | null) => {
          let cat = await prisma.cashbookCategory.findFirst({
            where: { name: { equals: name, mode: 'insensitive' }, type: 'expense' }
          })
          if (!cat) {
            cat = await prisma.cashbookCategory.create({
              data: { name, code, type: 'expense', sortOrder: 0, active: true }
            })
          }
          return cat
        }

        const recGenCat = await getOrCreateCategory('Rec. Gen', '3021')
        const allocations = [{ categoryId: recGenCat.id, amount: totalAmount }]

        const debitField = method === 'check' ? 'debitCheck' : 'debitEcard'
        await prisma.cashbookEntry.create({
          data: {
            date: paymentDateStr,
            ref: String(bankRef).trim(),
            description: `Vendor payment (${method}) – ${vendor.name} – Ref ${String(bankRef).trim()}`,
            debitCash: 0,
            debitCheck: method === 'check' ? totalAmount : 0,
            debitEcard: method === 'eft' ? totalAmount : 0,
            debitDcard: 0,
            creditAmt: 0,
            paymentMethod: method === 'check' ? 'check' : 'eft',
            vendorPaymentBatchId: batch.id,
            allocations: { create: allocations }
          }
        })
      } catch (cashbookErr) {
        console.error('Failed to add vendor payment to cashbook:', cashbookErr)
      }
    }

    const batchWithInvoices = await prisma.vendorPaymentBatch.findUnique({
      where: { id: batch.id },
      include: { invoices: true, vendor: true }
    })

    return NextResponse.json(
      { batch: batchWithInvoices },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error making vendor payment:', error)
    return NextResponse.json(
      { error: 'Failed to make payment' },
      { status: 500 }
    )
  }
}
