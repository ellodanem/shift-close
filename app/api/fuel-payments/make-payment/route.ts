import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// POST mark invoices as paid (create/update batch)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { paymentDate, bankRef, selectedInvoiceIds, addToCashbook = true } = body

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

    // Add to Cashbook as expense when requested (split by Rec. Gen / Rec. Gas / Mtnce)
    if (addToCashbook) {
      try {
        const paymentDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`

        // Map invoice types to cashbook categories: LPG+Lubricants→Rec. Gen, Fuel→Rec. Gas, Rent→Mtnce
        const recGenTypes = ['LPG', 'Lubricants']
        const recGasTypes = ['Fuel']
        const mtnceTypes = ['Rent']

        const sumByCategory = new Map<string, number>()
        for (const inv of allPaidInvoices) {
          const t = (inv.type || '').trim()
          if (recGenTypes.some((x) => t.toLowerCase() === x.toLowerCase())) {
            sumByCategory.set('Rec. Gen', (sumByCategory.get('Rec. Gen') ?? 0) + roundMoney(inv.amount))
          } else if (recGasTypes.some((x) => t.toLowerCase() === x.toLowerCase())) {
            sumByCategory.set('Rec. Gas', (sumByCategory.get('Rec. Gas') ?? 0) + roundMoney(inv.amount))
          } else if (mtnceTypes.some((x) => t.toLowerCase() === x.toLowerCase())) {
            sumByCategory.set('Mtnce', (sumByCategory.get('Mtnce') ?? 0) + roundMoney(inv.amount))
          }
        }

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

        const allocations: { categoryId: string; amount: number }[] = []
        for (const [catName, amount] of sumByCategory) {
          if (amount <= 0) continue
          const code = catName === 'Rec. Gen' ? '3021' : catName === 'Rec. Gas' ? '3022' : null
          const cat = await getOrCreateCategory(catName, code)
          allocations.push({ categoryId: cat.id, amount })
        }

        // Fallback: if no type matched, use single "Fuel payments" allocation
        if (allocations.length === 0) {
          const fuelCat = await getOrCreateCategory('Fuel payments', null)
          allocations.push({ categoryId: fuelCat.id, amount: newTotal })
        }

        await prisma.cashbookEntry.create({
          data: {
            date: paymentDateStr,
            ref: bankRef.trim(),
            description: `Fuel payment – Ref ${bankRef.trim()}`,
            debitCash: 0,
            debitCheck: 0,
            debitEcard: newTotal,
            debitDcard: 0,
            creditAmt: 0,
            paymentMethod: 'direct_debit',
            paymentBatchId: batch.id,
            allocations: { create: allocations }
          }
        })
      } catch (cashbookErr) {
        console.error('Failed to add fuel payment to cashbook:', cashbookErr)
        // Don't fail the payment - cashbook is optional
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

