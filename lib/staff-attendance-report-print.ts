import { buildCallOutTooltip } from '@/lib/call-outs'
import { formatDateRange } from '@/lib/pay-period-excel'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import type { StaffAttendanceReport, StaffAttendanceReportDay } from '@/lib/staff-attendance-report'

function statusLabel(day: StaffAttendanceReportDay): string {
  switch (day.status) {
    case 'present':
      return 'Present'
    case 'absent':
      return 'Absent'
    case 'excused':
      return 'Excused'
    case 'off':
      return 'Off'
    case 'pending':
      return 'Pending'
    default:
      return day.status
  }
}

function punchTimesCell(day: StaffAttendanceReportDay): string {
  if (day.punches.length === 0) return '—'
  return day.punches
    .map((p) => `${p.timeLabel} ${p.punchType === 'in' ? 'In' : 'Out'}`)
    .join('<br/>')
}

function qualityWarning(day: StaffAttendanceReportDay): string {
  if (!day.punchQuality || day.punchQuality === 'full') return ''
  if (day.punchQuality === 'short_ok') return ' <span style="color:#0369a1;font-size:11px">(possible missed punch)</span>'
  return ' <span style="color:#b91c1c;font-size:11px">(irregular punches)</span>'
}

/** Opens a print dialog for an individual staff attendance report. */
export function printStaffAttendanceReport(data: StaffAttendanceReport) {
  const printWin = window.open('', '_blank')
  if (!printWin) return

  const rows = data.days
    .map((d) => {
      const note = d.statusNote ? `<div style="font-size:11px;color:#555">${escapePayPeriodHtml(d.statusNote)}</div>` : ''
      const shift = d.shiftName
        ? `<div style="font-size:11px;color:#555">${escapePayPeriodHtml(d.shiftName)}</div>`
        : ''
      const callOut = d.callOut
        ? `<div style="font-size:11px;color:#b45309;margin-top:2px" title="${escapePayPeriodHtml(
            buildCallOutTooltip({
              calledAt: d.callOut.calledAt,
              notes: d.callOut.notes,
              recordedByLabel: d.callOut.recordedByLabel,
              sickLeaveOverlap: d.callOut.sickLeaveOverlap
            })
          )}">Call out</div>`
        : ''
      return `
        <tr style="border-bottom:1px solid #ddd">
          <td style="padding:8px;vertical-align:top">${escapePayPeriodHtml(d.dateLabel)}</td>
          <td style="padding:8px;vertical-align:top"><strong>${statusLabel(d)}</strong>${callOut}${note}${shift}</td>
          <td style="padding:8px;vertical-align:top">${punchTimesCell(d)}${qualityWarning(d)}</td>
          <td style="padding:8px;text-align:right;vertical-align:top">${data.punchExempt ? '—' : d.hours.toFixed(2)}</td>
        </tr>
      `
    })
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Attendance — ${escapePayPeriodHtml(data.staffName)}</title></head>
      <body style="font-family:system-ui;padding:24px;max-width:900px;margin:0 auto">
        <h1 style="margin:0 0 8px;font-size:22px">Staff attendance report</h1>
        <p style="margin:0 0 16px;font-size:18px;font-weight:600">${escapePayPeriodHtml(data.staffName)}</p>
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding:12px;background:#f3f4f6;border-radius:8px">
          <span><strong>Period:</strong> ${formatDateRange(data.startDate, data.endDate)}</span>
          <span><strong>Total hours:</strong> ${data.punchExempt ? 'N/A (no clock)' : data.periodTotalHours.toFixed(2)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:2px solid #000">
              <th style="text-align:left;padding:8px">Date</th>
              <th style="text-align:left;padding:8px">Status</th>
              <th style="text-align:left;padding:8px">Clock in / out</th>
              <th style="text-align:right;padding:8px">Hours</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #000;font-weight:bold">
              <td colspan="3" style="padding:8px">Period total</td>
              <td style="padding:8px;text-align:right">${data.punchExempt ? '—' : data.periodTotalHours.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p style="margin-top:24px;font-size:11px;color:#666">
          Times and hours use the first ${data.expectedPunchesPerDay} punch${data.expectedPunchesPerDay === 1 ? '' : 'es'} per day (Attendance settings).
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
