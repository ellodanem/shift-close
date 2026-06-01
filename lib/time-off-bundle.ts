import { normalizeCallOutDate } from '@/lib/call-outs'
import { formatAppUserDisplayName } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { TIME_OFF_LIST_ROW_CAP, type TimeOffRange } from '@/lib/time-off-range'

export type TimeOffVacationRow = {
  staffId: string
  staffName: string
  staffFirstName: string
  vacationStart: string
  vacationEnd: string
}

export type TimeOffDayOffRow = {
  id: string
  staffId: string
  staffName: string
  staffFirstName: string
  date: string
  reason: string | null
  status: string
}

export type TimeOffSickLeaveRow = {
  id: string
  staffId: string
  staffName: string
  staffFirstName: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  documentCount: number
  documents?: { id: string; fileName: string; fileUrl: string }[]
}

export type TimeOffCallOutRow = {
  id: string
  staffId: string
  staffName: string
  staffFirstName: string
  date: string
  calledAt: string
  notes: string
  recordedByLabel: string | null
}

export type TimeOffStaffOption = {
  id: string
  name: string
  firstName: string
  lastName: string
  status: string
}

export type TimeOffBundlePayload = {
  startDate: string
  endDate: string
  vacations: TimeOffVacationRow[]
  dayOffs: TimeOffDayOffRow[]
  sickLeaves: TimeOffSickLeaveRow[]
  callOuts: TimeOffCallOutRow[]
  truncated: {
    dayOffs: boolean
    sickLeaves: boolean
    callOuts: boolean
  }
}

export async function fetchTimeOffStaffOptions(): Promise<TimeOffStaffOption[]> {
  const rows = await prisma.staff.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, firstName: true, lastName: true, status: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    firstName: s.firstName,
    lastName: s.lastName,
    status: s.status
  }))
}

export async function fetchTimeOffBundle(
  range: TimeOffRange,
  options: { includeSickDocuments?: boolean } = {}
): Promise<TimeOffBundlePayload> {
  const { startDate, endDate } = range
  const includeSickDocuments = options.includeSickDocuments === true

  const [vacationStaff, dayOffRows, sickRows, callOutRows] = await Promise.all([
    prisma.staff.findMany({
      where: {
        status: 'active',
        vacationStart: { not: null },
        vacationEnd: { not: null },
        AND: [{ vacationStart: { lte: endDate } }, { vacationEnd: { gte: startDate } }]
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        vacationStart: true,
        vacationEnd: true
      },
      orderBy: [{ vacationStart: 'asc' }, { name: 'asc' }]
    }),
    prisma.staffDayOff.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        staff: { select: { id: true, name: true, firstName: true } }
      },
      orderBy: [{ date: 'desc' }, { staffId: 'asc' }],
      take: TIME_OFF_LIST_ROW_CAP + 1
    }),
    prisma.staffSickLeave.findMany({
      where: {
        status: { not: 'denied' },
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      include: includeSickDocuments
        ? {
            staff: { select: { id: true, name: true, firstName: true } },
            documents: { select: { id: true, fileName: true, fileUrl: true } }
          }
        : {
            staff: { select: { id: true, name: true, firstName: true } },
            _count: { select: { documents: true } }
          },
      orderBy: [{ startDate: 'desc' }, { staffId: 'asc' }],
      take: TIME_OFF_LIST_ROW_CAP + 1
    }),
    prisma.staffCallOut.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        staff: { select: { id: true, name: true, firstName: true } },
        recordedBy: {
          select: { id: true, username: true, firstName: true, lastName: true }
        }
      },
      orderBy: [{ date: 'desc' }, { calledAt: 'desc' }],
      take: TIME_OFF_LIST_ROW_CAP + 1
    })
  ])

  const dayOffTruncated = dayOffRows.length > TIME_OFF_LIST_ROW_CAP
  const sickTruncated = sickRows.length > TIME_OFF_LIST_ROW_CAP
  const callOutTruncated = callOutRows.length > TIME_OFF_LIST_ROW_CAP

  const vacations: TimeOffVacationRow[] = vacationStaff
    .filter((s) => s.vacationStart && s.vacationEnd)
    .map((s) => ({
      staffId: s.id,
      staffName: s.name,
      staffFirstName: s.firstName,
      vacationStart: s.vacationStart!,
      vacationEnd: s.vacationEnd!
    }))

  const dayOffs: TimeOffDayOffRow[] = dayOffRows.slice(0, TIME_OFF_LIST_ROW_CAP).map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staffName: r.staff.name,
    staffFirstName: r.staff.firstName,
    date: r.date,
    reason: r.reason,
    status: r.status
  }))

  const sickLeaves: TimeOffSickLeaveRow[] = sickRows
    .slice(0, TIME_OFF_LIST_ROW_CAP)
    .map((r) => {
      const base = {
        id: r.id,
        staffId: r.staffId,
        staffName: r.staff.name,
        staffFirstName: r.staff.firstName,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        status: r.status
      }
      if (includeSickDocuments && 'documents' in r && Array.isArray(r.documents)) {
        return { ...base, documentCount: r.documents.length, documents: r.documents }
      }
      const count =
        '_count' in r ? (r._count as { documents: number }).documents : 0
      return { ...base, documentCount: count }
    })

  const callOuts: TimeOffCallOutRow[] = callOutRows.slice(0, TIME_OFF_LIST_ROW_CAP).map((r) => ({
    id: r.id,
    staffId: r.staffId,
    staffName: r.staff.name,
    staffFirstName: r.staff.firstName,
    date: normalizeCallOutDate(r.date) ?? r.date,
    calledAt: r.calledAt.toISOString(),
    notes: r.notes,
    recordedByLabel: r.recordedBy ? formatAppUserDisplayName(r.recordedBy) : null
  }))

  return {
    startDate,
    endDate,
    vacations,
    dayOffs,
    sickLeaves,
    callOuts,
    truncated: {
      dayOffs: dayOffTruncated,
      sickLeaves: sickTruncated,
      callOuts: callOutTruncated
    }
  }
}
