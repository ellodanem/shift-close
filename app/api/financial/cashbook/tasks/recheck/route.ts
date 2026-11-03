import { NextResponse } from 'next/server'
import { recheckAll } from '@/lib/cashbook-task-db'

export const dynamic = 'force-dynamic'

/** POST: compare the latest sheet of each account with the cashbook as it is now. Closes tasks that now match. */
export async function POST() {
  try {
    return NextResponse.json({ accounts: await recheckAll() })
  } catch (error) {
    console.error('Cashbook task re-check failed:', error)
    return NextResponse.json({ error: 'Failed to re-check against the cashbook' }, { status: 500 })
  }
}
