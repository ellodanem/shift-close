import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET current balance
export async function GET() {
  try {
    // Use upsert to ensure balance record exists
    let balance = await prisma.balance.upsert({
      where: { id: 'balance' },
      update: {},
      create: {
        id: 'balance',
        currentBalance: 0,
        availableFunds: 0,
        planned: 0,
        balanceAfter: 0
      }
    })

    // Calculate planned from active simulations
    const simulations = await prisma.paymentSimulation.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 1 // Most recent simulation
    })

    let planned = 0
    if (simulations.length > 0) {
      const sim = simulations[0]
      const invoiceIds = JSON.parse(sim.selectedInvoiceIds)
      // Get invoices from simulation (they remain pending, no status filter needed)
      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: invoiceIds },
          status: 'pending' // Invoices in simulation remain pending
        }
      })
      planned = roundMoney(
        invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
      )
    }

    // Calculate balance after
    const balanceAfter = roundMoney(balance.availableFunds - planned)

    // Update if planned changed
    if (planned !== balance.planned) {
      balance = await prisma.balance.update({
        where: { id: 'balance' },
        data: {
          planned,
          balanceAfter
        }
      })
    } else {
      balance = {
        ...balance,
        planned,
        balanceAfter
      }
    }

    return NextResponse.json(balance)
  } catch (error) {
    console.error('Error fetching balance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}

// PATCH update balance (currentBalance and availableFunds)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { currentBalance, availableFunds } = body

    if (currentBalance === undefined && availableFunds === undefined) {
      return NextResponse.json(
        { error: 'currentBalance or availableFunds must be provided' },
        { status: 400 }
      )
    }

    // Use upsert to ensure balance record exists
    const existingBalance = await prisma.balance.findUnique({
      where: { id: 'balance' }
    })

    if (!existingBalance) {
      // Create initial balance
      const newBalance = await prisma.balance.create({
        data: {
          id: 'balance',
          currentBalance: currentBalance ?? 0,
          availableFunds: availableFunds ?? currentBalance ?? 0,
          planned: 0,
          balanceAfter: (availableFunds ?? currentBalance ?? 0) - 0
        }
      })
      return NextResponse.json(newBalance)
    } else {
      const updateData: any = {}
      if (currentBalance !== undefined) {
        updateData.currentBalance = roundMoney(Number(currentBalance))
      }
      if (availableFunds !== undefined) {
        updateData.availableFunds = roundMoney(Number(availableFunds))
      }

      // Recalculate balanceAfter
      const finalAvailableFunds = updateData.availableFunds ?? existingBalance.availableFunds
      updateData.balanceAfter = roundMoney(finalAvailableFunds - existingBalance.planned)

      const balance = await prisma.balance.update({
        where: { id: 'balance' },
        data: updateData
      })
      return NextResponse.json(balance)
    }
  } catch (error) {
    console.error('Error updating balance:', error)
    return NextResponse.json(
      { error: 'Failed to update balance' },
      { status: 500 }
    )
  }
}

