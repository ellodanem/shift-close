import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** GET /api/attendance/pay-period - List saved pay periods */
export async function GET() {
  try {
    const periods = await prisma.payPeriod.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(periods)
  } catch (error) {
    console.error('Pay period list error:', error)
    return NextResponse.json({ error: 'Failed to list pay periods' }, { status: 500 })
  }
}

/** POST /api/attendance/pay-period - Save a pay period */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { startDate, endDate, reportDate, entityName, rows } = body as {
      startDate?: string
      endDate?: string
      reportDate?: string
      entityName?: string
      rows?: Array<{ staffId: string; staffName: string; transTtl: number; vacation: string; shortage: number }>
    }

    if (!startDate || !endDate || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: 'startDate, endDate, and rows (array) required' },
        { status: 400 }
      )
    }

    const period = await prisma.payPeriod.create({
      data: {
        startDate,
        endDate,
        reportDate: reportDate || new Date().toISOString().slice(0, 10),
        entityName: entityName || 'Total Auto Service Station',
        rows: JSON.stringify(rows)
      }
    })

    return NextResponse.json(period, { status: 201 })
  } catch (error) {
    console.error('Pay period save error:', error)
    return NextResponse.json({ error: 'Failed to save pay period' }, { status: 500 })
  }
}
