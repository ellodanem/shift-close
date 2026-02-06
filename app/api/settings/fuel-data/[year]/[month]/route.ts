import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Fetch all days for a month
export async function GET(
  request: NextRequest,
  { params }: { params: { year: string; month: string } }
) {
  try {
    const year = parseInt(params.year)
    const month = parseInt(params.month)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    // Get all days in the month
    const daysInMonth = new Date(year, month, 0).getDate()
    const days: Array<{
      day: number
      date: string
      unleadedLitres: number | null
      dieselLitres: number | null
    }> = []

    // Fetch existing data
    const existingData = await prisma.historicalFuelData.findMany({
      where: {
        year,
        month
      }
    })

    const dataMap = new Map<string, typeof existingData[0]>()
    existingData.forEach(record => {
      dataMap.set(record.date, record)
    })

    // Build days array
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const existing = dataMap.get(date)

      days.push({
        day,
        date,
        unleadedLitres: existing?.unleadedLitres ?? null,
        dieselLitres: existing?.dieselLitres ?? null
      })
    }

    return NextResponse.json({ year, month, days })
  } catch (error) {
    console.error('Error fetching fuel data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch fuel data' },
      { status: 500 }
    )
  }
}

// PATCH - Update fuel data for a month
export async function PATCH(
  request: NextRequest,
  { params }: { params: { year: string; month: string } }
) {
  try {
    const year = parseInt(params.year)
    const month = parseInt(params.month)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    const body = await request.json()
    const { days } = body

    if (!Array.isArray(days)) {
      return NextResponse.json({ error: 'Days array is required' }, { status: 400 })
    }

    let updated = 0
    const errors: string[] = []

    for (const dayData of days) {
      const { day, unleadedLitres, dieselLitres } = dayData

      if (!day || day < 1 || day > 31) {
        errors.push(`Invalid day: ${day}`)
        continue
      }

      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      try {
        // Convert null/empty strings to null
        const unleaded = unleadedLitres === '' || unleadedLitres === null || unleadedLitres === undefined
          ? null
          : parseFloat(String(unleadedLitres))
        const diesel = dieselLitres === '' || dieselLitres === null || dieselLitres === undefined
          ? null
          : parseFloat(String(dieselLitres))

        // Validate numbers
        if (unleaded !== null && isNaN(unleaded)) {
          errors.push(`Day ${day}: Invalid unleaded value`)
          continue
        }
        if (diesel !== null && isNaN(diesel)) {
          errors.push(`Day ${day}: Invalid diesel value`)
          continue
        }

        await prisma.historicalFuelData.upsert({
          where: { date },
          update: {
            year,
            month,
            day,
            unleadedLitres: unleaded,
            dieselLitres: diesel,
            source: 'manual_entry',
            importedAt: new Date()
          },
          create: {
            date,
            year,
            month,
            day,
            unleadedLitres: unleaded,
            dieselLitres: diesel,
            source: 'manual_entry'
          }
        })
        updated++
      } catch (error: any) {
        errors.push(`Day ${day}: ${error.message || 'Database error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error updating fuel data:', error)
    return NextResponse.json(
      { error: 'Failed to update fuel data' },
      { status: 500 }
    )
  }
}

