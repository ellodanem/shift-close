import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// POST mark invoices as paid (create/update batch)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentDate, bankRef, selectedInvoiceIds } = body

    if (!paymentDate || !bankRef || !Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
      return NextResponse.json(
        { error: 'paymentDate, bankRef, and selectedInvoiceIds array are required' },
        { status: 400 }
      )
    }

    // Parse paymentDate as a local calendar date (from HTML date input "YYYY-MM-DD")
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate)
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid paymentDate format' },
        { status: 400 }
      )
    }
    const [, year, month, day] = match
    const paymentDateObj = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    )

    // Verify all invoices exist and are pending
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: selectedInvoiceIds },
        status: 'pending'
      }
    })

    if (invoices.length !== selectedInvoiceIds.length) {
      return NextResponse.json(
        { error: 'Some invoices not found or already paid' },
        { status: 400 }
      )
    }

    // Find or create payment batch
    let batch = await prisma.paymentBatch.findUnique({
      where: {
        paymentDate_bankRef: {
          paymentDate: paymentDateObj,
          bankRef: bankRef.trim()
        }
      },
      include: {
        invoices: true
      }
    })

    if (!batch) {
      // Create new batch
      batch = await prisma.paymentBatch.create({
        data: {
          paymentDate: paymentDateObj,
          bankRef: bankRef.trim(),
          totalAmount: 0 // Will be recalculated
        },
        include: {
          invoices: true
        }
      })
    }

    // Create PaidInvoice records for each invoice
    const paidInvoices = []
    for (const invoice of invoices) {
      // Check if already paid in this batch
      const existingPaid = await prisma.paidInvoice.findFirst({
        where: {
          batchId: batch.id,
          invoiceNumber: invoice.invoiceNumber
        }
      })

      if (!existingPaid) {
        const paidInvoice = await prisma.paidInvoice.create({
          data: {
            batchId: batch.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: roundMoney(invoice.amount),
            type: invoice.type,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            notes: invoice.notes || ''
          }
        })

        // Link invoice to paid invoice
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'paid',
            paidInvoiceId: paidInvoice.id
          }
        })

        paidInvoices.push(paidInvoice)
      }
    }

    // Recalculate batch total
    const allPaidInvoices = await prisma.paidInvoice.findMany({
      where: { batchId: batch.id }
    })
    const newTotal = roundMoney(
      allPaidInvoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    // Get balance BEFORE payment (to store historical balance)
    const existingBalance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    // Calculate the amount being paid now (only new invoices in this call)
    const paidNow = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    // Store balance at time of payment (for historical accuracy)
    const balanceBefore = existingBalance ? existingBalance.availableFunds : 0
    const balanceAfter = roundMoney(balanceBefore - paidNow)

    // Update batch with total and historical balance
    await prisma.paymentBatch.update({
      where: { id: batch.id },
      data: {
        totalAmount: newTotal,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter
      }
    })

    // Update overall fuel balance: subtract the amount just paid
    if (existingBalance) {
      const updatedAvailable = roundMoney(existingBalance.availableFunds - paidNow)
      await prisma.balance.update({
        where: { id: 'balance' },
        data: {
          availableFunds: updatedAvailable,
          balanceAfter: roundMoney(updatedAvailable - existingBalance.planned)
        }
      })
    } else {
      // If no balance record exists yet, create one starting from zero minus this payment
      const updatedAvailable = roundMoney(0 - paidNow)
      await prisma.balance.create({
        data: {
          id: 'balance',
          currentBalance: 0,
          availableFunds: updatedAvailable,
          planned: 0,
          balanceAfter: updatedAvailable
        }
      })
    }

    // Delete any simulations that included these invoices
    const allSimulations = await prisma.paymentSimulation.findMany()
    for (const sim of allSimulations) {
      const simInvoiceIds = JSON.parse(sim.selectedInvoiceIds)
      const hasOverlap = simInvoiceIds.some((id: string) => selectedInvoiceIds.includes(id))
      if (hasOverlap) {
        await prisma.paymentSimulation.delete({
          where: { id: sim.id }
        })
      }
    }

    return NextResponse.json({
      batch: {
        ...batch,
        totalAmount: newTotal
      },
      paidInvoices
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error making payment:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A batch with this payment date and bank reference already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to make payment' },
      { status: 500 }
    )
  }
}

