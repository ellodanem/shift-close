import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { year: string } }
) {
  try {
    const year = parseInt(params.year)

    if (isNaN(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }

    // Fetch all fuel data for this year
    const fuelData = await prisma.historicalFuelData.findMany({
      where: { year },
      select: {
        month: true,
        day: true,
        unleadedLitres: true,
        dieselLitres: true
      }
    })

    // Group by month
    const monthMap = new Map<number, Set<number>>()
    fuelData.forEach(record => {
      if (!monthMap.has(record.month)) {
        monthMap.set(record.month, new Set())
      }
      // Consider a day as having data if it has either unleaded or diesel
      if (record.unleadedLitres !== null || record.dieselLitres !== null) {
        monthMap.get(record.month)!.add(record.day)
      }
    })

    // Build status array for all 12 months
    const statuses: Array<{
      month: number
      monthName: string
      hasData: boolean
      daysWithData: number
      totalDays: number
    }> = []

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    for (let month = 1; month <= 12; month++) {
      const daysWithData = monthMap.get(month)?.size || 0
      const totalDays = new Date(year, month, 0).getDate()

      statuses.push({
        month,
        monthName: monthNames[month - 1],
        hasData: daysWithData > 0,
        daysWithData,
        totalDays
      })
    }

    return NextResponse.json(statuses)
  } catch (error) {
    console.error('Error fetching fuel data status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch fuel data status' },
      { status: 500 }
    )
  }
}

