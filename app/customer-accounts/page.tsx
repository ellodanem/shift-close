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
  rolled?: boolean
  cstoreName?: string | null
  directoryId?: string | null
}

interface DirectoryCustomer {
  id: string
  name: string
  cstoreName: string | null
  active: boolean
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
  onMonth,
  onPay,
  onAccount
}: {
  onMonth: (monthKey: string) => void
  onPay?: () => void
  onAccount?: (account: string) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const monthParam = searchParams.get('month')?.trim()
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      onMonth(monthParam)
    }
    const account = searchParams.get('account')?.trim()
    if (account) onAccount?.(account)
    if (searchParams.get('pay') === '1') onPay?.()
  }, [searchParams, onMonth, onPay, onAccount])

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
  >('closing-desc')
  const [paymentFormOpen, setPaymentFormOpen] = useState(false)

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
  const [directory, setDirectory] = useState<DirectoryCustomer[]>([])
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCstoreName, setNewCstoreName] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)

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

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await fetch('/api/customer-accounts/directory')
      if (!res.ok) throw new Error('Failed to load customer list')
      const data = await res.json()
      setDirectory(data.customers || [])
    } catch (error) {
      console.error(error)
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
    void fetchDirectory()
  }, [fetchDirectory])

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

  const accountTotals = useMemo(
    () => ({
      opening: accounts.reduce((s, a) => s + a.opening, 0),
      charges: accounts.reduce((s, a) => s + a.charges, 0),
      payments: accounts.reduce((s, a) => s + a.payments, 0),
      closing: accounts.reduce((s, a) => s + a.closing, 0)
    }),
    [accounts]
  )

  const activeCustomerCount = directory.filter((c) => c.active).length
  const inactiveCustomerCount = directory.filter((c) => !c.active).length
  const paymentMatch = accounts.find(
    (a) => a.account.toLowerCase() === paymentAccount.trim().toLowerCase()
  )
  const noPaymentsThisMonth =
    accounts.length > 0 && Math.abs(accountTotals.payments) < 0.01

  const openRecordPayment = (account?: string) => {
    if (account) setPaymentAccount(account)
    setPaymentFormOpen(true)
  }

  const applyPayQuery = useCallback(() => {
    setPaymentFormOpen(true)
  }, [])

  const applyAccountQuery = useCallback((account: string) => {
    setSelectedLedgerAccount(account)
  }, [])

  const addDirectoryCustomer = async () => {
    const name = newCustomerName.trim()
    if (!name) return
    setSavingCustomer(true)
    try {
      const res = await fetch('/api/customer-accounts/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          cstoreName: newCstoreName.trim() || undefined
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to add customer')
      setNewCustomerName('')
      setNewCstoreName('')
      await fetchDirectory()
      await fetchAccountsForMonth(workingMonth)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add customer')
    } finally {
      setSavingCustomer(false)
    }
  }

  const setDirectoryActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/customer-accounts/directory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      })
      if (!res.ok) throw new Error('Failed to update customer')
      await fetchDirectory()
      await fetchAccountsForMonth(workingMonth)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update customer')
    }
  }

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
      await fetchAccountsForMonth(workingMonth)
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

  useEffect(() => {
    if (!paymentFormOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaymentFormOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paymentFormOpen])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-28 sm:p-8 md:pb-10">
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelUpload}
        disabled={importing}
        className="hidden"
      />

      <Suspense fallback={null}>
        <MonthParamSync
          onMonth={applyWorkingMonth}
          onPay={applyPayQuery}
          onAccount={applyAccountQuery}
        />
      </Suspense>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Customer Accounts
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {activeCustomerCount} customer{activeCustomerCount === 1 ? '' : 's'}
              {inactiveCustomerCount > 0 ? ` · ${inactiveCustomerCount} inactive` : ''}
              {' · '}harvest uses this list
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <div className="col-span-2 sm:col-auto">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Working month
              </label>
              <input
                type="month"
                value={workingMonth}
                onChange={(e) => applyWorkingMonth(e.target.value)}
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-auto"
              />
            </div>
            <button
              type="button"
              onClick={() => openRecordPayment()}
              className="col-span-2 hidden min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 md:inline-flex md:items-center md:self-end"
            >
              Record payment
            </button>
            <Link
              href="/customer-accounts/statement"
              className="min-h-[44px] rounded border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-800 hover:bg-gray-50 sm:min-h-0 md:self-end"
            >
              Account Statement
            </Link>
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={importing}
              className="min-h-[44px] rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 sm:min-h-0 md:self-end"
            >
              {importing ? 'Importing…' : 'Import Excel'}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {workingMonthReconciliation ? (
              <>
                {workingMonthReconciliation.reconciled ? (
                  <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
                    Reconciled
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
                    Out of balance
                  </span>
                )}
                <span className="font-mono text-xs text-gray-600">
                  Difference{' '}
                  {workingMonthReconciliation.diff >= 0 ? '+' : ''}
                  {formatAmount(workingMonthReconciliation.diff)} vs POS
                </span>
              </>
            ) : (
              <span className="text-xs text-gray-500">
                No POS closing recorded for {formatMonthLabelFromKey(workingMonth)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDirectoryOpen((v) => !v)}
            className="min-h-[44px] text-left text-sm font-medium text-indigo-600 hover:text-indigo-800 sm:min-h-0"
          >
            {directoryOpen
              ? 'Hide customer list'
              : `Manage ${activeCustomerCount} customers`}
          </button>
        </div>

        {directoryOpen && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-4 text-xs text-gray-500">
            Harvest jobs use this list, not the Cstore dropdown order.
          </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
                <div className="min-w-0 flex-1 sm:flex-none">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Name in Shift Close
                  </label>
                  <input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0 sm:w-56"
                    placeholder="e.g. CPJ"
                  />
                </div>
                <div className="min-w-0 flex-1 sm:flex-none">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Cstore name (if different)
                  </label>
                  <input
                    value={newCstoreName}
                    onChange={(e) => setNewCstoreName(e.target.value)}
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0 sm:w-56"
                    placeholder="Optional alias"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void addDirectoryCustomer()}
                  disabled={savingCustomer || !newCustomerName.trim()}
                  className="min-h-[44px] rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:min-h-0"
                >
                  {savingCustomer ? 'Adding…' : 'Add customer'}
                </button>
              </div>
              {directory.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No customers yet. Names from past months are loaded automatically when
                  this page opens, or add one above.
                </p>
              ) : (
                <>
                  <div className="max-h-64 space-y-2 overflow-y-auto md:hidden">
                    {directory.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"
                      >
                        <div className="font-medium text-gray-900">{c.name}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          Cstore: {c.cstoreName || '—'}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2">
                          {c.active ? (
                            <span className="text-xs font-semibold text-green-800">Active</span>
                          ) : (
                            <span className="text-xs text-gray-500">Inactive</span>
                          )}
                          <button
                            type="button"
                            onClick={() => void setDirectoryActive(c.id, !c.active)}
                            className="min-h-[44px] text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            {c.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden max-h-64 overflow-x-auto overflow-y-auto md:block">
                    <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium">Cstore name</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 font-medium"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {directory.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium text-gray-900">{c.name}</td>
                          <td className="py-2 pr-4 text-gray-600">{c.cstoreName || '—'}</td>
                          <td className="py-2 pr-4">
                            {c.active ? (
                              <span className="text-green-800 text-xs font-semibold">Active</span>
                            ) : (
                              <span className="text-gray-500 text-xs">Inactive</span>
                            )}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => void setDirectoryActive(c.id, !c.active)}
                              className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                            >
                              {c.active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>
        </div>
        )}

        {!loadingAccounts && accounts.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
              <div className="text-xs font-medium text-gray-500">Opening</div>
              <div className="mt-1 font-mono text-lg font-semibold text-gray-900 sm:text-xl">
                {formatAmount(accountTotals.opening)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
              <div className="text-xs font-medium text-gray-500">Charges</div>
              <div className="mt-1 font-mono text-lg font-semibold text-gray-900 sm:text-xl">
                {formatAmount(accountTotals.charges)}
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 sm:p-4 ${
                noPaymentsThisMonth
                  ? 'border-amber-200 bg-amber-50/70'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  noPaymentsThisMonth ? 'text-amber-800' : 'text-gray-500'
                }`}
              >
                Payments this month
              </div>
              <div
                className={`mt-1 font-mono text-lg font-semibold sm:text-xl ${
                  noPaymentsThisMonth ? 'text-amber-950' : 'text-gray-900'
                }`}
              >
                {formatAmount(accountTotals.payments)}
              </div>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 sm:p-4">
              <div className="text-xs font-medium text-indigo-800">Closing</div>
              <div className="mt-1 font-mono text-xl font-semibold text-gray-900 sm:text-2xl">
                {formatAmount(accountTotals.closing)}
              </div>
            </div>
          </div>
        )}

        {/* Account Breakdown — primary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Account Breakdown — {formatMonthLabelFromKey(workingMonth)}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              <input
                type="search"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search accounts…"
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:min-h-0 sm:w-44 sm:py-1.5"
              />
              <select
                value={accountSort}
                onChange={(e) =>
                  setAccountSort(
                    e.target.value as 'name-asc' | 'name-desc' | 'closing-desc'
                  )
                }
                className="min-h-[44px] rounded border border-gray-300 bg-white px-3 py-2 text-sm sm:min-h-0 sm:py-1.5"
              >
                <option value="closing-desc">Closing (high–low)</option>
                <option value="name-asc">Name A–Z</option>
                <option value="name-desc">Name Z–A</option>
              </select>
            </div>
          </div>

          {loadingAccounts ? (
            <p className="text-gray-600 text-sm">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No customers in the Shift Close list yet. Open{' '}
              <button
                type="button"
                onClick={() => setDirectoryOpen(true)}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Customer list
              </button>{' '}
              to add names. Excel import can still add people when you confirm a POS file.
            </p>
          ) : filteredAccounts.length === 0 ? (
            <p className="text-gray-500 text-sm">No accounts match your search.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredAccounts.map((acc) => {
                  const quiet =
                    Math.abs(acc.closing) < 0.01 && Math.abs(acc.charges) < 0.01
                  return (
                  <div
                    key={acc.id}
                    className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${
                      quiet ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-medium text-gray-900">
                        {acc.account}
                        {acc.rolled ? (
                          <span className="ml-2 text-[11px] font-normal text-gray-500">
                            rolled from last month
                          </span>
                        ) : null}
                      </div>
                      <div className="shrink-0 font-mono text-base font-semibold text-gray-900">
                        {formatAmount(acc.closing)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-600">
                      Opening {formatAmount(acc.opening)}
                      {' · '}Charges {formatAmount(acc.charges)}
                      {' · '}Payments {formatAmount(acc.payments)}
                    </div>
                    <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setSelectedLedgerAccount(acc.account)}
                        className="min-h-[44px] text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Ledger
                      </button>
                      <Link
                        href={`/customer-accounts/statement?account=${encodeURIComponent(acc.account)}&startDate=${monthStart}&endDate=${monthEnd}&mode=summary`}
                        className="min-h-[44px] text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Statement
                      </Link>
                    </div>
                  </div>
                  )
                })}
                <div className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm font-semibold">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900">Total</span>
                    <span className="font-mono">{formatAmount(accountTotals.closing)}</span>
                  </div>
                </div>
              </div>
              <div className="hidden overflow-x-auto md:block">
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
                  {filteredAccounts.map((acc) => {
                    const quiet =
                      Math.abs(acc.closing) < 0.01 && Math.abs(acc.charges) < 0.01
                    return (
                    <tr
                      key={acc.id}
                      className={`cursor-pointer hover:bg-indigo-50/40 ${
                        quiet ? 'text-gray-400' : ''
                      }`}
                      onClick={() => setSelectedLedgerAccount(acc.account)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedLedgerAccount(acc.account)
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className={`px-4 py-2 font-medium ${quiet ? '' : 'text-gray-900'}`}>
                        {acc.account}
                        {acc.rolled ? (
                          <span className="ml-2 text-[11px] font-normal text-gray-500">
                            rolled from last month
                          </span>
                        ) : null}
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
                      <td className={`px-4 py-2 text-right font-mono font-semibold ${quiet ? '' : 'text-gray-900'}`}>
                        {formatAmount(acc.closing)}
                      </td>
                    </tr>
                    )
                  })}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-4 py-2 text-gray-900">Total</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accountTotals.opening)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accountTotals.charges)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accountTotals.payments)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatAmount(accountTotals.closing)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-500">
                Click a row to open the ledger. Use Account Statement in the header
                for a printable statement.
              </p>
              </div>
            </>
          )}
        </div>

        {/* Company roll-forward — secondary */}
        <details className="group mb-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800">
                  Company roll-forward
                </h2>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Reconciliation
                </span>
              </div>
              <span className="text-xs font-medium text-indigo-600 group-open:hidden">
                Show months
              </span>
              <span className="hidden text-xs font-medium text-indigo-600 group-open:inline">
                Hide months
              </span>
            </div>
          </summary>
          <div className="mt-4">
          <p className="mb-4 text-xs text-gray-500">
            Closing (computed) = Opening + Charges − Payments
          </p>

          {loading ? (
            <p className="text-gray-600 text-sm">Loading summaries…</p>
          ) : summaries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No customer account summaries recorded yet.
            </p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {visibleSummaries.map((s) => {
                  const computed = computeClosing(s)
                  const diff = s.closing != null ? s.closing - computed : null
                  const isWorking =
                    `${s.year}-${String(s.month).padStart(2, '0')}` === workingMonth
                  return (
                    <div
                      key={s.id}
                      className={`rounded-lg border p-3 text-sm ${
                        isWorking
                          ? 'border-indigo-200 bg-indigo-50/40'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        {formatMonthLabel(s.year, s.month)}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                        <div>
                          Opening{' '}
                          <span className="font-mono text-gray-900">{formatAmount(s.opening)}</span>
                        </div>
                        <div>
                          Charges{' '}
                          <span className="font-mono text-gray-900">{formatAmount(s.charges)}</span>
                        </div>
                        <div>
                          Payments{' '}
                          <span className="font-mono text-gray-900">{formatAmount(s.payments)}</span>
                        </div>
                        <div>
                          Closing{' '}
                          <span className="font-mono font-semibold text-gray-900">
                            {formatAmount(computed)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 border-t border-gray-100 pt-2 text-xs">
                        Diff{' '}
                        <span
                          className={`font-mono ${
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
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
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
        </details>

        {/* Record payment modal */}
        {paymentFormOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            onClick={() => setPaymentFormOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payment-title"
          >
            <div
              className="mb-8 mt-4 w-full max-w-lg rounded-lg border border-gray-200 bg-white sm:mt-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 id="record-payment-title" className="text-lg font-semibold text-gray-900">
                  Record payment
                </h2>
                <p className="mt-0.5 text-xs text-gray-600">
                  {formatMonthLabelFromKey(workingMonth)}
                  {noPaymentsThisMonth
                    ? ' · payments this month are still $0.00'
                    : ''}
                </p>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Customer
                  </label>
                  <input
                    list="customer-account-names"
                    type="text"
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    placeholder="e.g. Distillers, Barbay"
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <datalist id="customer-account-names">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.account} />
                    ))}
                  </datalist>
                  {paymentMatch ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Closing {formatAmount(paymentMatch.closing)}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Amount
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['cash', 'Cash'],
                      ['check', 'Check'],
                      ['eft', 'EFT']
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setPaymentType((prev) => (prev === value ? '' : value))
                        }
                        className={`min-h-[44px] rounded border px-3 py-2 text-sm font-semibold ${
                          paymentType === value
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Ref (optional)
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="Cheque #"
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {noPaymentsThisMonth ? (
                  <p className="text-xs text-gray-500">
                    This will reduce the {formatMonthLabelFromKey(workingMonth)} closing.
                    Payments this month are still $0.00.
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPaymentFormOpen(false)}
                    className="min-h-[44px] rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRecordPayment()}
                    disabled={savingPayment}
                    className="min-h-[44px] rounded bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {savingPayment ? 'Saving…' : 'Save payment'}
                  </button>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700">
                    Recorded this month
                  </h3>
                  {loadingPayments ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                  ) : payments.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No payments recorded for {formatMonthLabelFromKey(workingMonth)}.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-start justify-between gap-2 rounded border border-gray-200 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{p.account}</div>
                            <div className="text-xs text-gray-600">
                              {formatCstoreDisplayDate(p.date)}
                              {' · '}
                              {formatPaymentTypeLabel(p.paymentMethod)}
                              {p.ref ? ` · ${p.ref}` : ''}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono font-semibold text-gray-900">
                            {formatAmount(p.amount)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Total</span>
                        <span className="font-mono">
                          {formatAmount(payments.reduce((s, p) => s + p.amount, 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
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
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
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
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
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
                    className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
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
                  className="min-h-[44px] rounded bg-gray-600 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50 sm:min-h-0"
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

      {!paymentFormOpen && !selectedLedgerAccount ? (
        <div className="fixed bottom-[4.75rem] left-4 right-4 z-40 md:hidden">
          <button
            type="button"
            onClick={() => openRecordPayment()}
            className="min-h-[44px] w-full rounded bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Record payment
          </button>
        </div>
      ) : null}
    </div>
  )
}
