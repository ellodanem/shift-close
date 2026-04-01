import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  BANK_STATUSES,
  buildComparisonRowsFromShifts,
  parseDeposits,
  parseUrlList,
  recordKey,
  type BankStatus,
  type RecordKind
} from '@/lib/deposit-comparison-rows'

export const dynamic = 'force-dynamic'

export type { BankStatus }

const DEFAULT_SHIFT_TAKE = 600
const MAX_SHIFT_TAKE = 3000

/**
 * GET ?status= &: optional from,to; hideCleared=true; shiftLimit= (default 600, max 3000)
 * No from/to = most recent shifts first (by shift close date), capped by shiftLimit.
 * hideCleared: omit entire calendar days where every deposit line and the day debit row are cleared
 * (pending or discrepancy on any line keeps the day visible). Applied before status filter.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const statusFilter = searchParams.get('status')
    const hideCleared = searchParams.get('hideCleared') === 'true'
    const shiftLimitRaw = searchParams.get('shiftLimit')
    const shiftTake = Math.min(
      MAX_SHIFT_TAKE,
      Math.max(1, parseInt(shiftLimitRaw || String(DEFAULT_SHIFT_TAKE), 10) || DEFAULT_SHIFT_TAKE)
    )

    const where: {
      status: { in: string[] }
      date?: { gte?: string; lte?: string }
    } = {
      status: { in: ['closed', 'reviewed'] }
    }
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = from
      if (to) where.date.lte = to
    }

    const shifts = await prisma.shiftClose.findMany({
      where,
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      take: shiftTake,
      include: {
        depositRecords: true
      }
    })

    const rows = buildComparisonRowsFromShifts(shifts)

    let outRows = rows
    if (hideCleared) {
      const byDate = new Map<string, typeof rows>()
      for (const r of outRows) {
        if (!byDate.has(r.date)) byDate.set(r.date, [])
        byDate.get(r.date)!.push(r)
      }
      const dropDates = new Set<string>()
      for (const [date, list] of byDate) {
        if (list.length > 0 && list.every((x) => x.bankStatus === 'cleared')) {
          dropDates.add(date)
        }
      }
      if (dropDates.size > 0) {
        outRows = outRows.filter((r) => !dropDates.has(r.date))
      }
    }
    if (statusFilter && statusFilter !== 'all') {
      outRows = outRows.filter((r) => r.bankStatus === statusFilter)
    }

    const totals = {
      count: outRows.length,
      sumDeposits: outRows.filter((r) => r.recordKind === 'deposit').reduce((a, r) => a + r.amount, 0),
      sumDebits: outRows.filter((r) => r.recordKind === 'debit').reduce((a, r) => a + r.amount, 0),
      pending: outRows.filter((r) => r.bankStatus === 'pending').length,
      cleared: outRows.filter((r) => r.bankStatus === 'cleared').length,
      discrepancy: outRows.filter((r) => r.bankStatus === 'discrepancy').length
    }

    return NextResponse.json({
      rows: outRows,
      totals,
      meta: {
        shiftCount: shifts.length,
        shiftTake,
        truncated: shifts.length >= shiftTake,
        dateFiltered: Boolean(from || to)
      }
    })
  } catch (e) {
    console.error('deposit-comparisons GET', e)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'Deposit comparisons need the deposit_records table. On the server run: npx prisma migrate deploy (or prisma migrate dev locally), then redeploy if needed.'
        },
        { status: 503 }
      )
    }
    const hint =
      process.env.NODE_ENV === 'development' && e instanceof Error ? ` (${e.message})` : ''
    return NextResponse.json({ error: `Failed to load deposit comparisons${hint}` }, { status: 500 })
  }
}

/**
 * PATCH body: { shiftId, recordKind?: deposit|debit, lineIndex, bankStatus?, notes?, securitySlipUrl? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const shiftId = typeof body.shiftId === 'string' ? body.shiftId : ''
    const lineIndex = typeof body.lineIndex === 'number' ? body.lineIndex : parseInt(String(body.lineIndex), 10)
    const recordKind: RecordKind = body.recordKind === 'debit' ? 'debit' : 'deposit'

    if (!shiftId || !Number.isFinite(lineIndex) || lineIndex < 0) {
      return NextResponse.json({ error: 'shiftId and lineIndex required' }, { status: 400 })
    }

    if (recordKind === 'debit' && lineIndex !== 0) {
      return NextResponse.json({ error: 'Debit reconciliation uses lineIndex 0' }, { status: 400 })
    }

    const shift = await prisma.shiftClose.findUnique({ where: { id: shiftId } })
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    let upsertShiftId = shiftId

    if (recordKind === 'deposit') {
      const amounts = parseDeposits(shift.deposits)
      if (lineIndex >= amounts.length) {
        return NextResponse.json({ error: 'Invalid line index for this shift' }, { status: 400 })
      }
    } else {
      /** One debit reconciliation per calendar day; stored on canonical shift (first by shift label, numeric-aware). */
      const sameDay = await prisma.shiftClose.findMany({
        where: { date: shift.date, status: { in: ['closed', 'reviewed'] } }
      })
      sameDay.sort((a, b) => a.shift.localeCompare(b.shift, undefined, { numeric: true }))
      const canonical = sameDay[0]
      if (!canonical) {
        return NextResponse.json({ error: 'No shifts for this date' }, { status: 400 })
      }
      let sumDebit = 0
      let sumOtherCredit = 0
      let anyDebitScan = false
      for (const s of sameDay) {
        sumDebit += Number(s.systemDebit) || 0
        sumOtherCredit += Number(s.otherCredit) || 0
        if (parseUrlList(s.debitScanUrls).length > 0) anyDebitScan = true
      }
      const combined = sumDebit + sumOtherCredit
      if (combined === 0 && !anyDebitScan) {
        return NextResponse.json(
          { error: 'No day-sheet credit/debit totals or debit scans for this calendar day' },
          { status: 400 }
        )
      }
      upsertShiftId = canonical.id
    }

    const data: {
      bankStatus?: string
      notes?: string
      securitySlipUrl?: string | null
    } = {}

    if (body.bankStatus !== undefined) {
      const s = String(body.bankStatus)
      if (!BANK_STATUSES.includes(s as BankStatus)) {
        return NextResponse.json({ error: 'Invalid bankStatus' }, { status: 400 })
      }
      data.bankStatus = s
    }
    if (body.notes !== undefined) {
      data.notes = String(body.notes).slice(0, 4000)
    }
    if (body.securitySlipUrl !== undefined) {
      const u = body.securitySlipUrl
      data.securitySlipUrl = u === null || u === '' ? null : String(u).slice(0, 2048)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await prisma.depositRecord.upsert({
      where: {
        shiftId_recordKind_lineIndex: { shiftId: upsertShiftId, recordKind, lineIndex }
      },
      create: {
        shiftId: upsertShiftId,
        recordKind,
        lineIndex,
        bankStatus: data.bankStatus ?? 'pending',
        notes: data.notes ?? '',
        securitySlipUrl: data.securitySlipUrl ?? null
      },
      update: data
    })

    return NextResponse.json(updated)
  } catch (e) {
    console.error('deposit-comparisons PATCH', e)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'deposit_records table is missing. Run database migrations (prisma migrate deploy) before saving.'
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
