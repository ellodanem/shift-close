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
      /** Debit rows: POS system debit + system credit (one scan often covers both). */
      systemDebit?: number
      systemCredit?: number
      scanUrls: string[]
      securitySlipUrl: string | null
      bankStatus: BankStatus
      notes: string
    }

    const rows: Row[] = []

    for (const s of shifts) {
      const amounts = parseDeposits(s.deposits)
      const depositScanUrls = parseUrlList(s.depositScanUrls)
      const debitScanUrls = parseUrlList(s.debitScanUrls)
      const systemDebit = Number(s.systemDebit) || 0
      const systemCredit = Number(s.systemCredit) || 0
      const debitCreditCombined = systemDebit + systemCredit

      for (let i = 0; i < amounts.length; i++) {
        const rec = recordByKey.get(recordKey(s.id, 'deposit', i))
        const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
        const notes = rec?.notes ?? ''
        const securitySlipUrl = rec?.securitySlipUrl ?? null

        if (hideCleared && bankStatus === 'cleared') continue
        if (statusFilter && statusFilter !== 'all' && bankStatus !== statusFilter) continue

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

      const showDebitRow = debitCreditCombined !== 0 || debitScanUrls.length > 0
      if (showDebitRow) {
        const rec = recordByKey.get(recordKey(s.id, 'debit', 0))
        const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
        const notes = rec?.notes ?? ''
        const securitySlipUrl = rec?.securitySlipUrl ?? null

        if (hideCleared && bankStatus === 'cleared') {
          /* skip */
        } else if (statusFilter && statusFilter !== 'all' && bankStatus !== statusFilter) {
          /* skip */
        } else {
          rows.push({
            shiftId: s.id,
            date: s.date,
            shift: s.shift,
            supervisor: s.supervisor,
            recordKind: 'debit',
            lineIndex: 0,
            amount: debitCreditCombined,
            systemDebit,
            systemCredit,
            scanUrls: debitScanUrls,
            securitySlipUrl,
            bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
            notes
          })
        }
      }
    }

    const totals = {
      count: rows.length,
      sumDeposits: rows.filter((r) => r.recordKind === 'deposit').reduce((a, r) => a + r.amount, 0),
      sumDebits: rows.filter((r) => r.recordKind === 'debit').reduce((a, r) => a + r.amount, 0),
      pending: rows.filter((r) => r.bankStatus === 'pending').length,
      cleared: rows.filter((r) => r.bankStatus === 'cleared').length,
      discrepancy: rows.filter((r) => r.bankStatus === 'discrepancy').length
    }

    return NextResponse.json({
      rows,
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

    if (recordKind === 'deposit') {
      const amounts = parseDeposits(shift.deposits)
      if (lineIndex >= amounts.length) {
        return NextResponse.json({ error: 'Invalid line index for this shift' }, { status: 400 })
      }
    } else {
      const debitScanUrls = parseUrlList(shift.debitScanUrls)
      const systemDebit = Number(shift.systemDebit) || 0
      const systemCredit = Number(shift.systemCredit) || 0
      const combined = systemDebit + systemCredit
      if (combined === 0 && debitScanUrls.length === 0) {
        return NextResponse.json(
          { error: 'No system debit/credit POS total or debit scans on this shift' },
          { status: 400 }
        )
      }
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
        shiftId_recordKind_lineIndex: { shiftId, recordKind, lineIndex }
      },
      create: {
        shiftId,
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
