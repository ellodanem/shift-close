import { NextRequest, NextResponse } from 'next/server'
import {
  attachBankingToLines,
  loadNisTakenByStaffId,
  parsePayPeriodHoursRows,
  rebuildPayRunLines,
  syncDraftPayTypes
} from '@/lib/pay-run-build'
import { computePayRunDeductions } from '@/lib/pay-run-deductions'
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

async function presentRun<T extends { extraDisbursements?: string; lines?: Array<{ extraLines: string; extraDeductions?: string; staffId?: string | null; bankCode?: string; accountNo?: string | null }> }>(run: T) {
  const lines = run.lines ?? []
  const staffIds = lines.map((line) => line.staffId).filter((id): id is string => Boolean(id))
  const staff =
    staffIds.length > 0
      ? await prisma.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, bankName: true, accountNumber: true }
        })
      : []
  const staffById = new Map(staff.map((s) => [s.id, s]))
  return {
    ...run,
    extraDisbursements: parseExtraLines(run.extraDisbursements ?? '[]'),
    lines: attachBankingToLines(lines.map((line) => presentPayRunLine(line)), staffById)
  }
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
    const loaded = await loadRun(id)
    if (!loaded) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })
    if (loaded.status === 'draft') await syncDraftPayTypes(id)
    const run = loaded.status === 'draft' ? await loadRun(id) : loaded
    if (!run) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 })
    const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
    const currentHash = payPeriodSourceHash(hoursRows)
    return NextResponse.json({
      ...(await presentRun(run)),
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
      return NextResponse.json(await presentRun(unlocked))
    }

    if (run.status !== 'draft') {
      return NextResponse.json({ error: 'This pay run is processed. Unlock it to edit.' }, { status: 409 })
    }

    if (typeof body.notes === 'string') {
      await prisma.payRun.update({ where: { id }, data: { notes: body.notes } })
    }

    if (body.extraDisbursements !== undefined) {
      await prisma.payRun.update({
        where: { id },
        data: { extraDisbursements: JSON.stringify(parseExtraLines(body.extraDisbursements)) }
      })
    }

    const YMD = /^\d{4}-\d{2}-\d{2}$/
    const header: { payDate?: string; startDate?: string; endDate?: string } = {}
    if (typeof body.payDate === 'string' && YMD.test(body.payDate)) header.payDate = body.payDate
    if (typeof body.startDate === 'string' && YMD.test(body.startDate)) header.startDate = body.startDate
    if (typeof body.endDate === 'string' && YMD.test(body.endDate)) header.endDate = body.endDate
    if (Object.keys(header).length > 0) {
      await prisma.payRun.update({ where: { id }, data: header })
    }
    const payDate = header.payDate ?? run.payDate

    const linePatches = Array.isArray(body.lines)
      ? body.lines
      : body.line && typeof body.line === 'object'
        ? [body.line]
        : []
    for (const lineBody of linePatches) {
      if (!lineBody || typeof lineBody !== 'object') continue
      const lineId = typeof lineBody.id === 'string' ? lineBody.id : ''
      const existing = run.lines.find((l) => l.id === lineId)
      if (!existing) {
        return NextResponse.json({ error: 'Pay run line not found' }, { status: 404 })
      }
      const extraLines =
        lineBody.extraLines !== undefined ? parseExtraLines(lineBody.extraLines) : parseExtraLines(existing.extraLines)
      const extraDeductions =
        lineBody.extraDeductions !== undefined
          ? parseExtraLines(lineBody.extraDeductions)
          : parseExtraLines(existing.extraDeductions)
      const hourlyRate =
        lineBody.hourlyRate !== undefined ? parseMoney(lineBody.hourlyRate) : existing.hourlyRate
      const salariedAmount =
        lineBody.salariedAmount !== undefined
          ? parseMoney(lineBody.salariedAmount)
          : existing.salariedAmount
      const staffLoan = lineBody.staffLoan !== undefined ? parseMoney(lineBody.staffLoan) : existing.staffLoan
      const medical = lineBody.medical !== undefined ? parseMoney(lineBody.medical) : existing.medical
      const shortageReady =
        lineBody.shortageReady !== undefined ? parseMoney(lineBody.shortageReady) : existing.shortageReady
      const payType = parsePayType(lineBody.payType ?? existing.payType)
      const taxCode =
        typeof lineBody.taxCode === 'string' ? lineBody.taxCode.trim() : existing.taxCode
      const basicHours =
        lineBody.basicHours !== undefined ? parseMoney(lineBody.basicHours) : existing.basicHours
      const otHours = lineBody.otHours !== undefined ? parseMoney(lineBody.otHours) : existing.otHours
      const pay = computeGrossPay({
        payType,
        basicHours,
        otHours,
        hourlyRate,
        salariedAmount,
        extraLines
      })
      const nisTaken = existing.staffId
        ? (await loadNisTakenByStaffId(payDate, id))[existing.staffId]
        : undefined
      const deducted = computePayRunDeductions({
        grossPay: pay.grossPay,
        staffLoan,
        medical,
        shortage: shortageReady,
        extraDeductions,
        nisEmployeeTaken: nisTaken?.employee,
        nisEmployerTaken: nisTaken?.employer
      })
      await prisma.payRunLine.update({
        where: { id: lineId },
        data: {
          payType,
          transTtl: payType === 'salaried' ? existing.transTtl : parseMoney(basicHours + otHours),
          basicHours: payType === 'salaried' ? 0 : basicHours,
          otHours: payType === 'salaried' ? 0 : otHours,
          hourlyRate,
          salariedAmount,
          extraLines: JSON.stringify(extraLines),
          extraPay: pay.extraPay,
          extraDeductions: JSON.stringify(deducted.extraDeductions),
          extraDeductionPay: deducted.extraDeductionPay,
          basicPay: pay.basicPay,
          otPay: pay.otPay,
          grossPay: pay.grossPay,
          shortageReady: deducted.shortage,
          nisEmployee: deducted.nisEmployee,
          nisEmployer: deducted.nisEmployer,
          staffLoan: deducted.staffLoan,
          medical: deducted.medical,
          totalDeductions: deducted.totalDeductions,
          netPay: deducted.netPay,
          taxCode
        }
      })
    }

    const updated = await loadRun(id)
    return NextResponse.json(await presentRun(updated!))
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
        payDate: run.payDate,
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
      return NextResponse.json({ ...(await presentRun(updated!)), hoursOutOfDate: false })
    }

    if (action === 'approve') {
      if (run.status === 'processed') {
        return NextResponse.json(await presentRun(run))
      }
      const processed = await prisma.payRun.update({
        where: { id },
        data: { status: 'processed', processedAt: new Date() },
        include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
      })
      return NextResponse.json(await presentRun(processed))
    }

    if (action === 'process') {
      if (run.status === 'processed') {
        return NextResponse.json(await presentRun(run))
      }
      const hoursRows = parsePayPeriodHoursRows(run.payPeriod.rows)
      const built = await rebuildPayRunLines(id, {
        hoursRows,
        cycle: parsePayCycle(run.cycle),
        payDate: run.payDate,
        keepOverrides: true
      })
      const processed = await prisma.$transaction(async (tx) => {
        await tx.payRunLine.deleteMany({ where: { payRunId: id } })
        return tx.payRun.update({
          where: { id },
          data: {
            status: 'processed',
            processedAt: new Date(),
            sourceHash: built.sourceHash,
            startDate: run.payPeriod.startDate,
            endDate: run.payPeriod.endDate,
            entityName: run.payPeriod.entityName,
            lines: { create: built.lines.map((line, i) => serializePayRunLine(line, i)) }
          },
          include: { lines: { orderBy: { sortOrder: 'asc' } }, payPeriod: true }
        })
      })
      return NextResponse.json(await presentRun(processed))
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Pay run action error:', error)
    return NextResponse.json({ error: 'Failed to update pay run' }, { status: 500 })
  }
}
