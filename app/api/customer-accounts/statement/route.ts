import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAccountStatement,
  listCustomerAccountNames,
  type StatementMode
} from '@/lib/customer-statement'

function parseDateParam(value: string | null): string | null {
  if (!value?.trim()) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null
}

// GET /api/customer-accounts/statement?list=accounts
// GET /api/customer-accounts/statement?account=&startDate=&endDate=&mode=summary|detail
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    if (searchParams.get('list') === 'accounts') {
      const accounts = await listCustomerAccountNames()
      return NextResponse.json({ accounts })
    }

    const account = searchParams.get('account')?.trim()
    const startDate = parseDateParam(searchParams.get('startDate'))
    const endDate = parseDateParam(searchParams.get('endDate'))
    const modeParam = searchParams.get('mode')
    const mode: StatementMode = modeParam === 'detail' ? 'detail' : 'summary'
    const openingParam = searchParams.get('opening')
    const openingOverride =
      openingParam != null && openingParam !== ''
        ? Number(openingParam)
        : null

    if (!account || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'account, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'startDate must be on or before endDate' },
        { status: 400 }
      )
    }

    const statement = await fetchAccountStatement(
      account,
      startDate,
      endDate,
      mode,
      openingOverride != null && !Number.isNaN(openingOverride)
        ? openingOverride
        : null
    )

    return NextResponse.json(statement)
  } catch (error) {
    console.error('Error fetching customer statement:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer statement' },
      { status: 500 }
    )
  }
}
