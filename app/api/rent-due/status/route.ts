import { NextResponse } from 'next/server'
import { getRentDueStatus } from '@/lib/rent-due'

export const dynamic = 'force-dynamic'

/** GET — whether Rubis rent is currently due (for the always-on in-app banner). */
export async function GET() {
  try {
    const status = await getRentDueStatus()
    return NextResponse.json(status)
  } catch (e) {
    console.error('rent-due status', e)
    return NextResponse.json({ error: 'Failed to load rent due status' }, { status: 500 })
  }
}
