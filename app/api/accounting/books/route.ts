import { NextRequest, NextResponse } from 'next/server'
import { buildAccountingBooks } from '@/lib/accounting-books'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { canUseAccountingModule } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canUseAccountingModule(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const month = request.nextUrl.searchParams.get('month')?.trim() || businessTodayYmd().slice(0, 7)
  try {
    const books = await buildAccountingBooks(month)
    if (!books) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    return NextResponse.json(books)
  } catch (error) {
    console.error('Accounting books failed', error)
    return NextResponse.json({ error: 'Failed to load accounting books' }, { status: 500 })
  }
}
