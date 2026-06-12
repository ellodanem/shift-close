import { NextRequest, NextResponse } from 'next/server'
import { canAcknowledgeWeeklyChecklist } from '@/lib/operations-checklist-access'
import type { ChecklistAckKind } from '@/lib/operations-checklist-types'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/session'

const ALLOWED_KINDS: ChecklistAckKind[] = ['started', 'complete', 'snooze', 'waive']
const WEEKLY_TASKS = new Set(['customer-accounts', 'vendor-invoices'])

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!canAcknowledgeWeeklyChecklist({ role: session.role, isSuperAdmin: session.isSuperAdmin })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
    const weekKey = typeof body.weekKey === 'string' ? body.weekKey.trim() : ''
    const kind = typeof body.kind === 'string' ? body.kind.trim() : ''
    const note = typeof body.note === 'string' ? body.note.trim() : null

    if (!taskId || !weekKey || !ALLOWED_KINDS.includes(kind as ChecklistAckKind)) {
      return NextResponse.json({ error: 'taskId, weekKey, and valid kind are required' }, { status: 400 })
    }
    if (!WEEKLY_TASKS.has(taskId)) {
      return NextResponse.json({ error: 'Only weekly tasks support acknowledgements' }, { status: 400 })
    }

    const row = await prisma.checklistAcknowledgement.upsert({
      where: {
        checklist_ack_task_week_kind: {
          taskId,
          weekKey,
          kind
        }
      },
      create: {
        taskId,
        weekKey,
        kind,
        note,
        userId: session.userId
      },
      update: {
        note,
        userId: session.userId
      }
    })

    return NextResponse.json({ ok: true, acknowledgement: row })
  } catch (error) {
    console.error('operations-checklist ack POST', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save acknowledgement' },
      { status: 500 }
    )
  }
}
