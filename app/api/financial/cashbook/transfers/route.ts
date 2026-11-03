import { NextRequest, NextResponse } from 'next/server'
import { isCashbookAccount } from '@/lib/cashbook-accounts'
import { TransferInputError, createTransfer } from '@/lib/cashbook-transfer'

export const dynamic = 'force-dynamic'

/** POST /api/financial/cashbook/transfers { date, amount, from, to, ref?, description? } */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (!isCashbookAccount(body.from) || !isCashbookAccount(body.to)) {
      return NextResponse.json({ error: 'Choose the account the money leaves and the one it goes to' }, { status: 400 })
    }
    const result = await createTransfer({
      date: typeof body.date === 'string' ? body.date.trim() : '',
      amount: typeof body.amount === 'number' ? body.amount : Number(body.amount),
      from: body.from,
      to: body.to,
      ref: typeof body.ref === 'string' ? body.ref : null,
      description: typeof body.description === 'string' ? body.description : null
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof TransferInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error creating transfer:', error)
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 })
  }
}
