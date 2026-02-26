import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { groupBatchesForMonth } from '@/lib/fuelPayments'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const month = searchParams.get('month') // Format: "2026-01"

    if (!month) {
      return NextResponse.json(
        { error: 'Month parameter is required (format: YYYY-MM)' },
        { status: 400 }
      )
    }

    // Validate month format
    const monthRegex = /^\d{4}-\d{2}$/
    if (!monthRegex.test(month)) {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM' },
        { status: 400 }
      )
    }

    // Calculate date range for the month
    const [year, monthNum] = month.split('-').map(Number)
    const startDate = new Date(year, monthNum - 1, 1)
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999) // Last day of month

    // Fetch all batches for the month with their invoices
    const batches = await prisma.paymentBatch.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        invoices: {
          orderBy: {
            invoiceNumber: 'asc'
          }
        }
      },
      orderBy: [
        { paymentDate: 'asc' },
        { bankRef: 'asc' }
      ]
    })

    // Group the data
    const groupedReport = groupBatchesForMonth(batches, month)

    return NextResponse.json({
      ...groupedReport,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error fetching monthly fuel payment report:', error)
    return NextResponse.json(
      { error: 'Failed to fetch monthly fuel payment report' },
      { status: 500 }
    )
  }
}

