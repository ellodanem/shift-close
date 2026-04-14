import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function badDate(date: string) {
  if (!DATE_RE.test(date)) return 'Invalid date'
  return null
}

/** PUT { waived: boolean, note?: string } — calendar-day “no security pickup” without a scan file. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params
    const err = badDate(date)
    if (err) return NextResponse.json({ error: err }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const waived = body?.waived === true
    const note = typeof body?.note === 'string' ? body.note : ''

    if (!waived) {
      await prisma.securityScanDayWaiver.deleteMany({ where: { date } })
      return NextResponse.json({ ok: true, waived: false, note: '' })
    }

    const row = await prisma.securityScanDayWaiver.upsert({
      where: { date },
      create: { date, note },
      update: { note }
    })
    return NextResponse.json({ ok: true, waived: true, note: row.note })
  } catch (e) {
    console.error('security-scan-waiver PUT', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
