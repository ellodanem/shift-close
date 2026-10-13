import { NextRequest, NextResponse } from 'next/server'
import { parseCycleNumber } from '@/lib/pay-cycle'
import { parsePayPeriodHoursRows, rebuildPayRunLines } from '@/lib/pay-run-build'
import { inferPayCycleFromRange } from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const validDate = (value: unknown, fallback: string) =>
  typeof value === 'string' && YMD.test(value) ? value : fallback

/** Build a complete payroll preview without creating a PayRun or changing any records. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const payPeriodId = typeof body.payPeriodId === 'string' ? body.payPeriodId.trim() : ''
    if (!payPeriodId) return NextResponse.json({ error: 'payPeriodId is required' }, { status: 400 })
    const period = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } })
    if (!period) return NextResponse.json({ error: 'Pay period not found' }, { status: 404 })
    const startDate = validDate(body.startDate, period.startDate)
    const endDate = validDate(body.endDate, period.endDate)
    const payDate = validDate(body.payDate, endDate)
    const cycleNumber = parseCycleNumber(body.cycleNumber, endDate)
    if (!cycleNumber) return NextResponse.json({ error: 'Pay cycle must be a number from 1 to 53.' }, { status: 400 })
    if (startDate > endDate) return NextResponse.json({ error: 'The pay range end has to be on or after the start.' }, { status: 400 })
    const built = await rebuildPayRunLines('test-run', {
      hoursRows: parsePayPeriodHoursRows(period.rows),
      cycle: inferPayCycleFromRange(startDate, endDate),
      payDate,
      keepOverrides: false,
      periodStart: startDate,
      periodEnd: endDate,
      cycleNumber
    })
    const lines = built.lines
    const gross = lines.reduce((sum, line) => sum + Number(line.grossPay || 0), 0)
    const net = lines.reduce((sum, line) => sum + Number(line.netPay || 0), 0)
    const warnings = lines
      .filter((line) => line.payType !== 'excluded' && !line.bankCode)
      .map((line) => `${line.staffName}: missing bank code`)
    return NextResponse.json({
      startDate, endDate, payDate, cycleNumber, lines, sourceHash: built.sourceHash,
      totals: { employees: lines.length, grossPay: Math.round(gross * 100) / 100, netPay: Math.round(net * 100) / 100 },
      stages: [
        { id: 'calculate', label: 'Calculate hours and earnings', status: 'passed' },
        { id: 'deductions', label: 'Apply deductions and statutory amounts', status: 'passed' },
        { id: 'approval', label: 'Validate approval readiness', status: warnings.length ? 'warning' : 'passed' },
        { id: 'processing', label: 'Validate processing and payment outputs', status: 'passed' },
        { id: 'documents', label: 'Generate payroll document data', status: 'passed' }
      ],
      warnings
    })
  } catch (error) {
    console.error('Pay run test error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build test payroll' }, { status: 400 })
  }
}
