import { NextRequest, NextResponse } from 'next/server'
import { listTasks, listUploads, taskCounts } from '@/lib/cashbook-task-db'

export const dynamic = 'force-dynamic'

/** GET /api/financial/cashbook/tasks?status=open|done|dismissed&account=westline|service_station */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const status = params.get('status') || undefined
    const account = params.get('account') || undefined
    const [tasks, counts, uploads] = await Promise.all([
      listTasks({ status, account }),
      taskCounts(),
      listUploads()
    ])
    return NextResponse.json({ tasks, counts, uploads })
  } catch (error) {
    console.error('Failed to load cashbook tasks:', error)
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 })
  }
}
