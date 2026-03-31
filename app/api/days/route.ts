import { NextResponse } from 'next/server'
import { buildDayReports } from '@/lib/day-reports'

// Always run on the server so Day Reports show latest shift updates (no static/cache)
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const dayReports = await buildDayReports()
    return NextResponse.json(dayReports, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Error fetching day reports:', error)
    return NextResponse.json({ error: 'Failed to fetch day reports' }, { status: 500 })
  }
}
