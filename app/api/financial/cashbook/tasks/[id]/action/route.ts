import { NextRequest, NextResponse } from 'next/server'
import { TransferInputError } from '@/lib/cashbook-transfer'
import { TaskError, createFromTask, moveFromTask } from '@/lib/cashbook-task-db'

export const dynamic = 'force-dynamic'

/**
 * POST { action: 'create' | 'move' }
 *   create  one-click entry for bank-originated items (fees, charges, transfers)
 *   move    put a wrong-account entry on the account the sheet shows
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action === 'create') return NextResponse.json({ task: await createFromTask(params.id) })
    if (body?.action === 'move') return NextResponse.json({ task: await moveFromTask(params.id) })
    return NextResponse.json({ error: 'action must be create or move' }, { status: 400 })
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof TransferInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Cashbook task action failed:', error)
    return NextResponse.json({ error: 'Failed to run that action' }, { status: 500 })
  }
}
