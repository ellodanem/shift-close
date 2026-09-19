import { NextRequest, NextResponse } from 'next/server'
import { getFuelComparisonByDay, getFuelComparisonByMonth } from '@/lib/fuel-comparison'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') === 'month' ? 'month' : 'day'
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear()
    if (isNaN(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }

    if (view === 'month') {
      return NextResponse.json(await getFuelComparisonByMonth(year))
    }

    const month = monthParam ? parseInt(monthParam) : new Date().getMonth() + 1
    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    return NextResponse.json(await getFuelComparisonByDay(year, month))
  } catch (error) {
    console.error('Error fetching fuel comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel comparison' }, { status: 500 })
  }
}
