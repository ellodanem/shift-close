import * as XLSX from 'xlsx'
import { formatAmount } from '@/lib/fuelPayments'
import { formatCstoreDisplayDate } from '@/lib/parse-customer-credit-report'
import {
  fetchAccountStatement,
  formatStatementDateRange,
  type StatementMode
} from '@/lib/customer-statement'

export async function generateCustomerStatementExcelBuffer(params: {
  account: string
  startDate: string
  endDate: string
  mode: StatementMode
}): Promise<{ buffer: Buffer; filename: string }> {
  const statement = await fetchAccountStatement(
    params.account,
    params.startDate,
    params.endDate,
    params.mode
  )

  const aoa: (string | number)[][] = [
    ['Account Statement'],
    [statement.account],
    [formatStatementDateRange(statement.startDate, statement.endDate)],
    []
  ]

  if (statement.mode === 'summary') {
    aoa.push(['Month', 'Opening', 'Charges', 'Payments', 'Closing'])
    for (const row of statement.rows) {
      aoa.push([
        row.monthLabel,
        row.opening,
        row.charges,
        row.payments,
        row.closing
      ])
    }
    aoa.push([])
    aoa.push([
      'Period totals',
      statement.totals.opening,
      statement.totals.charges,
      statement.totals.payments,
      statement.totals.closing
    ])
  } else {
    aoa.push(['Opening balance', statement.opening])
    aoa.push([])
    aoa.push(['Date', 'Charges', 'Payments', 'Running total', 'Memo'])
    for (const row of statement.rows) {
      aoa.push([
        formatCstoreDisplayDate(row.date),
        row.charges > 0 ? row.charges : '',
        row.payments > 0 ? row.payments : '',
        row.runningTotal,
        row.memo || ''
      ])
    }
    aoa.push([])
    aoa.push([
      'Totals',
      statement.totals.charges,
      statement.totals.payments,
      statement.totals.closing,
      ''
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Statement')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const safeAccount = statement.account.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40)
  const filename = `statement-${safeAccount}-${params.startDate}-to-${params.endDate}.xlsx`

  return { buffer, filename }
}

export function formatStatementAmountForDisplay(amount: number): string {
  return formatAmount(amount)
}
