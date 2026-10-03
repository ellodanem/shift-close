import { NextRequest, NextResponse } from 'next/server'
import { ReconcileInputError, finishReconciliation } from '@/lib/bank-reconcile-session'
import { canUseAccountingModule } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session || !canUseAccountingModule(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    return NextResponse.json(await finishReconciliation())
  } catch (error) {
    if (error instanceof ReconcileInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Finish reconciliation failed', error)
    return NextResponse.json({ error: 'Failed to finish reconciliation' }, { status: 500 })
  }
}
