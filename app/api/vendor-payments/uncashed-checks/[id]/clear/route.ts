import { NextRequest, NextResponse } from 'next/server'
import { clearUncashedCheck } from '@/lib/uncashedChecks'

// PATCH mark check as cleared (deduct from balance)
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await clearUncashedCheck(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear check'
    console.error('Error clearing check:', error)

    if (message === 'Batch not found' || message === 'Cashbook entry not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (
      message === 'Check already cleared' ||
      message === 'Only check payments can be cleared' ||
      message === 'Entry is not a check payment' ||
      message === 'Clear this check from its vendor payment batch' ||
      message === 'Invalid check id'
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to clear check' }, { status: 500 })
  }
}
