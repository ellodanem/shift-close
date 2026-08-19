export type LateAbsentDayStatus = 'pending' | 'present' | 'late' | 'absent' | 'off' | 'excused'

export interface LateAbsentDayRow {
  dateYmd: string
  dateLabel: string
  shiftName: string
  shiftColor: string | null
  shiftStartTime: string
  shiftEndTime: string | null
  status: LateAbsentDayStatus
  punchTimeIso: string | null
  punchTimeLabel: string | null
  minutesAfterStart: number | null
  note: string
}

export interface LateAbsentStaffRow {
  staffId: string
  staffName: string
  lateCount: number
  absentCount: number
  total: number
  lastIncidentYmd: string | null
  lastIncidentLabel: string | null
  lastIncidentStatus: 'late' | 'absent' | null
  days: LateAbsentDayRow[]
}

export interface LateAbsentReport {
  startDate: string
  endDate: string
  periodLabel: string
  timeZone: string
  lateMinutes: number
  absentMinutes: number
  lateTotal: number
  absentTotal: number
  staffWithIncidents: number
  staffReviewed: number
  rows: LateAbsentStaffRow[]
}

export function lateAbsentReportToCsv(report: LateAbsentReport): string {
  const lines: string[] = []
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`
  lines.push(`Late & Absent Summary,${q(report.periodLabel)}`)
  lines.push(`Late after (min),${report.lateMinutes}`)
  lines.push(`Absent after (min),${report.absentMinutes}`)
  lines.push('')
  lines.push('Staff,Late,Absent,Total,Last incident')
  for (const row of report.rows) {
    const last = row.lastIncidentYmd
      ? `${row.lastIncidentLabel ?? row.lastIncidentYmd} ${row.lastIncidentStatus ?? ''}`.trim()
      : ''
    lines.push(
      [q(row.staffName), String(row.lateCount), String(row.absentCount), String(row.total), q(last)].join(',')
    )
  }
  lines.push('')
  lines.push('Staff,Date,Shift,Start,Status,Punch,Minutes after start,Note')
  for (const row of report.rows) {
    for (const day of row.days) {
      if (day.status !== 'late' && day.status !== 'absent') continue
      lines.push(
        [
          q(row.staffName),
          day.dateYmd,
          q(day.shiftName),
          day.shiftStartTime,
          day.status,
          q(day.punchTimeLabel ?? ''),
          day.minutesAfterStart == null ? '' : String(day.minutesAfterStart),
          q(day.note)
        ].join(',')
      )
    }
  }
  return lines.join('\n')
}
