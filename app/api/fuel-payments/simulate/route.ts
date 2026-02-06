import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { roundMoney } from '@/lib/fuelPayments'

// POST create payment simulation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { simulationDate, selectedInvoiceIds } = body

    if (!simulationDate || !Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
      return NextResponse.json(
        { error: 'simulationDate and selectedInvoiceIds array are required' },
        { status: 400 }
      )
    }

    // Parse simulationDate as a LOCAL calendar date (YYYY-MM-DD) to avoid
    // timezone shifts that can move the stored date backward/forward a day
    // depending on the server's timezone.
    let simulationDateObj: Date
    if (typeof simulationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(simulationDate)) {
      const [year, month, day] = simulationDate.split('-').map(Number)
      simulationDateObj = new Date(year, month - 1, day)
    } else {
      simulationDateObj = new Date(simulationDate)
    }
    if (isNaN(simulationDateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid simulationDate format' },
        { status: 400 }
      )
    }

    // Verify all invoices exist and are pending
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: selectedInvoiceIds },
        status: 'pending'
      }
    })

    if (invoices.length !== selectedInvoiceIds.length) {
      return NextResponse.json(
        { error: 'Some invoices not found or not pending' },
        { status: 400 }
      )
    }

    // Generate transfer description: "Total Auto <invoice numbers>"
    const invoiceNumbers = invoices
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber))
      .map(inv => inv.invoiceNumber)
      .join(' ')
    const transferDescription = `Total Auto ${invoiceNumbers}`

    // Create simulation (DO NOT change invoice status - simulation is read-only)
    const simulation = await prisma.paymentSimulation.create({
      data: {
        simulationDate: simulationDateObj,
        selectedInvoiceIds: JSON.stringify(selectedInvoiceIds),
        transferDescription
      }
    })

    // Calculate total amount
    const totalAmount = roundMoney(
      invoices.reduce((sum, inv) => sum + roundMoney(inv.amount), 0)
    )

    return NextResponse.json({
      ...simulation,
      invoices,
      totalAmount,
      invoiceNumbers: invoiceNumbers.split(' ')
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating payment simulation:', error)
    return NextResponse.json(
      { error: 'Failed to create payment simulation' },
      { status: 500 }
    )
  }
}

// GET all simulations (for cleanup and listing)
export async function GET(request: NextRequest) {
  try {
    const simulations = await prisma.paymentSimulation.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 50 // Limit to recent simulations
    })

    return NextResponse.json(simulations)
  } catch (error) {
    console.error('Error fetching simulations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch simulations' },
      { status: 500 }
    )
  }
}

