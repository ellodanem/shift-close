import { NextRequest, NextResponse } from 'next/server'
import { isYmd, ymdToUtcNoonDate } from '@/lib/datetime-policy'
import { parseCheckBalanceAccount } from '@/lib/checkBalanceAccount'
import { clearUncashedCheck } from '@/lib/uncashedChecks'

function parseOptionalClearedAt(body: unknown): Date | undefined {
  if (!body || typeof body !== 'object') return undefined

  const raw = (body as { clearedAt?: unknown }).clearedAt
  if (raw == null || raw === '') return undefined
  if (typeof raw !== 'string' || !isYmd(raw.trim())) {
    throw new Error('Invalid cleared date')
  }

  return ymdToUtcNoonDate(raw.trim())
}

// PATCH mark check as cleared (deduct from balance)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const clearedAt = parseOptionalClearedAt(body)
    const balanceAccount = parseCheckBalanceAccount(
      body && typeof body === 'object'
        ? (body as { balanceAccount?: unknown }).balanceAccount
        : undefined
    )
    await clearUncashedCheck(id, clearedAt, balanceAccount)
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
      message === 'Invalid check id' ||
      message === 'Invalid cleared date' ||
      message === 'Invalid balance account'
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to clear check' }, { status: 500 })
  }
}
