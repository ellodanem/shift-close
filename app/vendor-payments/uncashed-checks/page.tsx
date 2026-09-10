'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount, roundMoney } from '@/lib/fuelPayments'
import { formatInvoiceDate, invoiceDateToInputValue } from '@/lib/invoiceHelpers'
import {
  type MonthFilterType,
  matchesMonthFilter,
  monthFilterLabel,
  sortChecksCurrentMonthFirst
} from '@/lib/monthFilter'

interface CheckRow {
  id: string
  source: 'vendor' | 'cashbook'
  vendorId: string | null
  paymentDate: string
  payee: string
  bankRef: string
  totalAmount: number
  clearedAt?: string
}

type TabType = 'uncashed' | 'cleared'

function formatDate(d: string) {
  return formatInvoiceDate(d)
}

function sourceLabel(source: CheckRow['source']) {
  return source === 'vendor' ? 'Vendor payment' : 'Cashbook'
}

function normalizeChecks(data: unknown, includeCleared: boolean): CheckRow[] {
  if (!Array.isArray(data)) return []

  return data.map((raw) => {
    const item = raw as Record<string, unknown>
    const vendor = item.vendor as { id?: string; name?: string } | undefined
    const rawId = String(item.id ?? '')
    const source =
      item.source === 'cashbook' || item.source === 'vendor'
        ? item.source
        : vendor
          ? 'vendor'
          : 'cashbook'

    let id = rawId
    if (rawId && !rawId.includes(':')) {
      id = `${source}:${rawId}`
    }

    const row: CheckRow = {
      id,
      source,
      vendorId:
        typeof item.vendorId === 'string'
          ? item.vendorId
          : vendor?.id ?? null,
      paymentDate: String(item.paymentDate ?? item.date ?? ''),
      payee: String(item.payee ?? vendor?.name ?? item.description ?? '—'),
      bankRef: String(item.bankRef ?? item.ref ?? '—'),
      totalAmount: Number(item.totalAmount ?? item.debitCheck ?? 0)
    }

    if (includeCleared && item.clearedAt) {
      row.clearedAt = String(item.clearedAt)
    }

    return row
  })
}

function rowKey(check: CheckRow) {
  return `${check.id}|${check.bankRef}|${check.paymentDate}`
}

function filterButtonClass(active: boolean) {
  return `min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
    active
      ? 'bg-blue-600 text-white'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
  }`
}

function tabButtonClass(active: boolean) {
  return `min-h-[44px] border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
    active
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-600 hover:text-gray-900'
  }`
}

function checkMatchesSearch(check: CheckRow, query: string): boolean {
  const raw = query.trim()
  if (!raw) return true

  const q = raw.toLowerCase()
  const qNoHash = q.replace(/^#/, '')

  if (check.payee.toLowerCase().includes(q)) return true

  const ref = check.bankRef.toLowerCase()
  if (ref.includes(q) || ref.replace(/^#/, '').includes(qNoHash)) return true

  const amountQuery = q.replace(/[$,]/g, '')
  if (!amountQuery) return false

  const rounded = roundMoney(check.totalAmount)
  const haystack = [
    rounded.toFixed(2),
    formatAmount(check.totalAmount).toLowerCase(),
    formatAmount(check.totalAmount).replace(/,/g, ''),
    String(rounded)
  ]

  if (haystack.some((value) => value.includes(amountQuery))) return true

  const asNumber = Number(amountQuery)
  return !Number.isNaN(asNumber) && roundMoney(asNumber) === rounded
}

export default function CheckManagementPage() {
  const router = useRouter()
  const [uncashedChecks, setUncashedChecks] = useState<CheckRow[]>([])
  const [clearedChecks, setClearedChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('uncashed')
  const [monthFilter, setMonthFilter] = useState<MonthFilterType>('all')
  const [customMonth, setCustomMonth] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [clearingId, setClearingId] = useState<string | null>(null)
  const [pendingClear, setPendingClear] = useState<CheckRow | null>(null)
  const [pendingDateEdit, setPendingDateEdit] = useState<CheckRow | null>(null)
  const [clearedDate, setClearedDate] = useState('')

  const fetchChecks = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const [uncashedRes, clearedRes] = await Promise.all([
        fetch('/api/vendor-payments/uncashed-checks', { cache: 'no-store' }),
        fetch('/api/vendor-payments/cleared-checks', { cache: 'no-store' })
      ])

      if (uncashedRes.ok) {
        const data = await uncashedRes.json()
        setUncashedChecks(normalizeChecks(data, false))
      }
      if (clearedRes.ok) {
        const data = await clearedRes.json()
        setClearedChecks(normalizeChecks(data, true))
      }
    } catch (error) {
      console.error('Error fetching checks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChecks()
  }, [])

  const activeChecks = activeTab === 'uncashed' ? uncashedChecks : clearedChecks

  const filteredChecks = useMemo(() => {
    const matched = activeChecks.filter(
      (check) =>
        matchesMonthFilter(check.paymentDate, monthFilter, customMonth) &&
        checkMatchesSearch(check, searchQuery)
    )

    if (monthFilter === 'all') {
      return sortChecksCurrentMonthFirst(matched)
    }

    return [...matched].sort((a, b) => {
      const dateCmp = b.paymentDate.localeCompare(a.paymentDate)
      if (dateCmp !== 0) return dateCmp
      return a.bankRef.localeCompare(b.bankRef)
    })
  }, [activeChecks, monthFilter, customMonth, searchQuery])

  const otherTabMatchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0
    const otherChecks = activeTab === 'uncashed' ? clearedChecks : uncashedChecks
    return otherChecks.filter(
      (check) =>
        matchesMonthFilter(check.paymentDate, monthFilter, customMonth) &&
        checkMatchesSearch(check, searchQuery)
    ).length
  }, [
    activeTab,
    clearedChecks,
    customMonth,
    monthFilter,
    searchQuery,
    uncashedChecks
  ])

  const totalAmount = useMemo(
    () => filteredChecks.reduce((sum, check) => sum + check.totalAmount, 0),
    [filteredChecks]
  )

  const monthLabel = monthFilterLabel(monthFilter, customMonth)

  const pendingCheck = pendingClear ?? pendingDateEdit
  const isEditingClearedDate = pendingDateEdit != null

  const openClearModal = (check: CheckRow) => {
    setPendingDateEdit(null)
    setPendingClear(check)
    setClearedDate('')
  }

  const openDateEditModal = (check: CheckRow) => {
    setPendingClear(null)
    setPendingDateEdit(check)
    setClearedDate(
      check.clearedAt ? invoiceDateToInputValue(check.clearedAt) : ''
    )
  }

  const closeCheckModal = () => {
    if (clearingId) return
    setPendingClear(null)
    setPendingDateEdit(null)
    setClearedDate('')
  }

  const handleConfirmClear = async () => {
    if (!pendingClear) return

    setClearingId(pendingClear.id)
    try {
      const trimmedDate = clearedDate.trim()
      const res = await fetch(
        `/api/vendor-payments/uncashed-checks/${encodeURIComponent(pendingClear.id)}/clear`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trimmedDate ? { clearedAt: trimmedDate } : {})
        }
      )
      if (res.ok) {
        setPendingClear(null)
        setClearedDate('')
        fetchChecks({ silent: true })
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to clear check')
      }
    } catch (error) {
      console.error('Error clearing check:', error)
      alert('Failed to clear check')
    } finally {
      setClearingId(null)
    }
  }

  const handleConfirmDateEdit = async () => {
    if (!pendingDateEdit) return
    const trimmedDate = clearedDate.trim()
    if (!trimmedDate) {
      alert('Choose a cleared date.')
      return
    }

    setClearingId(pendingDateEdit.id)
    try {
      const res = await fetch(
        `/api/vendor-payments/uncashed-checks/${encodeURIComponent(pendingDateEdit.id)}/cleared-at`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearedAt: trimmedDate })
        }
      )
      if (res.ok) {
        setPendingDateEdit(null)
        setClearedDate('')
        fetchChecks({ silent: true })
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update cleared date')
      }
    } catch (error) {
      console.error('Error updating cleared date:', error)
      alert('Failed to update cleared date')
    } finally {
      setClearingId(null)
    }
  }

  const summaryText = useMemo(() => {
    const isUncashed = activeTab === 'uncashed'
    const filteredCount = filteredChecks.length
    const totalCount = activeChecks.length

    if (totalCount === 0) {
      return isUncashed
        ? 'All outstanding checks — vendor payments and cashbook expenses — until cleared at the bank'
        : 'Checks cleared at the bank — vendor payments and cashbook expenses'
    }

    const searchLabel = searchQuery.trim()
      ? ` matching “${searchQuery.trim()}”`
      : ''
    const monthBit = monthLabel ? ` in ${monthLabel}` : ''
    const scope =
      filteredCount !== totalCount
        ? `${filteredCount} of ${totalCount} check${totalCount === 1 ? '' : 's'}${monthBit}${searchLabel}`
        : `${filteredCount} check${filteredCount === 1 ? '' : 's'}${monthBit}${searchLabel}`

    if (isUncashed) {
      return `${scope} outstanding totaling ${formatAmount(totalAmount)}`
    }

    return `${scope} cleared totaling ${formatAmount(totalAmount)}`
  }, [
    activeTab,
    activeChecks.length,
    filteredChecks.length,
    monthLabel,
    searchQuery,
    totalAmount
  ])

  const emptyMessage = searchQuery.trim()
    ? `No ${activeTab} checks match “${searchQuery.trim()}”.`
    : activeTab === 'uncashed'
      ? 'No uncashed checks.'
      : 'No cleared checks.'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading checks...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-gray-50 px-4 py-4 pb-10 sm:p-8 sm:pb-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Check Management
            </h1>
            <p className="mt-1 text-sm text-gray-600">{summaryText}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              ← Vendors
            </button>
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/make-payment')}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Make Payment
            </button>
          </div>
        </div>

        <div className="mb-4 max-w-sm">
          <label
            htmlFor="check-search"
            className="mb-1 block text-xs font-medium text-gray-500"
          >
            Search
          </label>
          <input
            id="check-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Amount, vendor, or check #"
            className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:py-1.5"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Payment month
          </label>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => {
                setMonthFilter('all')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'all')}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthFilter('thisMonth')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'thisMonth')}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthFilter('lastMonth')
                setCustomMonth('')
              }}
              className={filterButtonClass(monthFilter === 'lastMonth')}
            >
              Previous Month
            </button>
            <button
              type="button"
              onClick={() => setMonthFilter('custom')}
              className={filterButtonClass(monthFilter === 'custom')}
            >
              Custom
            </button>
            {monthFilter === 'custom' && (
              <input
                type="month"
                value={customMonth}
                onChange={(e) => setCustomMonth(e.target.value)}
                className="col-span-2 min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-auto"
              />
            )}
          </div>
        </div>

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 pb-3 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('uncashed')}
            className={`shrink-0 ${tabButtonClass(activeTab === 'uncashed')}`}
          >
            Uncashed ({uncashedChecks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cleared')}
            className={`shrink-0 ${tabButtonClass(activeTab === 'cleared')}`}
          >
            Cleared ({clearedChecks.length})
          </button>
        </div>

        {filteredChecks.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <p className="mb-4 text-gray-500">{emptyMessage}</p>
            {searchQuery.trim() && otherTabMatchCount > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setActiveTab(activeTab === 'uncashed' ? 'cleared' : 'uncashed')
                }
                className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
              >
                View {otherTabMatchCount} match
                {otherTabMatchCount === 1 ? '' : 'es'} in{' '}
                {activeTab === 'uncashed' ? 'Cleared' : 'Uncashed'}
              </button>
            ) : (
              activeTab === 'uncashed' &&
              !searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => router.push('/vendor-payments/make-payment')}
                  className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
                >
                  Make Payment
                </button>
              )
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredChecks.map((check) => (
                <div
                  key={rowKey(check)}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{check.payee}</div>
                      <div className="mt-0.5 text-xs text-gray-600">
                        {formatDate(check.paymentDate)} · {sourceLabel(check.source)}
                      </div>
                      <div className="mt-0.5 font-mono text-sm text-gray-700">
                        #{check.bankRef}
                      </div>
                      {activeTab === 'cleared' && (
                        <div className="mt-1 text-xs text-green-700">
                          {check.clearedAt
                            ? `Cleared ${formatDate(check.clearedAt)}`
                            : 'Cleared'}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono font-semibold text-gray-900">
                      {formatAmount(check.totalAmount)}
                    </span>
                  </div>
                  {activeTab === 'uncashed' && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openClearModal(check)}
                        disabled={clearingId === check.id}
                        className="min-h-[44px] w-full rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {clearingId === check.id ? 'Clearing...' : 'Mark as cleared'}
                      </button>
                    </div>
                  )}
                  {activeTab === 'cleared' && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() => openDateEditModal(check)}
                        disabled={clearingId === check.id}
                        className="min-h-[44px] w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {clearingId === check.id ? 'Saving...' : 'Change cleared date'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">
                    {filteredChecks.length} check
                    {filteredChecks.length === 1 ? '' : 's'}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {formatAmount(totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm md:block">
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Payee / Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Check #
                    </th>
                    {activeTab === 'cleared' && (
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Cleared
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Amount
                    </th>
                    {activeTab === 'uncashed' && (
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                        Action
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredChecks.map((check) => (
                    <tr key={rowKey(check)} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                        {formatDate(check.paymentDate)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                        {sourceLabel(check.source)}
                      </td>
                      <td
                        className="max-w-xs truncate px-6 py-4 text-sm text-gray-900"
                        title={check.payee}
                      >
                        {check.payee}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-700">
                        {check.bankRef}
                      </td>
                      {activeTab === 'cleared' && (
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>
                              {check.clearedAt ? formatDate(check.clearedAt) : '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => openDateEditModal(check)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                              Change
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                        {formatAmount(check.totalAmount)}
                      </td>
                      {activeTab === 'uncashed' && (
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openClearModal(check)}
                            disabled={clearingId === check.id}
                            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {clearingId === check.id
                              ? 'Clearing...'
                              : 'Mark as cleared'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50">
                  <tr>
                    <td
                      colSpan={activeTab === 'cleared' ? 5 : 4}
                      className="px-6 py-3 text-sm font-medium text-gray-700"
                    >
                      {filteredChecks.length} check
                      {filteredChecks.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      {formatAmount(totalAmount)}
                    </td>
                    {activeTab === 'uncashed' && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {pendingCheck && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={closeCheckModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-check-title"
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="clear-check-title"
              className="text-lg font-bold text-gray-900"
            >
              {isEditingClearedDate
                ? 'Set cleared date'
                : 'Mark check as cleared'}
            </h2>
            {!isEditingClearedDate && (
              <p className="mt-2 text-sm text-gray-600">
                This will deduct {formatAmount(pendingCheck.totalAmount)} from
                available funds.
              </p>
            )}
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <div className="font-medium text-gray-900">{pendingCheck.payee}</div>
              <div className="mt-0.5 font-mono text-gray-700">
                #{pendingCheck.bankRef}
              </div>
            </div>
            <div className="mt-4">
              <label
                htmlFor="cleared-date"
                className="mb-1 block text-xs font-medium text-gray-500"
              >
                Cleared date{isEditingClearedDate ? '' : ' (optional)'}
              </label>
              <input
                id="cleared-date"
                type="date"
                value={clearedDate}
                onChange={(e) => setClearedDate(e.target.value)}
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
              />
              {!isEditingClearedDate && (
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank to use today.
                </p>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeCheckModal}
                disabled={clearingId === pendingCheck.id}
                className="min-h-[44px] rounded bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:opacity-50 sm:min-h-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={
                  isEditingClearedDate
                    ? handleConfirmDateEdit
                    : handleConfirmClear
                }
                disabled={clearingId === pendingCheck.id}
                className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:min-h-0"
              >
                {clearingId === pendingCheck.id
                  ? isEditingClearedDate
                    ? 'Saving...'
                    : 'Clearing...'
                  : isEditingClearedDate
                    ? 'Save date'
                    : 'Mark as cleared'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
