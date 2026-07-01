import { formatDateRange } from '@/lib/pay-period-excel'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import {
  formatShiftTimesDisplay,
  staffRosterStatusLabel,
  weekColumnHeaders,
  type StaffRosterReport,
  type StaffRosterReportDay
} from '@/lib/staff-roster-report'

export type StaffRosterReportViewMode = 'week' | 'list'

function statusCell(day: StaffRosterReportDay): string {
  const note = day.statusNote
    ? `<div style="font-size:11px;color:#555;margin-top:2px">${escapePayPeriodHtml(day.statusNote)}</div>`
    : ''
  return `<strong>${escapePayPeriodHtml(staffRosterStatusLabel(day.status))}</strong>${note}`
}

function scheduledCell(day: StaffRosterReportDay): string {
  if (day.shiftName) {
    const times = formatShiftTimesDisplay(day)
    const timesHtml = times
      ? `<div style="font-size:11px;color:#555">${escapePayPeriodHtml(times)}</div>`
      : ''
    return `<strong>${escapePayPeriodHtml(day.shiftName)}</strong>${timesHtml}`
  }
  if (day.rosterShiftName) {
    return `<span style="color:#888">—</span><div style="font-size:11px;color:#555">Roster: ${escapePayPeriodHtml(day.rosterShiftName)}</div>`
  }
  return '—'
}

function printListHtml(data: StaffRosterReport): string {
  const rows = data.days
    .map(
      (d) => `
        <tr style="border-bottom:1px solid #ddd">
          <td style="padding:8px;vertical-align:top">${escapePayPeriodHtml(d.dateLabel)}</td>
          <td style="padding:8px;vertical-align:top">${escapePayPeriodHtml(d.dayShort)}</td>
          <td style="padding:8px;vertical-align:top">${scheduledCell(d)}</td>
          <td style="padding:8px;vertical-align:top">${statusCell(d)}</td>
        </tr>
      `
    )
    .join('')

  return `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid #000">
          <th style="text-align:left;padding:8px">Date</th>
          <th style="text-align:left;padding:8px">Day</th>
          <th style="text-align:left;padding:8px">Scheduled</th>
          <th style="text-align:left;padding:8px">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function weekCellHtml(day: StaffRosterReportDay): string {
  if (day.status === 'working' && day.shiftName) {
    const times = formatShiftTimesDisplay(day)
    const timesHtml = times
      ? `<div style="font-size:10px;color:#444;margin-top:4px">${escapePayPeriodHtml(times)}</div>`
      : ''
    const border = day.shiftColor ? `border-left:4px solid ${escapePayPeriodHtml(day.shiftColor)}` : ''
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;min-width:72px;${border}"><strong>${escapePayPeriodHtml(day.shiftName)}</strong>${timesHtml}</td>`
  }
  if (day.status === 'off') {
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;background:#f3f4f6;color:#555">Off</td>`
  }
  if (day.status === 'vacation') {
    const roster = day.rosterShiftName
      ? `<div style="font-size:10px;color:#6b21a8;margin-top:2px">${escapePayPeriodHtml(day.rosterShiftName)}</div>`
      : ''
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;background:#f5f3ff;color:#5b21b6"><strong>Vacation</strong>${roster}</td>`
  }
  if (day.status === 'sick') {
    const roster = day.rosterShiftName
      ? `<div style="font-size:10px;color:#6b21a8;margin-top:2px">${escapePayPeriodHtml(day.rosterShiftName)}</div>`
      : ''
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;background:#f5f3ff;color:#6d28d9"><strong>Sick</strong>${roster}</td>`
  }
  if (day.status === 'day_off') {
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;background:#faf5ff;color:#7c3aed"><strong>Day off</strong></td>`
  }
  if (day.status === 'station_closed') {
    return `<td style="padding:8px;vertical-align:top;border:1px solid #ddd;background:#fffbeb;color:#92400e"><strong>Closed</strong></td>`
  }
  return `<td style="padding:8px;vertical-align:top;border:1px dashed #ccc;color:#9ca3af">—</td>`
}

function printWeekHtml(data: StaffRosterReport): string {
  return data.weeks
    .map((week) => {
      const headers = weekColumnHeaders(week.weekStart, data.startDate, data.endDate)
      const headerCells = headers
        .map((h) => `<th style="padding:8px;text-align:center;border:1px solid #ddd;font-size:12px">${escapePayPeriodHtml(h)}</th>`)
        .join('')
      const cells = week.days.map((d) => weekCellHtml(d)).join('')
      const statusLabel =
        week.rosterStatus === 'published'
          ? 'Published'
          : week.rosterStatus === 'draft'
            ? 'Draft'
            : 'No roster'
      const statusBg =
        week.rosterStatus === 'published'
          ? 'background:#ecfdf5;color:#065f46'
          : week.rosterStatus === 'draft'
            ? 'background:#fffbeb;color:#92400e'
            : 'background:#f3f4f6;color:#4b5563'
      return `
        <div style="margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <h2 style="margin:0;font-size:16px">${escapePayPeriodHtml(week.weekLabel)}</h2>
            <span style="font-size:11px;padding:2px 8px;border-radius:999px;${statusBg}">${escapePayPeriodHtml(statusLabel)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>${headerCells}</tr></thead>
            <tbody><tr>${cells}</tr></tbody>
          </table>
          <p style="font-size:11px;color:#666;margin:8px 0 0">${escapePayPeriodHtml(week.summaryLine)}</p>
        </div>
      `
    })
    .join('')
}

/** Opens a print dialog for an individual staff roster report. */
export function printStaffRosterReport(data: StaffRosterReport, viewMode: StaffRosterReportViewMode) {
  const printWin = window.open('', '_blank')
  if (!printWin) return

  const bodyContent = viewMode === 'week' ? printWeekHtml(data) : printListHtml(data)
  const summary = data.periodSummaryLine
    ? `<p style="margin:16px 0;padding:12px;background:#f3f4f6;border-radius:8px;font-size:13px"><strong>Period summary:</strong> ${escapePayPeriodHtml(data.periodSummaryLine)}</p>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Roster — ${escapePayPeriodHtml(data.staffName)}</title></head>
      <body style="font-family:system-ui;padding:24px;max-width:900px;margin:0 auto">
        <h1 style="margin:0 0 8px;font-size:22px">Staff roster report</h1>
        <p style="margin:0 0 16px;font-size:18px;font-weight:600">${escapePayPeriodHtml(data.staffName)}</p>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding:12px;background:#f3f4f6;border-radius:8px">
          <span><strong>Period:</strong> ${formatDateRange(data.startDate, data.endDate)}</span>
          <span><strong>Scheduled shifts:</strong> ${data.scheduledShiftCount}</span>
          <span><strong>View:</strong> ${viewMode === 'week' ? 'Week' : 'List'}</span>
        </div>
        ${summary}
        ${bodyContent}
        <p style="margin-top:24px;font-size:11px;color:#666">
          ${data.publishedOnly ? 'Published roster weeks only.' : 'Includes draft roster weeks.'}
          Timezone: ${escapePayPeriodHtml(data.timeZone)}
        </p>
      </body>
    </html>
  `

  printWin.document.write(html)
  printWin.document.close()
  printWin.focus()
  setTimeout(() => {
    printWin.print()
    printWin.close()
  }, 250)
}
