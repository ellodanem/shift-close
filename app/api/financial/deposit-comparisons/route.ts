import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BANK_STATUSES = ['pending', 'cleared', 'discrepancy'] as const
export type BankStatus = (typeof BANK_STATUSES)[number]

const RECORD_KINDS = ['deposit', 'debit'] as const
type RecordKind = (typeof RECORD_KINDS)[number]

const DEFAULT_SHIFT_TAKE = 600
const MAX_SHIFT_TAKE = 3000

function parseDeposits(raw: string): number[] {
  try {
    const arr = JSON.parse(raw || '[]')
    if (!Array.isArray(arr)) return []
    return arr.map((n) => (typeof n === 'number' && !Number.isNaN(n) ? n : Number(n))).filter((n) => !Number.isNaN(n))
  } catch {
    return []
  }
}

function parseUrlList(raw: string): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && u.length > 0) : []
  } catch {
    return []
  }
}

function recordKey(shiftId: string, recordKind: string, lineIndex: number): string {
  return `${shiftId}:${recordKind}:${lineIndex}`
}

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

    const recordByKey = new Map<string, (typeof shifts)[0]['depositRecords'][0]>()
    for (const s of shifts) {
      for (const r of s.depositRecords) {
        const k = r.recordKind || 'deposit'
        recordByKey.set(recordKey(s.id, k, r.lineIndex), r)
      }
    }

    type Row = {
      shiftId: string
      date: string
      shift: string
      supervisor: string
      recordKind: RecordKind
      lineIndex: number
      amount: number
      /** Debit rows: day-sheet Other Items — Debit line (systemDebit) + Credit line (otherCredit). */
      systemDebit?: number
      otherCredit?: number
      /** When recordKind is debit: sums all shifts that day; one reconciliation row per calendar day. */
      debitDayAggregate?: boolean
      contributingShifts?: Array<{ shiftId: string; shift: string }>
      scanUrls: string[]
      securitySlipUrl: string | null
      bankStatus: BankStatus
      notes: string
    }

    const rows: Row[] = []

    type DayDebitBucket = {
      date: string
      shifts: (typeof shifts)[0][]
      sumDebit: number
      sumOtherCredit: number
      scanUrls: string[]
    }
    const debitByDate = new Map<string, DayDebitBucket>()

    for (const s of shifts) {
      const amounts = parseDeposits(s.deposits)
      const depositScanUrls = parseUrlList(s.depositScanUrls)
      const debitScanUrls = parseUrlList(s.debitScanUrls)
      const daySheetDebit = Number(s.systemDebit) || 0
      const daySheetCredit = Number(s.otherCredit) || 0
      const debitCreditCombined = daySheetDebit + daySheetCredit

      for (let i = 0; i < amounts.length; i++) {
        const rec = recordByKey.get(recordKey(s.id, 'deposit', i))
        const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
        const notes = rec?.notes ?? ''
        const securitySlipUrl = rec?.securitySlipUrl ?? null

        rows.push({
          shiftId: s.id,
          date: s.date,
          shift: s.shift,
          supervisor: s.supervisor,
          recordKind: 'deposit',
          lineIndex: i,
          amount: amounts[i],
          scanUrls: depositScanUrls,
          securitySlipUrl,
          bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
          notes
        })
      }

      const showDebitForShift = debitCreditCombined !== 0 || debitScanUrls.length > 0
      if (showDebitForShift) {
        let bucket = debitByDate.get(s.date)
        if (!bucket) {
          bucket = { date: s.date, shifts: [], sumDebit: 0, sumOtherCredit: 0, scanUrls: [] }
          debitByDate.set(s.date, bucket)
        }
        bucket.shifts.push(s)
        bucket.sumDebit += daySheetDebit
        bucket.sumOtherCredit += daySheetCredit
        for (const u of debitScanUrls) {
          if (!bucket.scanUrls.includes(u)) bucket.scanUrls.push(u)
        }
      }
    }

    for (const bucket of debitByDate.values()) {
      bucket.shifts.sort((a, b) => a.shift.localeCompare(b.shift, undefined, { numeric: true }))
      const canonical = bucket.shifts[0]
      const combined = bucket.sumDebit + bucket.sumOtherCredit
      if (combined === 0 && bucket.scanUrls.length === 0) continue

      let rec = recordByKey.get(recordKey(canonical.id, 'debit', 0))
      if (!rec) {
        for (const s of bucket.shifts) {
          const r = recordByKey.get(recordKey(s.id, 'debit', 0))
          if (r) {
            rec = r
            break
          }
        }
      }

      const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
      const notes = rec?.notes ?? ''
      let securitySlipUrl: string | null = rec?.securitySlipUrl ?? null
      if (!securitySlipUrl) {
        for (const s of bucket.shifts) {
          const r = recordByKey.get(recordKey(s.id, 'debit', 0))
          if (r?.securitySlipUrl) {
            securitySlipUrl = r.securitySlipUrl
            break
          }
        }
      }

      rows.push({
        shiftId: canonical.id,
        date: bucket.date,
        shift: 'Day total',
        supervisor: bucket.shifts.map((x) => x.supervisor).filter(Boolean).join(' · ') || '—',
        recordKind: 'debit',
        lineIndex: 0,
        amount: combined,
        systemDebit: bucket.sumDebit,
        otherCredit: bucket.sumOtherCredit,
        debitDayAggregate: true,
        contributingShifts: bucket.shifts.map((x) => ({ shiftId: x.id, shift: x.shift })),
        scanUrls: bucket.scanUrls,
        securitySlipUrl,
        bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
        notes
      })
    }

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
