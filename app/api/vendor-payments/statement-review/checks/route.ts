import { NextRequest, NextResponse } from 'next/server'
import { parseCheckBalanceAccount } from '@/lib/checkBalanceAccount'
import {
  addMissingStatementChecks,
  applyStatementChecks,
  previewStatementChecks,
  type AddMissingCheckItem
} from '@/lib/statement-review'
import { coerceTransactions } from '@/lib/bank-statement'

export const dynamic = 'force-dynamic'

function parseMissingItems(value: unknown): AddMissingCheckItem[] {
  if (!Array.isArray(value)) return []
  const out: AddMissingCheckItem[] = []
  for (const raw of value) {
    const i = raw as Partial<AddMissingCheckItem>
    const key = typeof i.key === 'string' ? i.key : ''
    const date = typeof i.date === 'string' ? i.date.trim() : ''
    const checkNumber = typeof i.checkNumber === 'string' ? i.checkNumber.trim() : ''
    const payee = typeof i.payee === 'string' ? i.payee.trim() : ''
    const categoryId = typeof i.categoryId === 'string' ? i.categoryId.trim() : ''
    const amount = typeof i.amount === 'number' ? i.amount : Number(i.amount)
    if (!key || !date || !checkNumber || !payee || !categoryId || !Number.isFinite(amount)) continue
    out.push({ key, date, amount, checkNumber, payee, categoryId })
  }
  return out
}

// POST { transactions }                         -> preview of matches
// POST { apply: true, account, items, missing } -> mark matched checks cashed and add missing ones
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
      const missing = parseMissingItems(body.missing)
      if (items.length === 0 && missing.length === 0) {
        return NextResponse.json({ error: 'No checks selected.' }, { status: 400 })
      }
      const results = [
        ...(items.length ? await applyStatementChecks(items, account) : []),
        ...(missing.length ? await addMissingStatementChecks(missing, account) : [])
      ]
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
