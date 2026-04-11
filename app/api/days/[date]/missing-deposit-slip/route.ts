import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  parseSelectionsJson,
  validateSelections,
  type DepositSlipSelection
} from '@/lib/missing-deposit-slip-alert'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function badDate(date: string) {
  if (!DATE_RE.test(date)) return 'Invalid date'
  return null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params
    const err = badDate(date)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const alert = await prisma.missingDepositSlipAlert.findUnique({ where: { date } })
    if (!alert) {
      return NextResponse.json({
        alert: null
      })
    }
    const selections = parseSelectionsJson(alert.selectionsJson)
    return NextResponse.json({
      alert: {
        open: alert.open,
        selections,
        note: alert.note,
        firstNotifySentAt: alert.firstNotifySentAt?.toISOString() ?? null,
        lastNotifySentAt: alert.lastNotifySentAt?.toISOString() ?? null,
        lastEmailError: alert.lastEmailError
      }
    })
  } catch (e) {
    console.error('missing-deposit-slip GET', e)
    return NextResponse.json({ error: 'Failed to load alert' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params
    const err = badDate(date)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const body = (await request.json()) as {
      open?: boolean
      selections?: DepositSlipSelection[]
      note?: string
    }

    const open = body.open !== false
    const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : ''
    const selections = Array.isArray(body.selections) ? body.selections : []

    const shifts = await prisma.shiftClose.findMany({
      where: { date },
      select: { id: true, deposits: true, shift: true, supervisor: true }
    })

    if (shifts.length === 0) {
      return NextResponse.json({ error: 'No shifts for this date' }, { status: 404 })
    }

    if (open && selections.length === 0) {
      return NextResponse.json(
        { error: 'When the alert is open, select at least one deposit line (or turn the alert off).' },
        { status: 400 }
      )
    }

    const validated = validateSelections(shifts, selections)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const selectionsJson = JSON.stringify(
      validated.rows.map((r) => ({ shiftId: r.shiftId, lineIndex: r.lineIndex, amount: r.amount }))
    )

    const saved = await prisma.missingDepositSlipAlert.upsert({
      where: { date },
      create: {
        date,
        open,
        selectionsJson,
        note,
        lastEmailError: null
      },
      update: {
        open,
        selectionsJson,
        note,
        lastEmailError: null
      }
    })

    const selOut = parseSelectionsJson(saved.selectionsJson)
    return NextResponse.json({
      alert: {
        open: saved.open,
        selections: selOut,
        note: saved.note,
        firstNotifySentAt: saved.firstNotifySentAt?.toISOString() ?? null,
        lastNotifySentAt: saved.lastNotifySentAt?.toISOString() ?? null,
        lastEmailError: saved.lastEmailError
      }
    })
  } catch (e) {
    console.error('missing-deposit-slip PUT', e)
    return NextResponse.json({ error: 'Failed to save alert' }, { status: 500 })
  }
}
