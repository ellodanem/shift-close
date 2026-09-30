import { NextRequest, NextResponse } from 'next/server'
import { isYmd } from '@/lib/datetime-policy'
import { findMeterCarry } from '@/lib/shift-meter-carry'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')?.trim() || ''
    const shift = searchParams.get('shift')?.trim() || ''
    if (!isYmd(date) || !shift) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) and shift are required' }, { status: 400 })
    }
    const carry = await findMeterCarry({ date, shift })
    return NextResponse.json(carry, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error('Error loading meter carry-forward:', error)
    return NextResponse.json({ error: 'Failed to load meter carry-forward' }, { status: 500 })
  }
}
