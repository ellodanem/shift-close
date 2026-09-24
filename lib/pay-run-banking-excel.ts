import * as XLSX from 'xlsx'
import { formatMoney } from './pay-run'
import type { BankingPack } from './pay-run-banking'

function money(n: number): string {
  return formatMoney(n).replace('$', '')
}

export function buildBankingPackAoA(pack: BankingPack, payDate: string): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['Banks Listing'],
    ['Pay date:', payDate],
    [],
    ['BANKCODE', 'STAFFNAME', 'STAFFNO', 'ACCOUNTNO', 'NETPAY'],
    ...pack.listing.map((row) => [row.bankCode, row.staffName, row.staffNo, row.accountNo, row.netPay])
  ]
  rows.push([])
  rows.push(['Bank totals'])
  for (const total of pack.bankTotals) {
    rows.push([total.label, total.amount])
  }
  rows.push(['Staff total', pack.staffTotal])
  if (pack.extraDisbursements.length > 0) {
    rows.push([])
    rows.push(['Extra cash out'])
    for (const extra of pack.extraDisbursements) {
      rows.push([extra.label, extra.amount])
    }
  }
  rows.push(['Banking total', pack.bankingTotal])
  return rows
}

export function bankingPackExcelFilename(payDate: string): string {
  return `banks-listing-${payDate}.xlsx`
}

export function downloadBankingPackExcel(pack: BankingPack, payDate: string) {
  const ws = XLSX.utils.aoa_to_sheet(buildBankingPackAoA(pack, payDate))
  ws['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Banks Listing')
  XLSX.writeFile(wb, bankingPackExcelFilename(payDate))
  return money(pack.bankingTotal)
}
