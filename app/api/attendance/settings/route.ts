import { NextRequest, NextResponse } from 'next/server'
import { parseExpectedPunchesPerDay } from '@/lib/attendance-irregularity'
import {
  getPresentAbsenceSettings,
  PRESENT_ABSENCE_ENABLED_KEY,
  PRESENT_ABSENCE_GRACE_MINUTES_KEY,
  PRESENT_ABSENCE_NOTIFY_EMAIL_KEY,
  PRESENT_ABSENCE_NOTIFY_EMAIL_RECIPIENTS_KEY,
  PRESENT_ABSENCE_NOTIFY_WHATSAPP_KEY,
  PRESENT_ABSENCE_NOTIFY_WHATSAPP_NUMBERS_KEY
} from '@/lib/present-absence'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const KEY = 'attendance_expected_punches_per_day'

async function readAll() {
  const row = await prisma.appSettings.findUnique({ where: { key: KEY } })
  const pa = await getPresentAbsenceSettings()
  return {
    expectedPunchesPerDay: parseExpectedPunchesPerDay(row?.value),
    presentAbsenceEnabled: pa.enabled,
    graceMinutes: pa.graceMinutes,
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
    const str = (v: unknown) => (typeof v === 'string' ? v : '')

    if (body.presentAbsenceEnabled !== undefined) {
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_ENABLED_KEY },
        update: { value: bool(body.presentAbsenceEnabled) ? 'true' : 'false' },
        create: { key: PRESENT_ABSENCE_ENABLED_KEY, value: bool(body.presentAbsenceEnabled) ? 'true' : 'false' }
      })
    }

    if (body.graceMinutes !== undefined) {
      const g = typeof body.graceMinutes === 'number' ? body.graceMinutes : parseInt(String(body.graceMinutes), 10)
      if (!Number.isFinite(g) || g < 1 || g > 24 * 60) {
        return NextResponse.json({ error: 'graceMinutes must be between 1 and 1440' }, { status: 400 })
      }
      await prisma.appSettings.upsert({
        where: { key: PRESENT_ABSENCE_GRACE_MINUTES_KEY },
        update: { value: String(g) },
        create: { key: PRESENT_ABSENCE_GRACE_MINUTES_KEY, value: String(g) }
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
