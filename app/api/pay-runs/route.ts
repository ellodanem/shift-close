import { NextRequest, NextResponse } from 'next/server'
import { parseCycleNumber } from '@/lib/pay-cycle'
import { parsePayPeriodHoursRows, rebuildPayRunLines, updatePayRunSchedule } from '@/lib/pay-run-build'
import { inferPayCycleFromRange, presentPayRunLine, serializePayRunLine } from '@/lib/pay-run'
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

/** POST /api/pay-runs — create or open the payroll for a saved attendance period. */
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

    const startDate = ymdOr(body.startDate, period.startDate)
    const endDate = ymdOr(body.endDate, period.endDate)
    const payDate = ymdOr(body.payDate, endDate)
    const cycleNumber = parseCycleNumber(body.cycleNumber, endDate)
    if (!cycleNumber) {
      return NextResponse.json({ error: 'Pay cycle must be a number from 1 to 53.' }, { status: 400 })
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'The pay range end has to be on or after the start.' }, { status: 400 })
    }

    const hoursRows = parsePayPeriodHoursRows(period.rows)
    const cycle = inferPayCycleFromRange(startDate, endDate)
    const existing = await prisma.payRun.findFirst({
      where: { payPeriodId, status: { in: ['draft', 'processed'] } },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
    })
    if (existing?.status === 'processed') {
      return NextResponse.json(presentRun(existing))
    }
    if (existing) {
      await updatePayRunSchedule(existing.id, { startDate, endDate, payDate, cycleNumber })
      const refreshed = await prisma.payRun.findUnique({
        where: { id: existing.id },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
      })
      return NextResponse.json(presentRun(refreshed!))
    }
    const built = await rebuildPayRunLines('new', {
      hoursRows,
      cycle,
      payDate,
      keepOverrides: false
    })

    const run = await prisma.payRun.create({
      data: {
        payPeriodId,
        cycle,
        cycleNumber,
        status: 'draft',
        payDate,
        startDate,
        endDate,
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
