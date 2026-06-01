import { NextResponse } from 'next/server'
import { fetchTimeOffStaffOptions } from '@/lib/time-off-bundle'

export const dynamic = 'force-dynamic'

/** Active staff pickers for Time Off forms (minimal fields, one load per visit). */
export async function GET() {
  try {
    const staff = await fetchTimeOffStaffOptions()
    return NextResponse.json(staff)
  } catch (error) {
    console.error('time-off staff-options error:', error)
    return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  }
}
