import { NextResponse } from 'next/server'
import { listUncashedChecks } from '@/lib/uncashedChecks'

export const dynamic = 'force-dynamic'

// GET all uncashed checks (vendor payments + standalone cashbook check expenses)
export async function GET() {
  try {
    const checks = await listUncashedChecks()
    return NextResponse.json(checks)
  } catch (error) {
    console.error('Error fetching uncashed checks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch uncashed checks' },
      { status: 500 }
    )
  }
}
