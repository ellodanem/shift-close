import { NextRequest, NextResponse } from 'next/server'
import { parseExpectedPunchesPerDay } from '@/lib/attendance-irregularity'
import {
  getPresentAbsenceSettings,
  PRESENT_ABSENCE_ENABLED_KEY,
  PRESENT_ABSENCE_LATE_MINUTES_KEY,
  PRESENT_ABSENCE_ABSENT_MINUTES_KEY,
  clampLateAbsentMinutes,
  PRESENT_ABSENCE_NOTIFY_EMAIL_KEY,
  PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY,
  PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY,
  PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY
} from '@/lib/present-absence'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const KEY = 'attendance_expected_punches_per_day'
const SHOW_EXTRACTED_KEY = 'attendance_show_extracted_punches'

function parseShowExtracted(v: string | undefined): boolean {
  return v === 'true' || v === '1'
}

async function readAll() {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: [KEY, SHOW_EXTRACTED_KEY] } }
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const pa = await getPresentAbsenceSettings()
  return {
    expectedPunchesPerDay: parseExpectedPunchesPerDay(map.get(KEY)),
    showExtractedPunches: parseShowExtracted(map.get(SHOW_EXTRACTED_KEY)),
    presentAbsenceEnabled: pa.enabled,
    graceMinutes: pa.lateMinutes,
    lateMinutes: pa.lateMinutes,
    absentMinutes: pa.absentMinutes,
    absenceNotifyEmail: pa.notifyEmail,
    absenceNotifyWhatsApp: pa.notifyWhatsApp,
    absenceNotifyEmailRecipients: pa.notifyEmailRecipients,
    absenceNotifyWhatsAppNumbers: pa.notifyWhatsAppNumbers
  }
}

/** GET — irregular punches, present/absence, and late/absence notification toggles. */
export async function GET() {
  try {
    const data = await readAll()
    return NextResponse.json(data)
  } catch (e) {
    console.error('attendance settings GET', e)
    return NextResponse.json({ error: 'Failed to load attendance settings' }, { status: 500 })
  }
}

/** POST — any subset of settings (only provided fields are updated). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    if (body.expectedPunchesPerDay !== undefined) {
      const raw = body.expectedPunchesPerDay
      const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
      if (!Number.isFinite(n) || n < 1 || n > 24) {
        return NextResponse.json({ error: 'expectedPunchesPerDay must be between 1 and 24' }, { status: 400 })
      }
      await prisma.appSettings.upsert({
        where: { key: KEY },
        update: { value: String(n) },
        create: { key: KEY, value: String(n) }
      })
    }

    const bool = (v: unknown) => v === true || v === 'true'

    if (body.showExtractedPunches !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: SHOW_EXTRACTED_KEY },
        update: { value: bool(body.showExtractedPunches) ? 'true' : 'false' },
        create: { key: SHOW_EXTRACTED_KEY, value: bool(body.showExtractedPunches) ? 'true' : 'false' }
      })
    }

    const str = (v: unknown) => (typeof v === 'string' ? v : '')

    if (body.presentAbsenceEnabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_ENABLED_KEY },
        update: { value: bool(body.presentAbsenceEnabled) ? 'true' : 'false' },
        create: { key: PRESENT_ABSENCE_ENABLED_KEY, value: bool(body.presentAbsenceEnabled) ? 'true' : 'false' }
      })
    }

    if (body.lateMinutes !== undefined || body.absentMinutes !== undefined || body.graceMinutes !== undefined) {
      const current = await getPresentAbsenceSettings()
      const rawLate =
        body.lateMinutes !== undefined
          ? body.lateMinutes
          : body.graceMinutes !== undefined
            ? body.graceMinutes
            : current.lateMinutes
      const rawAbsent = body.absentMinutes !== undefined ? body.absentMinutes : current.absentMinutes
      const lateN = typeof rawLate === 'number' ? rawLate : parseInt(String(rawLate), 10)
      const absentN = typeof rawAbsent === 'number' ? rawAbsent : parseInt(String(rawAbsent), 10)
      if (!Number.isFinite(lateN) || lateN < 1 || lateN > 24 * 60) {
        return NextResponse.json({ error: 'lateMinutes must be between 1 and 1440' }, { status: 400 })
      }
      if (!Number.isFinite(absentN) || absentN < 1 || absentN > 24 * 60) {
        return NextResponse.json({ error: 'absentMinutes must be between 1 and 1440' }, { status: 400 })
      }
      const { lateMinutes, absentMinutes } = clampLateAbsentMinutes(lateN, absentN)
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_LATE_MINUTES_KEY },
        update: { value: String(lateMinutes) },
        create: { key: PRESENT_ABSENCE_LATE_MINUTES_KEY, value: String(lateMinutes) }
      })
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_ABSENT_MINUTES_KEY },
        update: { value: String(absentMinutes) },
        create: { key: PRESENT_ABSENCE_ABSENT_MINUTES_KEY, value: String(absentMinutes) }
      })
    }

    if (body.absenceNotifyEmail !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_NOTIFY_EMAIL_KEY },
        update: { value: bool(body.absenceNotifyEmail) ? 'true' : 'false' },
        create: { key: PRESENT_ABSENCE_NOTIFY_EMAIL_KEY, value: bool(body.absenceNotifyEmail) ? 'true' : 'false' }
      })
    }

    if (body.absenceNotifyWhatsApp !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY },
        update: { value: bool(body.absenceNotifyWhatsApp) ? 'true' : 'false' },
        create: { key: PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY, value: bool(body.absenceNotifyWhatsApp) ? 'true' : 'false' }
      })
    }

    if (body.absenceNotifyEmailRecipients !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY },
        update: { value: str(body.absenceNotifyEmailRecipients) },
        create: { key: PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY, value: str(body.absenceNotifyEmailRecipients) }
      })
    }

    if (body.absenceNotifyWhatsAppNumbers !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY },
        update: { value: str(body.absenceNotifyWhatsAppNumbers) },
        create: { key: PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY, value: str(body.absenceNotifyWhatsAppNumbers) }
      })
    }

    const data = await readAll()
    return NextResponse.json(data)
  } catch (e) {
    console.error('attendance settings POST', e)
    return NextResponse.json({ error: 'Failed to save attendance settings' }, { status: 500 })
  }
}
