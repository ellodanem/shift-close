import { NextRequest, NextResponse } from 'next/server'
import { isYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { updateCheckClearedAt } from '@/lib/uncashedChecks'

function parseClearedAt(body: unknown): Date {
  const raw =
    body && typeof body === 'object'
      ? (body as { clearedAt?: unknown }).clearedAt
      : undefined

  if (typeof raw !== 'string' || !isYmd(raw.trim())) {
    throw new Error('Invalid cleared date')
  }

  return ymdToUtcNoonDate(raw.trim())
}

// PATCH update the cleared date on an already-cleared check
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const clearedAt = parseClearedAt(body)
    await updateCheckClearedAt(id, clearedAt)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update cleared date'
    console.error('Error updating cleared date:', error)

    if (message === 'Batch not found' || message === 'Cashbook entry not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (
      message === 'Check is not cleared' ||
      message === 'Only check payments can be cleared' ||
      message === 'Entry is not a check payment' ||
      message === 'Clear this check from its vendor payment batch' ||
      message === 'Invalid check id' ||
      message === 'Invalid cleared date'
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to update cleared date' }, { status: 500 })
  }
}
