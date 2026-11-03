import { NextRequest, NextResponse } from 'next/server'
import { TaskError, setTaskStatus } from '@/lib/cashbook-task-db'

export const dynamic = 'force-dynamic'

/** PATCH { status: 'open' | 'done' | 'dismissed', resolution?: string }. A dismissal needs a reason. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}))
    const status = body?.status
    if (status !== 'open' && status !== 'done' && status !== 'dismissed') {
      return NextResponse.json({ error: 'status must be open, done or dismissed' }, { status: 400 })
    }
    const resolution = typeof body.resolution === 'string' ? body.resolution : ''
    return NextResponse.json({ task: await setTaskStatus(params.id, status, resolution) })
  } catch (error) {
    if (error instanceof TaskError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Failed to update cashbook task:', error)
    return NextResponse.json({ error: 'Failed to update the task' }, { status: 500 })
  }
}
