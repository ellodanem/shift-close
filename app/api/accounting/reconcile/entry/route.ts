import { NextRequest, NextResponse } from 'next/server'
import { ReconcileInputError, addStatementLine } from '@/lib/bank-reconcile-session'
import { canUseAccountingModule } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canUseAccountingModule(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    return NextResponse.json(await addStatementLine(body))
  } catch (error) {
    if (error instanceof ReconcileInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Reconcile entry failed', error)
    return NextResponse.json({ error: 'Failed to add the line' }, { status: 500 })
  }
}
