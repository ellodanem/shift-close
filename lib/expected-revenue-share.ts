import { formatDateOnlyForDisplay } from './datetime-policy'

export type ExpectedRevenueDayShare = {
  date: string
  grandTotal: number
  depositsTotal: number
  cardTotal: number
  depositsAndCardTotal: number
}

export type ExpectedRevenueShareInput = {
  startDate: string
  endDate: string
  grandTotal: number
  totalDeposits: number
  totalDebitAndCredit: number
  totalDebit: number
  totalCredit: number
  totalFleet: number
  totalVouchers: number
  shiftCount: number
  byDay: ExpectedRevenueDayShare[]
}

function formatShareMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDateOnlyForDisplay(startDate)
  return `${formatDateOnlyForDisplay(startDate)} – ${formatDateOnlyForDisplay(endDate)}`
}

export type ExpectedRevenueShareDayLine = {
  date: string
  total: string
  detail: string
}

/** Fields painted on the share image. Amounts already include the dollar sign. */
export type ExpectedRevenueShareModel = {
  rangeLine: string
  grandTotal: string
  excludedNote: string | null
  deposits: string
  card: string
  debit: string
  credit: string
  fleet: string
  vouchers: string
  days: ExpectedRevenueShareDayLine[] | null
}

export function buildExpectedRevenueShareModel(
  data: ExpectedRevenueShareInput,
  depositsAndCardOnly: boolean
): ExpectedRevenueShareModel {
  const grand = depositsAndCardOnly
    ? data.totalDeposits + data.totalDebitAndCredit
    : data.grandTotal
  const shiftLabel = `${data.shiftCount} shift${data.shiftCount === 1 ? '' : 's'}`

  return {
    rangeLine: `${formatRangeLabel(data.startDate, data.endDate)} · ${shiftLabel}`,
    grandTotal: formatShareMoney(grand),
    excludedNote: depositsAndCardOnly
      ? 'Deposits + card only (fleet & vouchers excluded)'
      : null,
    deposits: formatShareMoney(data.totalDeposits),
    card: formatShareMoney(data.totalDebitAndCredit),
    debit: formatShareMoney(data.totalDebit),
    credit: formatShareMoney(data.totalCredit),
    fleet: formatShareMoney(data.totalFleet),
    vouchers: formatShareMoney(data.totalVouchers),
    days:
      data.byDay.length > 1
        ? data.byDay.map((row) => ({
            date: formatDateOnlyForDisplay(row.date),
            total: formatShareMoney(depositsAndCardOnly ? row.depositsAndCardTotal : row.grandTotal),
            detail: `Deposits ${formatShareMoney(row.depositsTotal)} · Card ${formatShareMoney(row.cardTotal)}`
          }))
        : null
  }
}

/** Plain-text summary of the expected-revenue screen, ready to paste into a message. */
export function buildExpectedRevenueShareText(
  data: ExpectedRevenueShareInput,
  depositsAndCardOnly: boolean
): string {
  const grand = depositsAndCardOnly
    ? data.totalDeposits + data.totalDebitAndCredit
    : data.grandTotal

  const lines = [
    'Expected revenue',
    formatRangeLabel(data.startDate, data.endDate),
    `${data.shiftCount} shift${data.shiftCount === 1 ? '' : 's'}`,
    '',
    `Grand total: ${formatShareMoney(grand)}`
  ]

  if (depositsAndCardOnly) {
    lines.push('Deposits + card only (fleet & vouchers excluded)')
  }

  lines.push(
    '',
    `Deposits: ${formatShareMoney(data.totalDeposits)}`,
    `Card: ${formatShareMoney(data.totalDebitAndCredit)}`,
    `  Debit (system): ${formatShareMoney(data.totalDebit)}`,
    `  Credit (other): ${formatShareMoney(data.totalCredit)}`,
    `Fleet: ${formatShareMoney(data.totalFleet)}`,
    `Vouchers / coupons: ${formatShareMoney(data.totalVouchers)}`
  )

  if (data.byDay.length > 1) {
    lines.push('', 'By day')
    for (const row of data.byDay) {
      const total = depositsAndCardOnly ? row.depositsAndCardTotal : row.grandTotal
      lines.push(
        `${formatDateOnlyForDisplay(row.date)} — ${formatShareMoney(total)} (deposits ${formatShareMoney(row.depositsTotal)}, card ${formatShareMoney(row.cardTotal)})`
      )
    }
  }

  return lines.join('\n')
}
