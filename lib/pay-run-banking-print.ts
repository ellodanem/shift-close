import { formatDateDisplay } from './pay-period-excel'
import { escapePayPeriodHtml } from './pay-period-email'
import { formatMoney } from './pay-run'
import type { BankingPack } from './pay-run-banking'

export function renderBankingPackHtml(pack: BankingPack, payDate: string): string {
  const listing = pack.listing
    .map(
      (row) =>
        `<tr>
          <td>${escapePayPeriodHtml(row.bankCode)}</td>
          <td>${escapePayPeriodHtml(row.staffName)}</td>
          <td>${escapePayPeriodHtml(row.staffNo)}</td>
          <td>${escapePayPeriodHtml(row.accountNo)}</td>
          <td style="text-align:right">${formatMoney(row.netPay)}</td>
        </tr>`
    )
    .join('')
  const totals = pack.bankTotals
    .map((row) => `<tr><td>${escapePayPeriodHtml(row.label)}</td><td style="text-align:right">${formatMoney(row.amount)}</td></tr>`)
    .join('')
  const extras = pack.extraDisbursements
    .map((row) => `<tr><td>${escapePayPeriodHtml(row.label)}</td><td style="text-align:right">${formatMoney(row.amount)}</td></tr>`)
    .join('')
  return `<!DOCTYPE html>
<html>
  <head><title>Banks Listing ${escapePayPeriodHtml(payDate)}</title></head>
  <body style="font-family: system-ui; padding: 24px;">
    <h1 style="text-align:center">Banks Listing</h1>
    <p>Pay date: ${escapePayPeriodHtml(formatDateDisplay(payDate))}</p>
    <table style="width:100%; border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid #000">
          <th style="text-align:left; padding:6px">BANKCODE</th>
          <th style="text-align:left; padding:6px">STAFFNAME</th>
          <th style="text-align:left; padding:6px">STAFFNO</th>
          <th style="text-align:left; padding:6px">ACCOUNTNO</th>
          <th style="text-align:right; padding:6px">NETPAY</th>
        </tr>
      </thead>
      <tbody>${listing}</tbody>
    </table>
    <h2 style="margin-top:28px">Bank totals</h2>
    <table style="width:24rem; border-collapse:collapse">${totals}
      <tr style="font-weight:bold; border-top:2px solid #000"><td>Staff total</td><td style="text-align:right">${formatMoney(pack.staffTotal)}</td></tr>
    </table>
    ${
      extras
        ? `<h2 style="margin-top:28px">Extra cash out</h2><table style="width:24rem; border-collapse:collapse">${extras}</table>`
        : ''
    }
    <p style="font-weight:bold">Banking total ${formatMoney(pack.bankingTotal)}</p>
  </body>
</html>`
}

export function printBankingPack(pack: BankingPack, payDate: string) {
  const printWin = window.open('', '_blank')
  if (!printWin) return
  printWin.document.write(renderBankingPackHtml(pack, payDate))
  printWin.document.close()
  printWin.focus()
  printWin.print()
}
