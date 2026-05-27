import { formatDateDisplay, formatDateRange, type PayPeriodExcelData } from '@/lib/pay-period-excel'
import { escapePayPeriodHtml } from '@/lib/pay-period-email'

/** Opens a print dialog for a saved pay period report (desktop and mobile). */
export function printPayPeriodReport(data: PayPeriodExcelData) {
  const printWin = window.open('', '_blank')
  if (!printWin) return
  const rows = data.rows
  const totalTrans = rows.reduce((s, r) => s + r.transTtl, 0)
  const totalShortage = rows.reduce((s, r) => s + r.shortage, 0)
  const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Summary Report</title></head>
        <body style="font-family: system-ui; padding: 24px;">
          <h1 style="text-align: center; margin-bottom: 24px;">Summary Report</h1>
          <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
            <span>Report Date: ${formatDateDisplay(data.reportDate)}</span>
            <span>Date Range: ${formatDateRange(data.startDate, data.endDate)}</span>
          </div>
          <div style="font-weight: bold; margin-bottom: 16px;">${data.entityName}</div>
          ${(data.notes ?? '').trim() ? `<div style="margin-bottom: 16px; white-space: pre-wrap;">${escapePayPeriodHtml(data.notes ?? '')}</div>` : ''}
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="text-align: left; padding: 8px;">Staff</th>
                <th style="text-align: right; padding: 8px;">Trans Ttl</th>
                <th style="text-align: center; padding: 8px;">Vacation</th>
                <th style="text-align: right; padding: 8px;">Sick Days</th>
                <th style="text-align: left; padding: 8px;">Sick Leave</th>
                <th style="text-align: right; padding: 8px;">Shortage</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr style="border-bottom: 1px solid #ddd;">
                  <td style="padding: 8px;">${r.staffName}</td>
                  <td style="text-align: right; padding: 8px;">${r.transTtl.toFixed(2)}</td>
                  <td style="text-align: center; padding: 8px;">${r.vacation || ''}</td>
                  <td style="text-align: right; padding: 8px;">${r.sickLeaveDays ?? 0}</td>
                  <td style="text-align: left; padding: 8px;">${r.sickLeaveRanges ?? ''}</td>
                  <td style="text-align: right; padding: 8px;">${r.shortage > 0 ? `$${r.shortage.toFixed(2)}` : ''}</td>
                </tr>
              `
                )
                .join('')}
              <tr style="border-top: 2px solid #000; font-weight: bold;">
                <td style="padding: 8px;">Total</td>
                <td style="text-align: right; padding: 8px;">${totalTrans.toFixed(1)}</td>
                <td style="padding: 8px;"></td>
                <td style="text-align: right; padding: 8px;">${rows.reduce((s, r) => s + (r.sickLeaveDays ?? 0), 0)}</td>
                <td style="padding: 8px;"></td>
                <td style="text-align: right; padding: 8px;">${totalShortage > 0 ? `$${totalShortage.toFixed(2)}` : ''}</td>
              </tr>
            </tbody>
          </table>
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
