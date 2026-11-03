import { NextRequest, NextResponse } from 'next/server'
import { isCashbookAccount } from '@/lib/cashbook-accounts'
import { confirmBackfilledAccounts, moveEntriesToAccount } from '@/lib/cashbook-account-db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/financial/cashbook/entries/move
 * { ids: string[], account: 'westline' | 'service_station', remember?: boolean }  move lines to an account
 * { ids: string[], confirm: true }                                                keep the guessed accounts
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      ids?: unknown
      account?: unknown
      remember?: unknown
      confirm?: unknown
    }
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Choose at least one entry' }, { status: 400 })
    }

    if (body.confirm === true) {
      const confirmed = await confirmBackfilledAccounts(ids)
      return NextResponse.json({ confirmed })
    }

    if (!isCashbookAccount(body.account)) {
      return NextResponse.json({ error: 'Choose Westline or Service Station' }, { status: 400 })
    }
    const result = await moveEntriesToAccount(ids, body.account, { remember: body.remember === true })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error moving cashbook entries:', error)
    return NextResponse.json({ error: 'Failed to move entries' }, { status: 500 })
  }
}
