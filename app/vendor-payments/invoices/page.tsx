'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'
import { VendorAddInvoiceModal } from '../components/VendorAddInvoiceModal'
import { VendorMakePaymentModal } from '../components/VendorMakePaymentModal'
import { DEFAULT_VAT_RATE } from '@/lib/vendorVat'

interface VendorRef {
  id: string
  name: string
  isVatRegistered: boolean
}

interface PaidBatch {
  paymentDate: string
  bankRef: string
  paymentMethod: string
}

interface PaidVendorInvoiceRef {
  batch: PaidBatch
}

interface VendorInvoiceRow {
  id: string
  vendorId: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  status: string
  vat: number | null
  notes: string
  vendor: VendorRef
  paidInvoice?: PaidVendorInvoiceRef | null
}

type TabType = 'pending' | 'paid'
type MonthFilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

function vendorInvoiceTotal(amount: number, vat: number | null | undefined) {
  return amount + (vat ?? 0)
}

function monthParamForFilter(filter: MonthFilterType, customMonth: string): string | null {
  if (filter === 'all') return null
  if (filter === 'custom') return customMonth || null

  const todayYmd = businessTodayYmd()
  const [year, month] = todayYmd.split('-').map(Number)

  if (filter === 'thisMonth') {
    return `${year}-${String(month).padStart(2, '0')}`
  }
  if (filter === 'lastMonth') {
    const last = new Date(Date.UTC(year, month - 2, 1))
    return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return null
}

function monthFilterLabel(filter: MonthFilterType, customMonth: string): string | null {
  const param = monthParamForFilter(filter, customMonth)
  if (!param) return null
  return new Date(`${param}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

function VendorInvoicesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<VendorInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState<string>('')
  const [monthFilter, setMonthFilter] = useState<MonthFilterType>('all')
  const [customMonth, setCustomMonth] = useState('')

  const [vendors, setVendors] = useState<VendorRef[]>([])
  const [globalVatRate, setGlobalVatRate] = useState(DEFAULT_VAT_RATE)
  const [pendingCount, setPendingCount] = useState(0)
  const [paidCount, setPaidCount] = useState(0)
  const [copyNotification, setCopyNotification] = useState<string | null>(null)

  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balance, setBalance] = useState<{
    currentBalance: number
    availableFunds: number
    balanceAfter: number
    planned: number
  } | null>(null)
  const [balanceFormData, setBalanceFormData] = useState({
    currentBalance: '',
    availableFunds: ''
  })
  const [savingBalance, setSavingBalance] = useState(false)

  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false)

  const [showPayModal, setShowPayModal] = useState(false)
  const [payModalVendorId, setPayModalVendorId] = useState('')
  const [payModalSelectedCsv, setPayModalSelectedCsv] = useState('')

  const openMakePaymentModal = (vendorId: string, selectedCsv: string) => {
    setPayModalVendorId(vendorId)
    setPayModalSelectedCsv(selectedCsv)
    setShowPayModal(true)
  }

  const closeMakePaymentModal = () => {
    setShowPayModal(false)
  }

  useEffect(() => {
    const pay = searchParams.get('pay')
    if (pay !== '1') return
    const v = searchParams.get('vendorId') || ''
    const s = searchParams.get('selected') || ''
    setPayModalVendorId(v)
    setPayModalSelectedCsv(s)
    setShowPayModal(true)
    router.replace('/vendor-payments/invoices', { scroll: false })
  }, [searchParams, router])

  useEffect(() => {
    const loadBootstrap = async () => {
      try {
        const res = await fetch('/api/vendor-payments/page-bootstrap')
        if (res.ok) {
          const data = await res.json()
          setVendors(Array.isArray(data.vendors) ? data.vendors : [])
          if (typeof data.pendingCount === 'number') setPendingCount(data.pendingCount)
          if (typeof data.paidCount === 'number') setPaidCount(data.paidCount)
          if (typeof data.vatRate === 'number') setGlobalVatRate(data.vatRate)
        }
      } catch (e) {
        console.error('Error fetching vendor payments bootstrap', e)
      }
    }
    void loadBootstrap()
    void fetchBalance()
  }, [])

  useEffect(() => {
    void fetchInvoices()
  }, [activeTab, vendorFilter, monthFilter, customMonth])

  useEffect(() => {
    if (!copyNotification) return
    const t = setTimeout(() => setCopyNotification(null), 2000)
    return () => clearTimeout(t)
  }, [copyNotification])

  useEffect(() => {
    setSelectedInvoiceIds(new Set())
  }, [activeTab, vendorFilter, monthFilter, customMonth])

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/fuel-payments/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setBalanceFormData({
          currentBalance: data.currentBalance.toString(),
          availableFunds: data.availableFunds.toString()
        })
      }
    } catch (e) {
      console.error('Error fetching balance', e)
    }
  }

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const status = activeTab === 'paid' ? 'paid' : 'pending'
      const q = new URLSearchParams({ status })
      if (vendorFilter) q.set('vendorId', vendorFilter)
      const monthParam = monthParamForFilter(monthFilter, customMonth)
      if (monthParam) q.set('month', monthParam)
      const res = await fetch(`/api/vendor-payments/invoices?${q}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data)
      } else {
        console.error('Failed to fetch vendor invoices')
      }
    } catch (e) {
      console.error('Error fetching vendor invoices', e)
    } finally {
      setLoading(false)
    }
  }

  const refreshCounts = async () => {
    try {
      const res = await fetch('/api/vendor-payments/invoices/counts')
      if (res.ok) {
        const data = await res.json()
        if (typeof data.pendingCount === 'number') setPendingCount(data.pendingCount)
        if (typeof data.paidCount === 'number') setPaidCount(data.paidCount)
      }
    } catch (e) {
      console.error('Error refreshing counts', e)
    }
  }

  const handleSaveBalance = async () => {
    setSavingBalance(true)
    try {
      const res = await fetch('/api/fuel-payments/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBalance: parseFloat(balanceFormData.currentBalance) || 0,
          availableFunds: parseFloat(balanceFormData.availableFunds) || 0
        })
      })
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
        setShowBalanceModal(false)
        alert('Balance updated successfully!')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to update balance')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update balance')
    } finally {
      setSavingBalance(false)
    }
  }

  const handleToggleInvoice = (invoiceId: string) => {
    const next = new Set(selectedInvoiceIds)
    if (next.has(invoiceId)) next.delete(invoiceId)
    else next.add(invoiceId)
    setSelectedInvoiceIds(next)
  }

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === invoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(invoices.map((inv) => inv.id)))
    }
  }

  const selectedRows = invoices.filter((inv) => selectedInvoiceIds.has(inv.id))
  const selectedTotal = selectedRows.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )
  const selectedVendorIds = new Set(selectedRows.map((r) => r.vendorId))

  const handleMakePaymentSelected = () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    if (selectedVendorIds.size > 1) {
      alert(
        'Vendor payments are one vendor per batch. Filter or clear selection so all selected invoices are for the same vendor.'
      )
      return
    }
    const vendorId = selectedRows[0]?.vendorId
    if (!vendorId) return
    openMakePaymentModal(vendorId, Array.from(selectedInvoiceIds).join(','))
  }

  const filteredInvoices =
    activeTab === 'paid' && searchQuery.trim()
      ? invoices.filter((inv) => {
          const q = searchQuery.trim().toLowerCase()
          const num = inv.invoiceNumber.toLowerCase()
          const vendorName = inv.vendor?.name?.toLowerCase() ?? ''
          const bankRef = inv.paidInvoice?.batch.bankRef?.toLowerCase() ?? ''
          return num.includes(q) || vendorName.includes(q) || bankRef.includes(q)
        })
      : invoices

  const handleDelete = async (id: string, invoiceNumber: string) => {
    const confirmed = window.confirm(
      `Delete invoice "${invoiceNumber}"?\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    try {
      const res = await fetch(`/api/vendor-payments/invoices/${id}`, { method: 'DELETE' })
      if (res.ok) {
        void fetchInvoices()
        void refreshCounts()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to delete invoice')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to delete invoice')
    }
  }

  if (loading && !showPayModal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading invoices...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Vendor invoices</h1>
            <p className="mt-1 text-sm text-gray-600">
              All vendors in one list — filter by vendor, then pay in batch
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/monthly-report')}
              className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
              title="All Invoices Report"
            >
              📄 Reports
            </button>
            <button
              type="button"
              onClick={() => setShowBalanceModal(true)}
              className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
              title="Shared balance with Fuel Payments"
            >
              Balance
            </button>
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="min-h-[44px] rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:min-h-0"
            >
              Vendors
            </button>
            <button
              type="button"
              onClick={() => openMakePaymentModal(vendorFilter, '')}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Make payment
            </button>
            {activeTab === 'pending' && (
              <button
                type="button"
                onClick={() => setShowAddInvoiceModal(true)}
                className="col-span-2 min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:col-span-1 sm:min-h-0"
              >
                + Add invoice
              </button>
            )}
          </div>
        </div>

        {balance && (
          <div className="mb-4 inline-flex max-w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
            <span className="font-semibold">Available:</span>
            <span>{formatAmount(balance.availableFunds)}</span>
            <span className="text-gray-400">|</span>
            <span className="font-semibold">Planned:</span>
            <span>{formatAmount(balance.planned)}</span>
            <span className="text-gray-400">|</span>
            <span className="font-semibold">After:</span>
            <span
              className={
                balance.balanceAfter >= 0
                  ? 'font-semibold text-green-600'
                  : 'font-semibold text-red-600'
              }
            >
              {formatAmount(balance.balanceAfter)}
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-xs text-gray-500">(shared with Fuel Payments)</span>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3">
          <div className="w-full md:w-72">
            <label className="mb-1 block text-xs font-medium text-gray-500">Vendor</label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Invoice month
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => {
                  setMonthFilter('all')
                  setCustomMonth('')
                }}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  monthFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthFilter('thisMonth')
                  setCustomMonth('')
                }}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  monthFilter === 'thisMonth'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthFilter('lastMonth')
                  setCustomMonth('')
                }}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  monthFilter === 'lastMonth'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => setMonthFilter('custom')}
                className={`min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  monthFilter === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
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
        </div>

        <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-3 md:flex-row md:items-end md:justify-between">
          <div className="flex gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('pending')
                setSearchQuery('')
              }}
              className={`min-h-[44px] border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                activeTab === 'pending'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('paid')}
              className={`min-h-[44px] border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                activeTab === 'paid'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Paid ({paidCount})
            </button>
          </div>

          {activeTab === 'paid' && (
            <div className="w-full md:w-64">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Search paid
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Invoice #, vendor, or ref"
                className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:py-1.5"
              />
            </div>
          )}
        </div>

        {activeTab === 'pending' && selectedInvoiceIds.size > 0 && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedInvoiceIds.size} invoice
                  {selectedInvoiceIds.size !== 1 ? 's' : ''} selected
                  {selectedVendorIds.size > 1 && (
                    <span className="mt-1 block text-xs text-red-700">
                      Different vendors selected — pay one vendor at a time.
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  Total: {formatAmount(selectedTotal)}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={handleMakePaymentSelected}
                  className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
                >
                  Mark selected as paid
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceIds(new Set())}
                  className="min-h-[44px] rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 sm:min-h-0"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <p className="mb-4 text-gray-600">
              No {activeTab === 'paid' ? 'paid' : 'pending'} invoices
              {vendorFilter ? ' for this vendor' : ''}
              {monthFilterLabel(monthFilter, customMonth)
                ? ` in ${monthFilterLabel(monthFilter, customMonth)}`
                : ''}
              .
            </p>
            {activeTab === 'pending' && (
              <button
                type="button"
                onClick={() => setShowAddInvoiceModal(true)}
                className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
              >
                Add invoice
              </button>
            )}
          </div>
        ) : activeTab === 'paid' && searchQuery.trim() && filteredInvoices.length === 0 ? (
          <div className="rounded-lg bg-white p-6 text-sm text-gray-600 shadow">
            No paid invoices match &quot;{searchQuery}&quot;.
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {activeTab === 'pending' && filteredInvoices.length > 0 && (
                <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      selectedInvoiceIds.size === invoices.length &&
                      invoices.length > 0
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                  Select all
                </label>
              )}
              {filteredInvoices.map((invoice) => {
                const dueStatus =
                  invoice.dueDate != null ? getDueDateStatus(invoice.dueDate) : null
                const total = vendorInvoiceTotal(invoice.amount, invoice.vat)
                return (
                  <div
                    key={invoice.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.has(invoice.id)}
                          onChange={() => handleToggleInvoice(invoice.id)}
                          className="mt-1 rounded border-gray-300"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">
                              {invoice.vendor?.name ?? '—'}
                            </div>
                            <div className="mt-0.5 font-mono text-sm text-gray-700">
                              {invoice.invoiceNumber}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono font-semibold text-gray-900">
                            {formatAmount(total)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                          {activeTab === 'pending' && invoice.vat != null
                            ? ` · Amt ${formatAmount(invoice.amount)} · VAT ${formatAmount(invoice.vat)}`
                            : ''}
                        </div>
                        {activeTab === 'pending' && invoice.dueDate != null && dueStatus && (
                          <div className="mt-2">
                            <span
                              className={`rounded border px-2 py-1 text-xs font-semibold ${dueStatus.className}`}
                            >
                              Due {formatInvoiceDate(invoice.dueDate)}
                              {dueStatus.status === 'overdue' &&
                                ` (${dueStatus.daysUntil}d overdue)`}
                              {dueStatus.status === 'due' && ' (today)'}
                              {dueStatus.status === 'warning' && ' (tomorrow)'}
                            </span>
                          </div>
                        )}
                        {activeTab === 'paid' && invoice.paidInvoice && (
                          <div className="mt-2 text-xs text-gray-600">
                            Paid {formatInvoiceDate(invoice.paidInvoice.batch.paymentDate)}
                            <div className="font-mono text-gray-500">
                              {invoice.paidInvoice.batch.paymentMethod === 'check'
                                ? 'Check'
                                : 'EFT'}{' '}
                              · Ref {invoice.paidInvoice.batch.bankRef}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3">
                      {activeTab === 'pending' && invoice.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/vendor-payments/invoices/${invoice.id}/edit`)
                            }
                            className="min-h-[44px] text-sm font-medium text-indigo-600 hover:text-indigo-900"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDelete(invoice.id, invoice.invoiceNumber)
                            }
                            className="min-h-[44px] text-sm font-medium text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {activeTab === 'paid' && invoice.paidInvoice && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              invoice.paidInvoice!.batch.bankRef
                            )
                            setCopyNotification('Reference copied')
                          }}
                          className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-900"
                        >
                          Copy ref
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-hidden rounded-lg bg-white shadow md:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {activeTab === 'pending' && (
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            selectedInvoiceIds.size === invoices.length &&
                            invoices.length > 0
                          }
                          onChange={handleSelectAll}
                          className="rounded border-gray-300"
                          aria-label="Select all"
                        />
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Vendor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Date
                    </th>
                    {activeTab === 'pending' && (
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Due
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Amount
                    </th>
                    {activeTab === 'pending' && (
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        VAT
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Total
                    </th>
                    {activeTab === 'paid' && (
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Payment
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredInvoices.map((invoice) => {
                    const dueStatus =
                      invoice.dueDate != null
                        ? getDueDateStatus(invoice.dueDate)
                        : null
                    return (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        {activeTab === 'pending' && (
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedInvoiceIds.has(invoice.id)}
                              onChange={() => handleToggleInvoice(invoice.id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                          {invoice.vendor?.name ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                        </td>
                        {activeTab === 'pending' && (
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {invoice.dueDate != null && dueStatus ? (
                              <span
                                className={`rounded border px-2 py-1 text-xs font-semibold ${dueStatus.className}`}
                              >
                                {formatInvoiceDate(invoice.dueDate)}
                                {dueStatus.status === 'overdue' &&
                                  ` (${dueStatus.daysUntil}d overdue)`}
                                {dueStatus.status === 'due' && ' (Due today)'}
                                {dueStatus.status === 'warning' && ' (Due tomorrow)'}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatAmount(invoice.amount)}
                        </td>
                        {activeTab === 'pending' && (
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            {invoice.vat != null ? formatAmount(invoice.vat) : '—'}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                          {formatAmount(vendorInvoiceTotal(invoice.amount, invoice.vat))}
                        </td>
                        {activeTab === 'paid' && invoice.paidInvoice && (
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                            <div>
                              {formatInvoiceDate(invoice.paidInvoice.batch.paymentDate)}
                            </div>
                            <div className="font-mono text-xs text-gray-500">
                              {invoice.paidInvoice.batch.paymentMethod === 'check'
                                ? 'Check'
                                : 'EFT'}{' '}
                              · Ref {invoice.paidInvoice.batch.bankRef}
                            </div>
                          </td>
                        )}
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            {activeTab === 'pending' && invoice.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/vendor-payments/invoices/${invoice.id}/edit`
                                    )
                                  }
                                  className="rounded p-1 text-indigo-600 transition-colors hover:text-indigo-900"
                                  title="Edit"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDelete(invoice.id, invoice.invoiceNumber)
                                  }
                                  className="rounded p-1 text-red-600 transition-colors hover:text-red-900"
                                  title="Delete"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </>
                            )}
                            {activeTab === 'paid' && invoice.paidInvoice && (
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(
                                    invoice.paidInvoice!.batch.bankRef
                                  )
                                  setCopyNotification('Reference copied')
                                }}
                                className="rounded p-1 text-blue-600 transition-colors hover:text-blue-900"
                                title="Copy reference"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <VendorAddInvoiceModal
          open={showAddInvoiceModal}
          onClose={() => setShowAddInvoiceModal(false)}
          vendors={vendors}
          vatRate={globalVatRate}
          initialVendorId={vendorFilter}
          onSuccess={() => {
            void fetchInvoices()
            void refreshCounts()
          }}
          onEditInvoice={(invoice) => {
            setShowAddInvoiceModal(false)
            router.push(`/vendor-payments/invoices/${invoice.id}/edit`)
          }}
        />

        <VendorMakePaymentModal
          open={showPayModal}
          onClose={closeMakePaymentModal}
          initialVendorId={payModalVendorId}
          initialSelectedCsv={payModalSelectedCsv}
          onSuccess={(batchId) => {
            void fetchInvoices()
            void refreshCounts()
            router.push(`/vendor-payments/make-payment/share/${batchId}`)
          }}
        />

        {showBalanceModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
            <div className="my-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Balance (shared)</h2>
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="min-h-[44px] min-w-[44px] text-2xl text-gray-500 hover:text-gray-700 sm:min-h-0 sm:min-w-0"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Current balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceFormData.currentBalance}
                    onChange={(e) =>
                      setBalanceFormData({
                        ...balanceFormData,
                        currentBalance: e.target.value
                      })
                    }
                    className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Available funds
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceFormData.availableFunds}
                    onChange={(e) =>
                      setBalanceFormData({
                        ...balanceFormData,
                        availableFunds: e.target.value
                      })
                    }
                    className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                  />
                </div>
                {balance && (
                  <div className="space-y-1 rounded bg-gray-50 p-3 text-sm">
                    <div>
                      <span className="text-gray-600">Planned: </span>
                      <span className="font-semibold text-blue-600">
                        {formatAmount(balance.planned)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Balance after: </span>
                      <span
                        className={`font-semibold ${
                          balance.balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatAmount(balance.balanceAfter)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-4">
                <button
                  type="button"
                  onClick={() => void handleSaveBalance()}
                  disabled={savingBalance}
                  className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
                >
                  {savingBalance ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 sm:min-h-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {copyNotification && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
              {copyNotification}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VendorInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <VendorInvoicesPageInner />
    </Suspense>
  )
}
