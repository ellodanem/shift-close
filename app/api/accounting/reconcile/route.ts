import { NextRequest, NextResponse } from 'next/server'
import {
  ReconcileInputError,
  loadReconcileView,
  setLineCleared,
  startReconciliation,
  updateReconciliation
} from '@/lib/bank-reconcile-session'
import { canUseAccountingModule } from '@/lib/roles'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

async function allowed(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return Boolean(session && canUseAccountingModule(session.role))
}

function jsonError(error: unknown, fallback: string) {
  if (error instanceof ReconcileInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.error(fallback, error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await loadReconcileView())
  } catch (error) {
    return jsonError(error, 'Failed to load reconciliation')
  }
}

export async function POST(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    return NextResponse.json(await startReconciliation(body))
  } catch (error) {
    return jsonError(error, 'Failed to start reconciliation')
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await request.json()
    if (body && typeof body === 'object' && 'cashbookEntryId' in body) {
      return NextResponse.json(await setLineCleared(body.cashbookEntryId, body.cleared))
    }
    return NextResponse.json(await updateReconciliation(body))
  } catch (error) {
    return jsonError(error, 'Failed to update reconciliation')
  }
}
