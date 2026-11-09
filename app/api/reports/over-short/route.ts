import { NextRequest, NextResponse } from 'next/server'
import { loadOverShortReport, resolveOverShortRange } from '@/lib/over-short-report-data'

export const dynamic = 'force-dynamic'

/** GET /api/reports/over-short?from=YYYY-MM-DD&to=YYYY-MM-DD — over/short by day (default: the 7 days ending yesterday). */
export async function GET(request: NextRequest) {
  const range = resolveOverShortRange(
    request.nextUrl.searchParams.get('from'),
    request.nextUrl.searchParams.get('to')
  )
  if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

  try {
    const report = await loadOverShortReport(range.from, range.to)
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('over-short report GET', error)
    return NextResponse.json({ error: 'Failed to load the over/short report' }, { status: 500 })
  }
}
