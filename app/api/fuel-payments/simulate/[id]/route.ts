import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// GET single simulation with invoice details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const simulation = await prisma.paymentSimulation.findUnique({
      where: { id }
    })

    if (!simulation) {
      return NextResponse.json(
        { error: 'Simulation not found' },
        { status: 404 }
      )
    }

    // Parse invoice IDs and fetch invoices
    const invoiceIds = JSON.parse(simulation.selectedInvoiceIds)
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds }
      },
      orderBy: {
        invoiceNumber: 'asc'
      }
    })

    const totalAmount = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    return NextResponse.json({
      ...simulation,
      invoices,
      totalAmount,
      invoiceNumbers: invoices.map(inv => inv.invoiceNumber)
    })
  } catch (error) {
    console.error('Error fetching simulation:', error)
    return NextResponse.json(
      { error: 'Failed to fetch simulation' },
      { status: 500 }
    )
  }
}

// DELETE simulation (and revert invoices to pending)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const simulation = await prisma.paymentSimulation.findUnique({
      where: { id }
    })

    if (!simulation) {
      return NextResponse.json(
        { error: 'Simulation not found' },
        { status: 404 }
      )
    }

    // Delete simulation (invoices remain pending - no status change needed)
    await prisma.paymentSimulation.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting simulation:', error)
    return NextResponse.json(
      { error: 'Failed to delete simulation' },
      { status: 500 }
    )
  }
}

