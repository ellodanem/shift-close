'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, ChangeEvent } from 'react'
import { formatAmount } from '@/lib/fuelPayments'
import { formatStatementDateRange } from '@/lib/customer-statement'
import {
  creditReportToLedgerEntries,
  detectMonthKeyFromParsed,
  formatCstoreDisplayDate,
  parseCustomerCreditReportHtml
} from '@/lib/parse-customer-credit-report'

type LedgerRow = {
  id: string
  date: string
  lineType: 'charge' | 'payment'
  amount: number
  charges: number
  payments: number
  runningTotal: number
  memo: string | null
  paymentMethod: string | null
  ref: string | null
  source: string
  paymentId: string | null
}

type LedgerView = {
  account: string
  opening: number
  rows: LedgerRow[]
  totals: { charges: number; payments: number; closing: number }
}

function formatPaymentTypeLabel(method: string | null) {
  if (!method?.trim()) return '—'
  const m = method.trim().toLowerCase()
  if (m === 'cash') return 'Cash'
  if (m === 'check' || m === 'cheque') return 'Check'
  if (m === 'eft') return 'EFT'
  return method
}

function monthRange(monthKey: string): { start: string; end: string; year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    year: y,
    month: m,
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
}

type Props = {
  account: string
  monthKey: string
  onClose: () => void
  onImported?: (monthKey?: string) => void
  onMonthChange?: (monthKey: string) => void
}

export default function CustomerAccountLedgerPanel({
  account,
  monthKey,
  onClose,
  onImported,
  onMonthChange
}: Props) {
  const { start: monthStart, end: monthEnd, year, month } = monthRange(monthKey)
  const [startDate, setStartDate] = useState(monthStart)
  const [endDate, setEndDate] = useState(monthEnd)
  const [view, setView] = useState<LedgerView | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importUsed, setImportUsed] = useState(false)
  const [openingInput, setOpeningInput] = useState<string>('')
  const [savingLine, setSavingLine] = useState(false)

  const [lineDate, setLineDate] = useState(monthStart)
  const [lineType, setLineType] = useState<'charge' | 'payment'>('payment')
  const [lineAmount, setLineAmount] = useState('')
  const [lineMemo, setLineMemo] = useState('')
  const [linePaymentMethod, setLinePaymentMethod] = useState<string>('')

  const loadLedger = useCallback(
    async (openingOverride?: string) => {
      setLoading(true)
      try {
        const o = openingOverride ?? openingInput
        const openingQ =
          o.trim() !== '' ? `&opening=${encodeURIComponent(o)}` : ''
        const res = await fetch(
          `/api/customer-accounts/ledger?account=${encodeURIComponent(account)}&startDate=${startDate}&endDate=${endDate}${openingQ}`
        )
        if (!res.ok) throw new Error('Failed to load')
        const data: LedgerView = await res.json()
        setView(data)
        if ((openingOverride ?? openingInput) === '' && data.opening != null) {
          setOpeningInput(String(data.opening))
        }
      } catch {
        setView(null)
      } finally {
        setLoading(false)
      }
    },
    [account, startDate, endDate, openingInput]
  )

  useEffect(() => {
    const { start, end } = monthRange(monthKey)
    setStartDate(start)
    setEndDate(end)
    setLineDate(start)
    setOpeningInput('')
    loadLedger('')
  }, [account, monthKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCstoreUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseCustomerCreditReportHtml(text)
      if (parsed.lines.length === 0) {
        throw new Error(
          'No dated charge or payment rows found in this file. Use the Cstore Customer Credit Report export (Details), not the monthly all-accounts Excel.'
        )
      }

      const detectedMonth = detectMonthKeyFromParsed(parsed)
      const importMonthKey = detectedMonth ?? monthKey
      const [importYear, importMonth] = importMonthKey.split('-').map(Number)

      if (detectedMonth && detectedMonth !== monthKey) {
        onMonthChange?.(detectedMonth)
      }

      const entries = creditReportToLedgerEntries(parsed)
      const res = await fetch('/api/customer-accounts/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importType: 'cstore',
          account,
          year: importYear,
          month: importMonth,
          opening: parsed.opening,
          entries,
          updateSnapshot: true
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Import failed')
      }
      const data = await res.json()
      setOpeningInput(String(data.opening ?? parsed.opening))
      setView(data.view)
      setImportUsed(true)
      onImported?.(importMonthKey)
      alert(
        `Imported ${data.imported} line(s) for ${account}. Dates: ${parsed.lines
          .map((l) => formatCstoreDisplayDate(l.date))
          .join(', ')}`
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import Cstore file')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleAddLine = async () => {
    const amt = Number(lineAmount.replace(/[\$,]/g, ''))
    if (Number.isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount')
      return
    }
    setSavingLine(true)
    try {
      const res = await fetch('/api/customer-accounts/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account,
          date: lineDate,
          lineType,
          amount: amt,
          memo: lineMemo.trim() || undefined,
          paymentMethod: linePaymentMethod.trim() || undefined,
          ref: undefined
        })
      })
      if (!res.ok) throw new Error('Failed to add line')
      setLineAmount('')
      setLineMemo('')
      await loadLedger()
    } catch {
      alert('Failed to add line')
    } finally {
      setSavingLine(false)
    }
  }

  const handleDeleteLine = async (id: string) => {
    if (!confirm('Delete this line?')) return
    try {
      const res = await fetch(`/api/customer-accounts/ledger/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
      }
      await loadLedger()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleUpdatePaymentMethod = async (id: string, method: string) => {
    try {
      const res = await fetch(`/api/customer-accounts/ledger/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: method.trim() || null
        })
      })
      if (!res.ok) throw new Error('Update failed')
      await loadLedger()
    } catch {
      alert('Failed to update payment type')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-ledger-modal-title"
    >
      <div
        className="mb-8 mt-2 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-indigo-200 bg-white shadow-xl sm:mt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-gray-200 bg-indigo-50/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:rounded-t-lg">
          <div className="min-w-0">
            <h3 id="customer-ledger-modal-title" className="text-lg font-semibold text-gray-900">
              {account}
            </h3>
            <p className="text-xs text-gray-600">
              Account ledger for {formatStatementDateRange(startDate, endDate)} — import the Cstore
              Customer Credit Report (Details) to see charge and payment dates.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link
              href={`/customer-accounts/statement?account=${encodeURIComponent(account)}&startDate=${startDate}&endDate=${endDate}&mode=detail`}
              className="min-h-[44px] rounded border border-indigo-300 bg-white px-3 py-2 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-50 sm:min-h-0 sm:py-1.5"
            >
              Full statement
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:min-h-0 sm:py-1.5"
            >
              Close
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:w-auto sm:py-1"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:w-auto sm:py-1"
          />
        </div>
        <button
          type="button"
          onClick={() => loadLedger()}
          className="min-h-[44px] rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 sm:min-h-0 sm:py-1.5"
        >
          Apply range
        </button>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Opening balance
          </label>
          <input
            type="number"
            step="0.01"
            value={openingInput}
            onChange={(e) => setOpeningInput(e.target.value)}
            className="min-h-[44px] w-full rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:w-32 sm:py-1"
          />
        </div>
        <button
          type="button"
          onClick={() => loadLedger(openingInput)}
          className="min-h-[44px] rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 sm:min-h-0 sm:py-1.5"
        >
          Apply opening
        </button>
        <label
          className={`min-h-[44px] rounded border-2 border-dashed px-3 py-2 text-center text-sm sm:min-h-0 sm:py-1.5 ${
            importUsed
              ? 'cursor-not-allowed border-gray-300 bg-gray-50 text-gray-400'
              : 'cursor-pointer border-indigo-400 hover:bg-white'
          }`}
          title={
            importUsed
              ? 'Import used for this session. Close and reopen the ledger to import again.'
              : undefined
          }
        >
          {importing
            ? 'Importing…'
            : importUsed
              ? 'Import used — close & reopen to import again'
              : 'Import Cstore detail (.xls)'}
          <input
            type="file"
            accept=".xls,.xlsx,.html"
            className="hidden"
            disabled={importing || importUsed}
            onChange={handleCstoreUpload}
          />
        </label>
      </div>

      <div className="mb-4 rounded border border-gray-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-gray-700">Add line manually</p>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <input
            type="date"
            value={lineDate}
            onChange={(e) => setLineDate(e.target.value)}
            className="min-h-[44px] rounded border px-2 py-2 text-sm sm:min-h-0 sm:py-1"
          />
          <select
            value={lineType}
            onChange={(e) => setLineType(e.target.value as 'charge' | 'payment')}
            className="min-h-[44px] rounded border bg-white px-2 py-2 text-sm sm:min-h-0 sm:py-1"
          >
            <option value="charge">Charge</option>
            <option value="payment">Payment</option>
          </select>
          <input
            type="text"
            placeholder="Amount"
            value={lineAmount}
            onChange={(e) => setLineAmount(e.target.value)}
            className="min-h-[44px] w-full rounded border px-2 py-2 text-sm sm:min-h-0 sm:w-24 sm:py-1"
          />
          <select
            value={linePaymentMethod}
            onChange={(e) => setLinePaymentMethod(e.target.value)}
            className="min-h-[44px] rounded border bg-white px-2 py-2 text-sm sm:min-h-0 sm:py-1"
            title="Payment type (optional)"
          >
            <option value="">Type —</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="eft">EFT</option>
          </select>
          <input
            type="text"
            placeholder="Memo / invoice #"
            value={lineMemo}
            onChange={(e) => setLineMemo(e.target.value)}
            className="min-h-[44px] min-w-0 flex-1 rounded border px-2 py-2 text-sm sm:min-h-0 sm:min-w-[120px] sm:py-1"
          />
          <button
            type="button"
            onClick={handleAddLine}
            disabled={savingLine}
            className="min-h-[44px] rounded bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50 sm:min-h-0 sm:py-1.5"
          >
            Add
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading ledger…</p>
      ) : !view ? (
        <p className="text-sm text-gray-500">Could not load ledger.</p>
      ) : (
        <>
          <div className="mb-3 rounded border border-gray-200 bg-gray-100 p-3 text-center text-sm font-medium text-gray-800 md:hidden">
            Opening balance: {formatAmount(view.opening)}
          </div>

          {view.rows.length === 0 ? (
            <div className="rounded border border-gray-200 bg-white p-4 text-center text-sm text-gray-600 md:hidden">
              <p className="mb-1 font-medium text-gray-800">
                No dated lines for {formatStatementDateRange(startDate, endDate)}
              </p>
              <p>
                Import a Cstore Customer Credit Report (Details) to see charge and payment dates.
              </p>
            </div>
          ) : (
            <div className="mb-4 space-y-3 md:hidden">
              {view.rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-gray-900">
                      {formatCstoreDisplayDate(row.date)}
                    </div>
                    <div className="font-mono font-semibold text-gray-900">
                      {formatAmount(row.runningTotal)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                    <div>
                      Charges{' '}
                      <span className="font-mono text-gray-900">
                        {row.charges > 0 ? formatAmount(row.charges) : formatAmount(0)}
                      </span>
                    </div>
                    <div>
                      Payments{' '}
                      <span className="font-mono text-gray-900">
                        {row.payments > 0 ? formatAmount(row.payments) : formatAmount(0)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-700">
                    {row.memo || '—'}
                    {row.lineType === 'payment' && (
                      <span className="mt-1 block sm:ml-2 sm:mt-0 sm:inline">
                        <select
                          className="mt-1 rounded border bg-white px-1 py-1 text-xs sm:mt-0"
                          value={row.paymentMethod || ''}
                          onChange={(e) =>
                            handleUpdatePaymentMethod(row.id, e.target.value)
                          }
                          disabled={row.source === 'payment_record'}
                          title={
                            row.source === 'payment_record'
                              ? 'Edit via Record Payment'
                              : 'Payment type (optional)'
                          }
                        >
                          <option value="">—</option>
                          <option value="cash">Cash</option>
                          <option value="check">Check</option>
                          <option value="eft">EFT</option>
                        </select>
                        {row.source === 'payment_record' && (
                          <span className="ml-1 text-xs text-gray-400">
                            ({formatPaymentTypeLabel(row.paymentMethod)})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {row.source !== 'payment_record' && (
                    <div className="mt-2 border-t border-gray-100 pt-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(row.id)}
                        className="min-h-[44px] text-xs text-red-600 hover:text-red-800"
                      >
                        Delete line
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm font-semibold">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-normal text-gray-600">
                  <div>
                    Charges{' '}
                    <span className="font-mono font-semibold text-gray-900">
                      {formatAmount(view.totals.charges)}
                    </span>
                  </div>
                  <div>
                    Payments{' '}
                    <span className="font-mono font-semibold text-gray-900">
                      {formatAmount(view.totals.payments)}
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-gray-200 pt-2">
                    Closing{' '}
                    <span className="font-mono font-semibold text-gray-900">
                      {formatAmount(view.totals.closing)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white md:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">
                    Total charges
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Payments</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-700">
                    Running total
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-700">
                    Memo / type
                  </th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-100">
                  <td colSpan={5} className="px-3 py-2 text-center text-gray-800 font-medium">
                    Opening Balance: {formatAmount(view.opening)}
                  </td>
                  <td />
                </tr>
                {view.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-gray-600">
                      <p className="font-medium text-gray-800 mb-1">
                        No dated lines for {formatStatementDateRange(startDate, endDate)}
                      </p>
                      <p className="text-sm">
                        The monthly Excel import above only stores month totals (no daily dates).
                        Click <strong>Import Cstore detail (.xls)</strong> and upload this
                        customer&apos;s <strong>Customer Credit Report</strong> from Cstore
                        (Report type: Details) to see charge and payment dates like 5/2/2026.
                      </p>
                    </td>
                  </tr>
                ) : (
                  view.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                        {formatCstoreDisplayDate(row.date)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.charges > 0 ? formatAmount(row.charges) : formatAmount(0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.payments > 0 ? formatAmount(row.payments) : formatAmount(0)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {formatAmount(row.runningTotal)}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.memo || '—'}
                        {row.lineType === 'payment' && (
                          <span className="ml-2">
                            <select
                              className="text-xs border rounded px-1 py-0.5 bg-white"
                              value={row.paymentMethod || ''}
                              onChange={(e) =>
                                handleUpdatePaymentMethod(row.id, e.target.value)
                              }
                              disabled={row.source === 'payment_record'}
                              title={
                                row.source === 'payment_record'
                                  ? 'Edit via Record Payment'
                                  : 'Payment type (optional)'
                              }
                            >
                              <option value="">—</option>
                              <option value="cash">Cash</option>
                              <option value="check">Check</option>
                              <option value="eft">EFT</option>
                            </select>
                            {row.source === 'payment_record' && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({formatPaymentTypeLabel(row.paymentMethod)})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.source !== 'payment_record' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(row.id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
                {view.rows.length > 0 && (
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-3 py-2">Totals</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatAmount(view.totals.charges)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatAmount(view.totals.payments)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatAmount(view.totals.closing)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 max-w-sm rounded border border-gray-200 bg-white p-3 text-sm">
            <p className="font-semibold text-gray-800 mb-2 border-b pb-1">Summary</p>
            <div className="flex justify-between py-1">
              <span>Opening balance</span>
              <span className="font-mono">{formatAmount(view.opening)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Total charges</span>
              <span className="font-mono">{formatAmount(view.totals.charges)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Payments</span>
              <span className="font-mono">{formatAmount(view.totals.payments)}</span>
            </div>
            <div className="flex justify-between py-1 font-semibold border-t mt-1 pt-1">
              <span>Closing balance</span>
              <span className="font-mono">{formatAmount(view.totals.closing)}</span>
            </div>
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  )
}
