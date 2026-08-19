import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'
import type { LateAbsentDayRow, LateAbsentReport, LateAbsentStaffRow } from '@/lib/late-absent-report-shared'

function statusLabel(status: string): string {
  switch (status) {
    case 'late':
      return 'Late'
    case 'absent':
      return 'Absent'
    case 'present':
      return 'On time'
    case 'excused':
      return 'Excused'
    case 'pending':
      return 'Pending'
    case 'off':
      return 'Off'
    default:
      return status
  }
}

function statusColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'late':
      return { bg: '#fef3c7', fg: '#78350f' }
    case 'absent':
      return { bg: '#fee2e2', fg: '#7f1d1d' }
    case 'present':
      return { bg: '#d1fae5', fg: '#064e3b' }
    case 'excused':
      return { bg: '#ede9fe', fg: '#5b21b6' }
    default:
      return { bg: '#f3f4f6', fg: '#374151' }
  }
}

function parseHex(color: string | null): [number, number, number] | null {
  const raw = color?.trim()
  if (!raw) return null
  const short = /^#?([0-9a-f]{3})$/i.exec(raw)
  const full = /^#?([0-9a-f]{6})$/i.exec(raw)
  let hex = ''
  if (short) {
    const [r, g, b] = short[1].split('')
    hex = `${r}${r}${g}${g}${b}${b}`
  } else if (full) {
    hex = full[1]
  } else {
    return null
  }
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shiftBadgeCss(color: string | null): { background: string; color: string } {
  const rgb = parseHex(color)
  if (!rgb) return { background: '#e5e7eb', color: '#111827' }
  const [r, g, b] = rgb
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return {
    background: `rgb(${r},${g},${b})`,
    color: luminance > 155 ? '#111827' : '#ffffff'
  }
}

function afterStartLabel(day: LateAbsentDayRow): string {
  if (day.minutesAfterStart == null) return '—'
  return `${day.minutesAfterStart > 0 ? '+' : ''}${day.minutesAfterStart}m`
}

function punchLabel(day: LateAbsentDayRow): string {
  return day.punchTimeLabel ?? (day.status === 'absent' ? 'No punch' : '—')
}

function fileStem(staffName: string, report: LateAbsentReport): string {
  const safe = staffName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'staff'
  return `late-absent-${safe}-${report.startDate}-to-${report.endDate}`
}

/** Opens the browser print dialog (Save as PDF is available there). */
export function printLateAbsentStaffDrilldown(report: LateAbsentReport, staff: LateAbsentStaffRow) {
  const printWin = window.open('', '_blank')
  if (!printWin) return

  const rows = staff.days
    .map((d) => {
      const shift = shiftBadgeCss(d.shiftColor)
      const st = statusColors(d.status)
      const note = d.note
        ? `<span style="margin-left:6px;font-size:11px;color:#6b7280">${escapePayPeriodHtml(d.note)}</span>`
        : ''
      return `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:8px;white-space:nowrap">${escapePayPeriodHtml(d.dateLabel)}</td>
          <td style="padding:8px">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${shift.background};color:${shift.color}">${escapePayPeriodHtml(d.shiftName)}</span>
          </td>
          <td style="padding:8px">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${st.bg};color:${st.fg}">${escapePayPeriodHtml(statusLabel(d.status))}</span>${note}
          </td>
          <td style="padding:8px;font-variant-numeric:tabular-nums">${escapePayPeriodHtml(punchLabel(d))}</td>
          <td style="padding:8px;font-variant-numeric:tabular-nums">${escapePayPeriodHtml(afterStartLabel(d))}</td>
        </tr>
      `
    })
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Late &amp; Absent — ${escapePayPeriodHtml(staff.staffName)}</title>
        <style>
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body style="font-family:system-ui,Segoe UI,sans-serif;padding:24px;max-width:900px;margin:0 auto;color:#111">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Shift Close · Late &amp; Absent</p>
        <h1 style="margin:0 0 4px;font-size:22px">${escapePayPeriodHtml(staff.staffName)}</h1>
        <p style="margin:0 0 16px;color:#4b5563">
          ${escapePayPeriodHtml(report.periodLabel)} · ${staff.lateCount} late · ${staff.absentCount} absent
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid #111;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">
              <th style="padding:8px">Date</th>
              <th style="padding:8px">Shift</th>
              <th style="padding:8px">Status</th>
              <th style="padding:8px">Punch</th>
              <th style="padding:8px">After start</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:20px;font-size:11px;color:#6b7280">
          Late = first punch after ${report.lateMinutes} min past shift start.
          Absent = no punch by ${report.absentMinutes} min.
          Timezone: ${escapePayPeriodHtml(report.timeZone)}.
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

/** Downloads a PDF of one staff member's day/shift drill-down. */
export function downloadLateAbsentStaffPdf(report: LateAbsentReport, staff: LateAbsentStaffRow) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(staff.staffName, 40, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80)
  doc.text(
    `${report.periodLabel}  ·  ${staff.lateCount} late  ·  ${staff.absentCount} absent`,
    40,
    58
  )
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 74,
    head: [['Date', 'Shift', 'Status', 'Punch', 'After start']],
    body: staff.days.map((d) => [
      d.dateLabel,
      d.shiftName,
      statusLabel(d.status) + (d.note ? `  ${d.note}` : ''),
      punchLabel(d),
      afterStartLabel(d)
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const day = staff.days[data.row.index]
      if (!day) return
      if (data.column.index === 1) {
        const rgb = parseHex(day.shiftColor)
        if (rgb) {
          data.cell.styles.fillColor = rgb
          const lum = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000
          data.cell.styles.textColor = lum > 155 ? [17, 24, 39] : [255, 255, 255]
        }
      }
      if (data.column.index === 2) {
        if (day.status === 'late') {
          data.cell.styles.fillColor = [254, 243, 199]
          data.cell.styles.textColor = [120, 53, 15]
        } else if (day.status === 'absent') {
          data.cell.styles.fillColor = [254, 226, 226]
          data.cell.styles.textColor = [127, 29, 29]
        } else if (day.status === 'present') {
          data.cell.styles.fillColor = [209, 250, 229]
          data.cell.styles.textColor = [6, 78, 59]
        } else if (day.status === 'excused') {
          data.cell.styles.fillColor = [237, 233, 254]
          data.cell.styles.textColor = [91, 33, 182]
        }
      }
    },
    margin: { left: 40, right: 40 }
  })

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 74
  doc.setFontSize(8)
  doc.setTextColor(110)
  doc.text(
    `Late after ${report.lateMinutes} min · Absent after ${report.absentMinutes} min · ${report.timeZone}`,
    40,
    finalY + 18
  )

  doc.save(`${fileStem(staff.staffName, report)}.pdf`)
}
