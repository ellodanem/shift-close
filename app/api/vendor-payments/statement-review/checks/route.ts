import { NextRequest, NextResponse } from 'next/server'
import { parseCheckBalanceAccount } from '@/lib/checkBalanceAccount'
import { applyStatementChecks, previewStatementChecks } from '@/lib/statement-review'
import { coerceTransactions } from '@/lib/bank-statement'

export const dynamic = 'force-dynamic'

// POST { transactions }                         -> preview of matches
// POST { apply: true, account, items: [{id, clearedAt}] } -> mark the chosen checks cashed
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    if (body.apply === true) {
      const account = parseCheckBalanceAccount(body.account)
      if (!account) {
        return NextResponse.json({ error: 'Choose an account.' }, { status: 400 })
      }
      const items = Array.isArray(body.items)
        ? body.items
            .map((raw) => raw as { id?: unknown; clearedAt?: unknown })
            .filter((i) => typeof i.id === 'string' && typeof i.clearedAt === 'string')
            .map((i) => ({ id: i.id as string, clearedAt: (i.clearedAt as string).trim() }))
        : []
      if (items.length === 0) {
        return NextResponse.json({ error: 'No checks selected.' }, { status: 400 })
      }
      const results = await applyStatementChecks(items, account)
      return NextResponse.json({ results })
    }

    const rows = await previewStatementChecks(coerceTransactions(body.transactions))
    return NextResponse.json({ rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    if (message === 'Invalid balance account') {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Error reviewing statement checks:', error)
    return NextResponse.json({ error: 'Failed to review statement checks' }, { status: 500 })
  }
}
