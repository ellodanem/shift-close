'use client'

import Link from 'next/link'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react'
import { useSearchParams } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'
import * as XLSX from 'xlsx'
import CustomerAccountLedgerPanel from './CustomerAccountLedgerPanel'
import { formatCstoreDisplayDate } from '@/lib/parse-customer-credit-report'

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

interface CustomerArPaymentRecord {
  id: string
  date: string
  account: string
  amount: number
  paymentMethod: string | null
  ref: string | null
  notes: string | null
}

function monthDateRange(monthKey: string): { startDate: string; endDate: string } {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    startDate: `${y}-${String(m).padStart(2, '0')}-01`,
    endDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
}

function MonthParamSync({
  onMonth
}: {
  onMonth: (monthKey: string) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const monthParam = searchParams.get('month')?.trim()
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      onMonth(monthParam)
    }
  }, [searchParams, onMonth])

  return null
}

export default function CustomerAccountsPage() {
  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}`

  const excelInputRef = useRef<HTMLInputElement>(null)
  const [summaries, setSummaries] = useState<CustomerArSummary[]>([])
  const [accounts, setAccounts] = useState<CustomerArAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [workingMonth, setWorkingMonth] = useState<string>(defaultMonth)
  const [rollForwardExpanded, setRollForwardExpanded] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const [accountSort, setAccountSort] = useState<
    'name-asc' | 'name-desc' | 'closing-desc'
  >('name-asc')

  const [openingInput, setOpeningInput] = useState<string>('')
  const [chargesInput, setChargesInput] = useState<string>('')
  const [paymentsInput, setPaymentsInput] = useState<string>('')
  const [closingInput, setClosingInput] = useState<string>('')
  const [notesInput, setNotesInput] = useState<string>('')
  const [payments, setPayments] = useState<CustomerArPaymentRecord[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [paymentDate, setPaymentDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [paymentAccount, setPaymentAccount] = useState<string>('')
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [paymentRef, setPaymentRef] = useState<string>('')
  const [paymentType, setPaymentType] = useState<'' | 'cash' | 'check' | 'eft'>('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<string | null>(
    null
  )

  const formatPaymentTypeLabel = (method: string | null) => {
    if (!method?.trim()) return '—'
    const m = method.trim().toLowerCase()
    if (m === 'cash') return 'Cash'
    if (m === 'check' || m === 'cheque') return 'Check'
    if (m === 'eft') return 'EFT'
    return method
  }

  const formatMonthLabel = (year: number, month: number) => {
    const d = new Date(year, month - 1, 1)
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const formatMonthLabelFromKey = (monthKey: string) => {
    const [y, m] = monthKey.split('-').map(Number)
    return formatMonthLabel(y, m)
  }

  const computeClosing = (s: CustomerArSummary) =>
    s.opening + s.charges - s.payments

  const fetchAccountsForMonth = useCallback(async (monthKey: string) => {
    if (!monthKey) {
      setAccounts([])
      return
    }

    const [yearStr, monthStr] = monthKey.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    if (Number.isNaN(year) || Number.isNaN(month)) {
      setAccounts([])
      return
    }

    setLoadingAccounts(true)
    try {
      const res = await fetch(
        `/api/customer-accounts/accounts?year=${year}&month=${month}`
      )
      if (!res.ok) throw new Error('Failed to fetch customer accounts')
      const data = await res.json()
      setAccounts(data)
    } catch (error) {
      console.error(error)
      setAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }, [])

  const applyWorkingMonth = useCallback(
    (monthKey: string) => {
      if (!monthKey) return
      setWorkingMonth(monthKey)
      void fetchAccountsForMonth(monthKey)
    },
    [fetchAccountsForMonth]
  )

  const fetchSummaries = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/customer-accounts/monthly')
      if (!res.ok) throw new Error('Failed to fetch customer account summaries')
      const data = await res.json()
      setSummaries(data)
      return data as CustomerArSummary[]
    } catch (error) {
      console.error(error)
      alert('Failed to load customer account summaries')
      return []
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true)
    try {
      const { startDate, endDate } = monthDateRange(workingMonth)
      const res = await fetch(
        `/api/customer-accounts/payments?startDate=${startDate}&endDate=${endDate}`
      )
      if (!res.ok) throw new Error('Failed to fetch payments')
      const data = await res.json()
      setPayments(data)
    } catch (err) {
      console.error(err)
      setPayments([])
    } finally {
      setLoadingPayments(false)
    }
  }, [workingMonth])

  useEffect(() => {
    void fetchPayments()
  }, [fetchPayments])

  useEffect(() => {
    const loadData = async () => {
      const summariesData = await fetchSummaries()
      if (summariesData && summariesData.length > 0) {
        const sorted = [...summariesData].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year
          return b.month - a.month
        })
        const mostRecent = sorted[0]
        const monthKey = `${mostRecent.year}-${String(mostRecent.month).padStart(2, '0')}`
        applyWorkingMonth(monthKey)
      } else {
        await fetchAccountsForMonth(defaultMonth)
      }
    }
    void loadData()
  }, [])

  const sortedSummaries = useMemo(
    () =>
      [...summaries].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year
        return a.month - b.month
      }),
    [summaries]
  )

  const visibleSummaries = rollForwardExpanded
    ? sortedSummaries
    : sortedSummaries.slice(-3)

  const workingSummary = useMemo(() => {
    const [y, m] = workingMonth.split('-').map(Number)
    return summaries.find((s) => s.year === y && s.month === m) ?? null
  }, [summaries, workingMonth])

  const workingMonthReconciliation = useMemo(() => {
    if (!workingSummary) return null
    const computed = computeClosing(workingSummary)
    if (workingSummary.closing == null) return null
    const diff = workingSummary.closing - computed
    return {
      computed,
      diff,
      reconciled: Math.abs(diff) < 0.01
    }
  }, [workingSummary])

  const filteredAccounts = useMemo(() => {
    let list = [...accounts]
    const q = accountSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((a) => a.account.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (accountSort === 'closing-desc') return b.closing - a.closing
      if (accountSort === 'name-desc') {
        return b.account.localeCompare(a.account, undefined, { sensitivity: 'base' })
      }
      return a.account.localeCompare(b.account, undefined, { sensitivity: 'base' })
    })
    return list
  }, [accounts, accountSearch, accountSort])

  const handleRecordPayment = async () => {
    if (!paymentDate.trim() || !paymentAccount.trim()) {
      alert('Date and customer name are required')
      return
    }
    const amt = Number(paymentAmount.replace(/[\$,]/g, ''))
    if (Number.isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount')
      return
    }
    setSavingPayment(true)
    try {
      const res = await fetch('/api/customer-accounts/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: paymentDate,
          account: paymentAccount.trim(),
          amount: amt,
          paymentMethod: paymentType.trim() || undefined,
          ref: paymentRef.trim() || undefined
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to record payment')
      }
      setPaymentAccount('')
      setPaymentAmount('')
      setPaymentRef('')
      setPaymentType('')
      setPaymentDate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      await fetchPayments()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleSave = async () => {
    if (!workingMonth) {
      alert('Please select a working month')
      return
    }

    const [yearStr, monthStr] = workingMonth.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    const opening = Number(openingInput || '0')
    const charges = Number(chargesInput || '0')
    const paymentsVal = Number(paymentsInput || '0')
    const closing =
      closingInput.trim() === '' ? null : Number(closingInput || '0')

    if ([opening, charges, paymentsVal].some((v) => Number.isNaN(v))) {
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
          payments: paymentsVal,
          closing,
          notes: notesInput
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save summary')
      }

      setOpeningInput('')
      setChargesInput('')
      setPaymentsInput('')
      setClosingInput('')
      setNotesInput('')

      await fetchSummaries()
      await fetchAccountsForMonth(workingMonth)
      alert('Customer account summary saved')
    } catch (error) {
      console.error(error)
      alert('Failed to save customer account summary')
    } finally {
      setSaving(false)
    }
  }

  const parseNumber = (value: unknown): number => {
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

    if (!workingMonth) {
      alert('Please select the working month first.')
      e.target.value = ''
      return
    }

    try {
      setImporting(true)

      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: ''
      })

      const mappedRows = rows
        .map((row) => {
          const account =
            (row.Account as string) ||
            (row['ACCOUNT'] as string) ||
            (row['Account Name'] as string) ||
            ''
          const opening = parseNumber(row.Opening ?? row['OPENING'] ?? row['Opening'])
          const charges = parseNumber(row.Credit ?? row['CREDIT'] ?? row['Credit'])
          const paymentsVal = parseNumber(
            row.Collection ?? row['COLLECTION'] ?? row['Collection']
          )
          const closing = parseNumber(row.Closing ?? row['CLOSING'] ?? row['Closing'])

          return { account, opening, charges, payments: paymentsVal, closing }
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

      const [yearStr, monthStr] = workingMonth.split('-')
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
      await fetchAccountsForMonth(workingMonth)
      alert('Customer account Excel imported successfully.')
    } catch (error) {
      console.error(error)
      alert('Failed to import customer account Excel file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const { startDate: monthStart, endDate: monthEnd } = monthDateRange(workingMonth)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelUpload}
        disabled={importing}
        className="hidden"
      />

      <Suspense fallback={null}>
        <MonthParamSync onMonth={applyWorkingMonth} />
      </Suspense>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Accounts</h1>
            <p className="text-sm text-gray-600 mt-1">
              Import monthly totals, then drill into individual accounts.
            </p>
            <p className="text-xs text-gray-500 mt-2 max-w-2xl">
              <span className="font-medium text-gray-600">Monthly:</span> Import POS
              Excel for all accounts.{' '}
              <span className="font-medium text-gray-600">Detail:</span> Open Ledger
              on a customer to import the Cstore Credit Report (Details).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={importing}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import Excel'}
            </button>
            <Link
              href="/customer-accounts/statement"
              className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50"
            >
              Account Statement
            </Link>
          </div>
        </div>

        {/* Working month bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Working month
                </label>
                <input
                  type="month"
                  value={workingMonth}
                  onChange={(e) => applyWorkingMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-xs text-gray-500 pb-2 max-w-xs">
                Drives import, account list, and recorded payments for{' '}
                {formatMonthLabelFromKey(workingMonth)}.
              </p>
            </div>
            {workingMonthReconciliation && (
              <div className="flex items-center gap-2 text-sm">
                {workingMonthReconciliation.reconciled ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-800 border border-green-200 font-medium text-xs">
                    Reconciled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-800 border border-red-200 font-medium text-xs">
                    Out of balance
                  </span>
                )}
                <span className="text-xs text-gray-600 font-mono">
                  Difference{' '}
                  {workingMonthReconciliation.diff >= 0 ? '+' : ''}
                  {formatAmount(workingMonthReconciliation.diff)} vs POS
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Account Breakdown — primary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Account Breakdown — {formatMonthLabelFromKey(workingMonth)}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search accounts…"
                className="px-3 py-1.5 border border-gray-300 rounded text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={accountSort}
                onChange={(e) =>
                  setAccountSort(
                    e.target.value as 'name-asc' | 'name-desc' | 'closing-desc'
                  )
                }
                className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white"
              >
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
                <option value="closing-desc">Closing (high–low)</option>
              </select>
            </div>
          </div>

          {loadingAccounts ? (
            <p className="text-gray-600 text-sm">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No account breakdown for this month. Click{' '}
              <button
                type="button"
                onClick={() => excelInputRef.current?.click()}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Import Excel
              </button>{' '}
              to load customer accounts from your POS export.
            </p>
          ) : filteredAccounts.length === 0 ? (
            <p className="text-gray-500 text-sm">No accounts match your search.</p>
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
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAccounts.map((acc) => (
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
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLedgerAccount(acc.account)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm mr-3"
                        >
                          Ledger
                        </button>
                        <Link
                          href={`/customer-accounts/statement?account=${encodeURIComponent(acc.account)}&startDate=${monthStart}&endDate=${monthEnd}&mode=summary`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                        >
                          Statement
                        </Link>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-4 py-2 text-gray-900">Total</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accounts.reduce((s, a) => s + a.opening, 0))}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accounts.reduce((s, a) => s + a.charges, 0))}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accounts.reduce((s, a) => s + a.payments, 0))}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accounts.reduce((s, a) => s + a.closing, 0))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Company roll-forward — secondary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800">
                Company roll-forward
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                Reconciliation
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Closing (computed) = Opening + Charges − Payments
            </p>
          </div>

          {loading ? (
            <p className="text-gray-600 text-sm">Loading summaries…</p>
          ) : summaries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No customer account summaries recorded yet.
            </p>
          ) : (
            <>
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
                        Closing
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">
                        Diff
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {visibleSummaries.map((s) => {
                      const computed = computeClosing(s)
                      const diff = s.closing != null ? s.closing - computed : null
                      return (
                        <tr
                          key={s.id}
                          className={`hover:bg-gray-50 ${
                            `${s.year}-${String(s.month).padStart(2, '0')}` ===
                            workingMonth
                              ? 'bg-indigo-50/40'
                              : ''
                          }`}
                        >
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {sortedSummaries.length > 3 && (
                <button
                  type="button"
                  onClick={() => setRollForwardExpanded((v) => !v)}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  {rollForwardExpanded
                    ? 'Show recent months only'
                    : `Show all ${sortedSummaries.length} months`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Record payment — collapsed */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2 list-none">
              <span className="text-indigo-600 font-semibold">+</span>
              <span>Record payment</span>
              <span className="text-xs text-gray-500 font-normal">
                Capture a payment as received
              </span>
            </summary>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Customer
                  </label>
                  <input
                    type="text"
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    placeholder="e.g. Distillers, Barbay"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Amount
                  </label>
                  <input
                    type="text"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="px-3 py-2 border border-gray-300 rounded text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Type (optional)
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) =>
                      setPaymentType(e.target.value as '' | 'cash' | 'check' | 'eft')
                    }
                    className="px-3 py-2 border border-gray-300 rounded text-sm bg-white min-w-[7.5rem] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">—</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="eft">EFT</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Ref (optional)
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="Cheque #"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleRecordPayment()}
                  disabled={savingPayment}
                  className="px-5 py-2 bg-indigo-600 text-white rounded font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingPayment ? 'Saving…' : 'Record'}
                </button>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Recorded payments — {formatMonthLabelFromKey(workingMonth)}
                </h3>
                {loadingPayments ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : payments.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No payments recorded for this month.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">
                            Date
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">
                            Customer
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-700">
                            Amount
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">
                            Type
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700">
                            Ref
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {payments.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                              {formatCstoreDisplayDate(p.date)}
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {p.account}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {formatAmount(p.amount)}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {formatPaymentTypeLabel(p.paymentMethod)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{p.ref || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100">
                        <tr className="font-semibold">
                          <td className="px-3 py-2" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatAmount(payments.reduce((s, p) => s + p.amount, 0))}
                          </td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>

        {/* Manual entry — collapsed */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-2 list-none">
              <span>Manual entry (totals only)</span>
              <span className="text-xs text-gray-500 font-normal group-open:hidden">
                Fallback when Excel is unavailable
              </span>
            </summary>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-4">
                Saves company-wide totals for{' '}
                <strong>{formatMonthLabelFromKey(workingMonth)}</strong> only — not
                individual account breakdown. Change the working month above if needed.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Opening</label>
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
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="px-5 py-2 bg-gray-600 text-white rounded font-semibold text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save totals only'}
                </button>
              </div>
            </div>
          </details>
        </div>

        {selectedLedgerAccount && (
          <CustomerAccountLedgerPanel
            account={selectedLedgerAccount}
            monthKey={workingMonth}
            onClose={() => setSelectedLedgerAccount(null)}
            onMonthChange={(monthKey) => {
              applyWorkingMonth(monthKey)
            }}
            onImported={(monthKey) => {
              const m = monthKey ?? workingMonth
              if (m) void fetchAccountsForMonth(m)
              void fetchSummaries()
            }}
          />
        )}
      </div>
    </div>
  )
}
