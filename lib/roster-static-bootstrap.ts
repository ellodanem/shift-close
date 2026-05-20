import { prisma } from '@/lib/prisma'
import {
  parseMinOffDaysPerWeek,
  ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY
} from '@/lib/roster-settings'
import { redactStaffRecord } from '@/lib/staff-redact'

/** Staff + shift templates + roster settings in one server pass (roster page first paint). */
export async function buildRosterStaticBootstrap(role: string) {
  const [staff, templates, settingsRow] = await Promise.all([
    prisma.staff.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { staffRole: true }
    }),
    prisma.shiftTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    }),
    prisma.appSettings.findUnique({
      where: { key: ROSTER_MIN_OFF_DAYS_PER_WEEK_KEY }
    })
  ])

  return {
    staff: staff.map((s) => redactStaffRecord(s, role)),
    templates,
    minOffDaysPerWeek: parseMinOffDaysPerWeek(settingsRow?.value)
  }
}
