'use client'

import { useEffect, useState, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import * as XLSX from 'xlsx'

interface CustomerArSummary {
  id: string
  year: number
  month: number
  opening: number
  charges: number
  payments: number
  closing: number | null
  notes: string
}

interface CustomerArAccount {
  id: string
  account: string
  opening: number
  charges: number
  payments: number
  closing: number
}

export default function CustomerAccountsPage() {
  const router = useRouter()
  const [summaries, setSummaries] = useState<CustomerArSummary[]>([])
  const [accounts, setAccounts] = useState<CustomerArAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}`

  const [monthInput, setMonthInput] = useState<string>(defaultMonth)
  const [openingInput, setOpeningInput] = useState<string>('')
  const [chargesInput, setChargesInput] = useState<string>('')
  const [paymentsInput, setPaymentsInput] = useState<string>('')
  const [closingInput, setClosingInput] = useState<string>('')
  const [notesInput, setNotesInput] = useState<string>('')
  useEffect(() => {
    const loadData = async () => {
      const summariesData = await fetchSummaries()
      // After summaries load, find the most recent month with data and load its accounts
      if (summariesData && summariesData.length > 0) {
        // Sort by year desc, then month desc to get most recent
        const sorted = [...summariesData].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year
          return b.month - a.month
        })
        const mostRecent = sorted[0]
        const monthKey = `${mostRecent.year}-${String(mostRecent.month).padStart(2, '0')}`
        setMonthInput(monthKey)
        await fetchAccountsForMonth(monthKey)
      } else if (defaultMonth) {
        // If no summaries yet, load default month
        await fetchAccountsForMonth(defaultMonth)
      }
    }
    loadData()
  }, [])

  const fetchSummaries = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer-accounts/monthly')
      if (!res.ok) {
        throw new Error('Failed to fetch customer account summaries')
      }
      const data = await res.json()
      setSummaries(data)
      return data // Return data so it can be used in the useEffect
    } catch (error) {
      console.error(error)
      alert('Failed to load customer account summaries')
      return []
    } finally {
      setLoading(false)
    }
  }

  const fetchAccountsForMonth = async (monthKey: string) => {
    if (!monthKey) {
      setAccounts([])
      setSelectedMonth(null)
      return
    }

    const [yearStr, monthStr] = monthKey.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    if (Number.isNaN(year) || Number.isNaN(month)) {
      setAccounts([])
      setSelectedMonth(null)
      return
    }

    setLoadingAccounts(true)
    setSelectedMonth(monthKey)
    try {
      const res = await fetch(
        `/api/customer-accounts/accounts?year=${year}&month=${month}`
      )
      if (!res.ok) {
        throw new Error('Failed to fetch customer accounts')
      }
      const data = await res.json()
      setAccounts(data)
    } catch (error) {
      console.error(error)
      setAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }

  const handleSave = async () => {
    if (!monthInput) {
      alert('Please select a month')
      return
    }

    const [yearStr, monthStr] = monthInput.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    const opening = Number(openingInput || '0')
    const charges = Number(chargesInput || '0')
    const payments = Number(paymentsInput || '0')
    const closing =
      closingInput.trim() === '' ? null : Number(closingInput || '0')

    if ([opening, charges, payments].some((v) => Number.isNaN(v))) {
      alert('Opening, charges, and payments must be numbers')
      return
    }

    if (Number.isNaN(year) || Number.isNaN(month)) {
      alert('Invalid month selected')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/customer-accounts/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          opening,
          charges,
          payments,
          closing,
          notes: notesInput
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save summary')
      }

      // Reset inputs a bit: keep month, clear numbers
      setOpeningInput('')
      setChargesInput('')
      setPaymentsInput('')
      setClosingInput('')
      setNotesInput('')

      await fetchSummaries()
      // Refresh account breakdown for the saved month
      if (monthInput) {
        await fetchAccountsForMonth(monthInput)
      }
      alert('Customer account summary saved')
    } catch (error) {
      console.error(error)
      alert('Failed to save customer account summary')
    } finally {
      setSaving(false)
    }
  }

  const formatMonthLabel = (year: number, month: number) => {
    const d = new Date(year, month - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const computeClosing = (s: CustomerArSummary) =>
    s.opening + s.charges - s.payments

  const parseNumber = (value: any): number => {
    if (typeof value === 'number') return value
    if (typeof value !== 'string') return 0
    const cleaned = value
      .replace(/[\$,]/g, '')
      .replace(/\s+/g, '')
      .replace(/[()]/g, (m) => (m === '(' ? '-' : ''))
    const n = Number(cleaned)
    return Number.isNaN(n) ? 0 : n
  }

  const handleExcelUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!monthInput) {
      alert('Please select the month this Excel file belongs to first.')
      e.target.value = ''
      return
    }

    try {
      setImporting(true)

      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const mappedRows = rows
        .map((row) => {
          const account =
            (row.Account as string) ||
            (row['ACCOUNT'] as string) ||
            (row['Account Name'] as string) ||
            ''
          const opening =
            parseNumber(row.Opening ?? row['OPENING'] ?? row['Opening'])
          const charges =
            parseNumber(row.Credit ?? row['CREDIT'] ?? row['Credit'])
          const payments =
            parseNumber(
              row.Collection ?? row['COLLECTION'] ?? row['Collection']
            )
          const closing =
            parseNumber(row.Closing ?? row['CLOSING'] ?? row['Closing'])

          return {
            account,
            opening,
            charges,
            payments,
            closing
          }
        })
        .filter(
          (r) =>
            r.account &&
            r.account.trim() !== '' &&
            r.account.toLowerCase() !== 'total'
        )

      if (mappedRows.length === 0) {
        alert('No account rows found in the uploaded file.')
        return
      }

      const [yearStr, monthStr] = monthInput.split('-')
      const year = Number(yearStr)
      const month = Number(monthStr)

      const res = await fetch('/api/customer-accounts/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, rows: mappedRows })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to import accounts')
      }

      await fetchSummaries()
      // Refresh account breakdown for the imported month
      if (monthInput) {
        await fetchAccountsForMonth(monthInput)
      }
      alert('Customer account Excel imported successfully.')
    } catch (error) {
      console.error(error)
      alert('Failed to import customer account Excel file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Customer Accounts
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Lightweight monthly A/R overview using totals from the POS
              customer account report.
            </p>
          </div>
        </div>

        {/* Primary: Excel Import */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-blue-200 p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="text-3xl">📊</div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Import from Excel (Recommended)
              </h2>
              <p className="text-xs text-gray-600">
                Export the customer account report from your POS (PDI) and upload
                it here. This will automatically import all accounts and compute
                monthly totals.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Select Month
              </label>
              <input
                type="month"
                value={monthInput}
                onChange={(e) => {
                  setMonthInput(e.target.value)
                  fetchAccountsForMonth(e.target.value)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Excel File
              </label>
              <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-blue-300 rounded text-sm cursor-pointer hover:bg-blue-50 transition-colors">
                <span className="text-blue-600 font-semibold">
                  {importing ? 'Importing...' : 'Choose Excel File'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelUpload}
                  disabled={importing}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Secondary: Manual Entry (Totals Only) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2">
              <span>Manual Entry (Totals Only - Fallback)</span>
              <span className="text-xs text-gray-500 group-open:hidden">
                Click to expand
              </span>
            </summary>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-4">
                Use this only if you don't have the Excel file. Enter totals
                manually - this will <strong>not</strong> include individual
                account breakdown.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Month
                  </label>
                  <input
                    type="month"
                    value={monthInput}
                    onChange={(e) => {
                      setMonthInput(e.target.value)
                      fetchAccountsForMonth(e.target.value)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Opening
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingInput}
                    onChange={(e) => setOpeningInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Charges (month)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={chargesInput}
                    onChange={(e) => setChargesInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Payments (month)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentsInput}
                    onChange={(e) => setPaymentsInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Closing from POS (optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={closingInput}
                    onChange={(e) => setClosingInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs text-gray-600 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  rows={2}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-gray-600 text-white rounded font-semibold text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Totals Only'}
                </button>
              </div>
            </div>
          </details>
        </div>

        {/* Summary table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Monthly A/R Roll-forward
            </h2>
            <p className="text-xs text-gray-500">
              Closing (computed) = Opening + Charges - Payments
            </p>
          </div>

          {loading ? (
            <p className="text-gray-600 text-sm">Loading summaries...</p>
          ) : summaries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No customer account summaries recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Month
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Opening
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Charges
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Payments
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Closing (computed)
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Closing from POS
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Difference
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {summaries.map((s) => {
                    const computed = computeClosing(s)
                    const diff =
                      s.closing != null ? s.closing - computed : null
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          {formatMonthLabel(s.year, s.month)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(s.opening)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(s.charges)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(s.payments)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {formatAmount(computed)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {s.closing != null ? formatAmount(s.closing) : '—'}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-mono ${
                            diff == null
                              ? 'text-gray-400'
                              : Math.abs(diff) < 0.01
                              ? 'text-green-600'
                              : 'text-red-600 font-semibold'
                          }`}
                        >
                          {diff == null
                            ? '—'
                            : `${diff >= 0 ? '+' : ''}${formatAmount(diff)}`}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 max-w-xs">
                          {s.notes}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account Breakdown Table */}
        {selectedMonth && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Account Breakdown - {formatMonthLabel(
                  Number(selectedMonth.split('-')[0]),
                  Number(selectedMonth.split('-')[1])
                )}
              </h2>
            </div>

            {loadingAccounts ? (
              <p className="text-gray-600 text-sm">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No account breakdown available for this month. Import an Excel
                file to see individual customer accounts.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">
                        Account
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        Opening
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        Charges
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        Payments
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        Closing
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accounts.map((acc) => (
                      <tr key={acc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {acc.account}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(acc.opening)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(acc.charges)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">
                          {formatAmount(acc.payments)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {formatAmount(acc.closing)}
                        </td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-gray-100 font-semibold">
                      <td className="px-4 py-2 text-gray-900">Total</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(
                          accounts.reduce((sum, acc) => sum + acc.opening, 0)
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(
                          accounts.reduce((sum, acc) => sum + acc.charges, 0)
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(
                          accounts.reduce((sum, acc) => sum + acc.payments, 0)
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatAmount(
                          accounts.reduce((sum, acc) => sum + acc.closing, 0)
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
