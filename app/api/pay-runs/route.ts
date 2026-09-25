import { NextRequest, NextResponse } from 'next/server'
import { parsePayCycle } from '@/lib/pay-cycle'
import { loadPayRunStaffProfiles, parsePayPeriodHoursRows, rebuildPayRunLines } from '@/lib/pay-run-build'
import { inferPayRunCycle, presentPayRunLine, serializePayRunLine } from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'

const YMD = /^\d{4}-\d{2}-\d{2}$/

function ymdOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && YMD.test(value) ? value : fallback
}

export const dynamic = 'force-dynamic'

function presentRun<
  T extends {
    lines?: Array<{ extraLines: string }>
  }
>(run: T) {
  if (!run.lines) return run
  return {
    ...run,
    lines: run.lines.map((line) => presentPayRunLine(line))
  }
}

/** GET /api/pay-runs — list gross pay runs */
export async function GET() {
  try {
    const runs = await prisma.payRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        payPeriod: { select: { id: true, startDate: true, endDate: true } },
        lines: { select: { extraLines: true, extraPay: true, extraDeductions: true, extraDeductionPay: true, grossPay: true, nisEmployee: true, nisEmployer: true, netPay: true } },
        _count: { select: { lines: true } }
      }
    })
    return NextResponse.json(runs.map((run) => presentRun(run)))
  } catch (error) {
    console.error('Pay run list error:', error)
    return NextResponse.json({ error: 'Failed to list pay runs' }, { status: 500 })
  }
}

/** POST /api/pay-runs — create or open the run for a saved pay period + cycle */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const payPeriodId = typeof body.payPeriodId === 'string' ? body.payPeriodId.trim() : ''
    if (!payPeriodId) {
      return NextResponse.json({ error: 'payPeriodId is required' }, { status: 400 })
    }

    const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } })
    if (!period) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    }

    const hoursRows = parsePayPeriodHoursRows(period.rows)
    const staffProfiles = body.cycle ? [] : await loadPayRunStaffProfiles()
    const cycle = parsePayCycle(
      body.cycle ??
        inferPayRunCycle(period.startDate, period.endDate, hoursRows, staffProfiles)
    )
    const existing = await prisma.payRun.findFirst({
      where: { payPeriodId, cycle, status: { in: ['draft', 'processed'] } },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
    })
    if (existing) {
      return NextResponse.json(presentRun(existing))
    }
    const built = await rebuildPayRunLines('new', {
      hoursRows,
      cycle,
      payDate: period.endDate,
      keepOverrides: false
    })

    const run = await prisma.payRun.create({
      data: {
        payPeriodId,
        cycle,
        status: 'draft',
        payDate: ymdOr(body.payDate, period.endDate),
        startDate: ymdOr(body.startDate, period.startDate),
        endDate: ymdOr(body.endDate, period.endDate),
        entityName: period.entityName,
        notes: '',
        sourceHash: built.sourceHash,
        lines: {
          create: built.lines.map((line, i) => serializePayRunLine(line, i))
        }
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
    })

    return NextResponse.json(presentRun(run), { status: 201 })
  } catch (error) {
    console.error('Pay run create error:', error)
    return NextResponse.json({ error: 'Failed to create pay run' }, { status: 500 })
  }
}
