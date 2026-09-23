import { NextRequest, NextResponse } from 'next/server'
import { parsePayPeriodHoursRows, rebuildPayRunLines } from '@/lib/pay-run-build'
import {
  computeGrossPay,
  parseExtraLines,
  parseMoney,
  parsePayType,
  payPeriodSourceHash,
  presentPayRunLine,
  serializePayRunLine
} from '@/lib/pay-run'
import { prisma } from '@/lib/prisma'
import { parsePayCycle } from '@/lib/pay-cycle'

export const dynamic = 'force-dynamic'

function presentRun<T extends { lines?: Array<{ extraLines: string }> }>(run: T) {
  if (!run.lines) return run
  return { ...run, lines: run.lines.map((line) => presentPayRunLine(line)) }
}

async function loadRun(id: string) {
  return prisma.payRun.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
  })
}

/** GET /api/pay-runs/:id */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await loadRun(id)
    if (!run) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })
    const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
    const currentHash = payPeriodSourceHash(hoursRows)
    return NextResponse.json({
      ...presentRun(run),
      hoursOutOfDate: run.status === 'draft' && run.sourceHash !== currentHash
    })
  } catch (error) {
    console.error('Pay run get error:', error)
    return NextResponse.json({ error: 'Failed to load pay run' }, { status: 500 })
  }
}

/** PATCH /api/pay-runs/:id — draft line edits, notes, or unlock */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await loadRun(id)
    if (!run) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    if (body.unlock === true) {
      const unlocked = await prisma.payRun.update({
        where: { id },
        data: { status: 'draft', processedAt: null },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
      })
      return NextResponse.json(presentRun(unlocked))
    }

    if (run.status !== 'draft') {
      return NextResponse.json({ error: 'This pay run is processed. Unlock it to edit.' }, { status: 409 })
    }

    if (typeof body.notes === 'string') {
      await prisma.payRun.update({ where: { id }, data: { notes: body.notes } })
    }

    if (body.line && typeof body.line === 'object') {
      const lineId = typeof body.line.id === 'string' ? body.line.id : ''
      const existing = run.lines.find((l) => l.id === lineId)
      if (!existing) {
        return NextResponse.json({ error: 'Pay run line not found' }, { status: 404 })
      }
      const extraLines = body.line.extraLines !== undefined ? parseExtraLines(body.line.extraLines) : parseExtraLines(existing.extraLines)
      const hourlyRate =
        body.line.hourlyRate !== undefined ? parseMoney(body.line.hourlyRate) : existing.hourlyRate
      const salariedAmount =
        body.line.salariedAmount !== undefined
          ? parseMoney(body.line.salariedAmount)
          : existing.salariedAmount
      const payType = parsePayType(body.line.payType ?? existing.payType)
      const pay = computeGrossPay({
        payType,
        basicHours: existing.basicHours,
        otHours: existing.otHours,
        hourlyRate,
        salariedAmount,
        extraLines
      })
      await prisma.payRunLine.update({
        where: { id: lineId },
        data: {
          payType,
          hourlyRate,
          salariedAmount,
          extraLines: JSON.stringify(extraLines),
          extraPay: pay.extraPay,
          basicPay: pay.basicPay,
          otPay: pay.otPay,
          grossPay: pay.grossPay
        }
      })
    }

    const updated = await loadRun(id)
    return NextResponse.json(presentRun(updated!))
  } catch (error) {
    console.error('Pay run patch error:', error)
    return NextResponse.json({ error: 'Failed to update pay run' }, { status: 500 })
  }
}

/** Recalc and process live on this route via action query? Separate routes below. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await loadRun(id)
    if (!run) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })
    const body = await request.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'recalc') {
      if (run.status !== 'draft') {
        return NextResponse.json({ error: 'Unlock the pay run before recalculating.' }, { status: 409 })
      }
      const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
      const built = await rebuildPayRunLines(id, {
        hoursRows,
        cycle: parsePayCycle(run.cycle),
        keepOverrides: true
      })
      const updated = await prisma.$transaction(async (tx) => {
        await tx.payRunLine.deleteMany({ where: { payRunId: id } })
        await tx.payRun.update({
          where: { id },
          data: {
            sourceHash: built.sourceHash,
            startDate: run.payPeriod.startDate,
            endDate: run.payPeriod.endDate,
            entityName: run.payPeriod.entityName,
            lines: { create: built.lines.map((line, i) => serializePayRunLine(line, i)) }
          }
        })
        return tx.payRun.findUnique({
          where: { id },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
        })
      })
      return NextResponse.json({ ...presentRun(updated!), hoursOutOfDate: false })
    }

    if (action === 'process') {
      if (run.status === 'processed') {
        return NextResponse.json(presentRun(run))
      }
      const processed = await prisma.payRun.update({
        where: { id },
        data: { status: 'processed', processedAt: new Date() },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
      })
      return NextResponse.json(presentRun(processed))
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Pay run action error:', error)
    return NextResponse.json({ error: 'Failed to update pay run' }, { status: 500 })
  }
}
