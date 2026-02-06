import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST endpoint to fix invoices stuck in 'simulated' status
// This is a one-time fix for invoices that were marked as simulated before the bug fix
export async function POST() {
  try {
    // Find all invoices with 'simulated' status
    const simulatedInvoices = await prisma.invoice.findMany({
      where: {
        status: 'simulated'
      }
    })

    if (simulatedInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No invoices found with simulated status',
        fixed: 0
      })
    }

    // Revert them all back to 'pending'
    const result = await prisma.invoice.updateMany({
      where: {
        status: 'simulated'
      },
      data: {
        status: 'pending'
      }
    })

    return NextResponse.json({
      success: true,
      message: `Fixed ${result.count} invoice(s) that were stuck in simulated status`,
      fixed: result.count,
      invoiceIds: simulatedInvoices.map(inv => inv.id)
    })
  } catch (error) {
    console.error('Error fixing simulated invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fix simulated invoices' },
      { status: 500 }
    )
  }
}

// GET endpoint to check how many invoices are stuck
export async function GET() {
  try {
    const simulatedInvoices = await prisma.invoice.findMany({
      where: {
        status: 'simulated'
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        type: true
      }
    })

    return NextResponse.json({
      count: simulatedInvoices.length,
      invoices: simulatedInvoices
    })
  } catch (error) {
    console.error('Error checking simulated invoices:', error)
    return NextResponse.json(
      { error: 'Failed to check simulated invoices' },
      { status: 500 }
    )
  }
}


