import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const BANK_STATUSES = ['pending', 'cleared', 'discrepancy'] as const
export type BankStatus = (typeof BANK_STATUSES)[number]

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

/**
 * GET /api/financial/deposit-comparisons?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending|cleared|discrepancy
 * Lists each deposit line from shift closes with reconciliation data.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const statusFilter = searchParams.get('status')

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
      include: {
        depositRecords: true
      }
    })

    const recordByKey = new Map<string, (typeof shifts)[0]['depositRecords'][0]>()
    for (const s of shifts) {
      for (const r of s.depositRecords) {
        recordByKey.set(`${s.id}:${r.lineIndex}`, r)
      }
    }

    type Row = {
      shiftId: string
      date: string
      shift: string
      supervisor: string
      lineIndex: number
      amount: number
      depositScanUrls: string[]
      securitySlipUrl: string | null
      bankStatus: BankStatus
      notes: string
    }

    const rows: Row[] = []

    for (const s of shifts) {
      const amounts = parseDeposits(s.deposits)
      const depositScanUrls = parseUrlList(s.depositScanUrls)
      for (let i = 0; i < amounts.length; i++) {
        const rec = recordByKey.get(`${s.id}:${i}`)
        const bankStatus = (rec?.bankStatus as BankStatus) || 'pending'
        const notes = rec?.notes ?? ''
        const securitySlipUrl = rec?.securitySlipUrl ?? null

        if (statusFilter && statusFilter !== 'all' && bankStatus !== statusFilter) {
          continue
        }

        rows.push({
          shiftId: s.id,
          date: s.date,
          shift: s.shift,
          supervisor: s.supervisor,
          lineIndex: i,
          amount: amounts[i],
          depositScanUrls,
          securitySlipUrl,
          bankStatus: BANK_STATUSES.includes(bankStatus as BankStatus) ? bankStatus : 'pending',
          notes
        })
      }
    }

    const totals = {
      count: rows.length,
      sumAmount: rows.reduce((a, r) => a + r.amount, 0),
      pending: rows.filter((r) => r.bankStatus === 'pending').length,
      cleared: rows.filter((r) => r.bankStatus === 'cleared').length,
      discrepancy: rows.filter((r) => r.bankStatus === 'discrepancy').length
    }

    return NextResponse.json({ rows, totals })
  } catch (e) {
    console.error('deposit-comparisons GET', e)
    return NextResponse.json({ error: 'Failed to load deposit comparisons' }, { status: 500 })
  }
}

/**
 * PATCH /api/financial/deposit-comparisons
 * Body: { shiftId, lineIndex, bankStatus?, notes?, securitySlipUrl? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const shiftId = typeof body.shiftId === 'string' ? body.shiftId : ''
    const lineIndex = typeof body.lineIndex === 'number' ? body.lineIndex : parseInt(String(body.lineIndex), 10)
    if (!shiftId || !Number.isFinite(lineIndex) || lineIndex < 0) {
      return NextResponse.json({ error: 'shiftId and lineIndex required' }, { status: 400 })
    }

    const shift = await prisma.shiftClose.findUnique({ where: { id: shiftId } })
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    }

    const amounts = parseDeposits(shift.deposits)
    if (lineIndex >= amounts.length) {
      return NextResponse.json({ error: 'Invalid line index for this shift' }, { status: 400 })
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
        shiftId_lineIndex: { shiftId, lineIndex }
      },
      create: {
        shiftId,
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
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
