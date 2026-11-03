import { NextRequest, NextResponse } from 'next/server'
import { parseCheckBalanceAccount } from '@/lib/checkBalanceAccount'
import { applyStatementCommissions, previewStatementCommissions } from '@/lib/statement-review'
import { coerceTransactions, type StatementCommission } from '@/lib/bank-statement'

export const dynamic = 'force-dynamic'

// POST { transactions }                           -> preview of POS commissions
// POST { apply: true, account, items: [{key, commission}] } -> add Cashbook lines (Bank charges)
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
            .map((raw) => raw as { key?: unknown; commission?: Partial<StatementCommission> })
            .filter(
              (i) =>
                typeof i.key === 'string' &&
                i.commission &&
                typeof i.commission.date === 'string' &&
                typeof i.commission.description === 'string' &&
                typeof i.commission.amount === 'number'
            )
            .map((i) => ({
              key: i.key as string,
              commission: {
                date: (i.commission as StatementCommission).date,
                description: (i.commission as StatementCommission).description,
                amount: (i.commission as StatementCommission).amount,
                reference: String((i.commission as StatementCommission).reference ?? '')
              }
            }))
        : []
      if (items.length === 0) {
        return NextResponse.json({ error: 'No commissions selected.' }, { status: 400 })
      }
      const results = await applyStatementCommissions(items, account)
      return NextResponse.json({ results })
    }

    const preview = await previewStatementCommissions(coerceTransactions(body.transactions))
    return NextResponse.json(preview)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    if (message === 'Invalid balance account' || message.includes('Bank charges')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('Error reviewing POS commissions:', error)
    return NextResponse.json({ error: 'Failed to review POS commissions' }, { status: 500 })
  }
}
