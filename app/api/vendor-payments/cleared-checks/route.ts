import { NextResponse } from 'next/server'
import { listClearedChecks } from '@/lib/uncashedChecks'

export const dynamic = 'force-dynamic'

// GET all cleared checks (vendor payments + standalone cashbook check expenses)
export async function GET() {
  try {
    const checks = await listClearedChecks()
    return NextResponse.json(checks)
  } catch (error) {
    console.error('Error fetching cleared checks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cleared checks' },
      { status: 500 }
    )
  }
}
