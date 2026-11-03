'use client'

import { useState } from 'react'
import { CASHBOOK_ACCOUNTS, CASHBOOK_ACCOUNT_INFO, type CashbookAccount } from '@/lib/cashbook-accounts'
import { DataTable, PageTitle, StatStrip, money, useBooks } from '../screens'

type View = CashbookAccount | 'both'

export function LedgerScreen() {
  const books = useBooks()
  const [view, setView] = useState<View>('westline')

  const rows = view === 'both' ? books.ledger : books.ledger.filter((row) => row.account === view)
  const opening = view === 'both' ? null : books.ledgerOpening[view]
  const closing = view === 'both' ? null : rows.length > 0 ? rows[rows.length - 1].balance : opening
  const totals =
    view === 'both'
      ? { income: books.monthIncome, expense: books.monthExpense }
      : books.ledgerTotals[view]
  const title =
    view === 'both'
      ? 'General ledger · both accounts'
      : `General ledger · ${CASHBOOK_ACCOUNT_INFO[view].ledgerCode} ${CASHBOOK_ACCOUNT_INFO[view].label}`

  const tableRows: Array<Array<string | number>> = []
  if (view !== 'both' && opening != null) {
    tableRows.push([books.startDate, 'Opening balance', '', '', '', money(opening), ''])
  }
  for (const row of rows) {
    tableRows.push([
      row.date,
      row.description,
      view === 'both' ? `${CASHBOOK_ACCOUNT_INFO[row.account].label} · ${row.category}` : row.category,
      row.debit ? money(row.debit) : '',
      row.credit ? money(row.credit) : '',
      view === 'both' ? '' : money(row.balance),
      row.source
    ])
  }

  const note =
    view === 'both'
      ? 'Money in is a debit. A check or charge is a credit. Balances are per account, so they are shown on each account’s own tab.'
      : opening != null
        ? 'Money in is a debit. A check or charge is a credit. The balance starts from the accountant’s confirmed figure.'
        : 'Money in is a debit. A check or charge is a credit. This month is before the accountant’s opening balance, so it starts at zero.'

  return (
    <div>
      <PageTitle title={title} note={note} />
      <div className="mb-4 inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
        {([...CASHBOOK_ACCOUNTS, 'both'] as View[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1 font-medium ${
              view === key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {key === 'both' ? 'Both' : CASHBOOK_ACCOUNT_INFO[key].label}
          </button>
        ))}
      </div>
      <StatStrip
        items={[
          ...(opening != null ? [{ label: 'Opening balance', value: money(opening) }] : []),
          { label: 'Debits (money in)', value: money(totals.income) },
          { label: 'Credits (money out)', value: money(totals.expense) },
          { label: 'Movement', value: money(totals.income - totals.expense), tone: totals.income - totals.expense >= 0 ? 'good' as const : 'bad' as const },
          ...(closing != null ? [{ label: 'Closing balance', value: money(closing) }] : [])
        ]}
      />
      <DataTable
        headers={['Date', 'Description', 'Account', 'Debit', 'Credit', 'Balance', 'Source']}
        align={['left', 'left', 'left', 'right', 'right', 'right', 'left']}
        rows={tableRows}
      />
      <p className="mt-3 text-sm text-gray-600">
        Transfers between the two accounts appear on both tabs and are not counted as income or expense. Rows from a
        shift stay the shift’s numbers. This ledger does not change the close.
      </p>
    </div>
  )
}
