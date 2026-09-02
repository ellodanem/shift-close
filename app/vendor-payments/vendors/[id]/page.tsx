'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
import { VendorAddInvoiceModal } from '../../components/VendorAddInvoiceModal'
import { VendorRevertPaymentModal } from '../../components/VendorRevertPaymentModal'
import {
  VendorInvoiceAmountFields,
  VendorInvoiceVatCalculatorHeader
} from '../../components/VendorInvoiceAmountFields'
import { DEFAULT_VAT_RATE } from '@/lib/vendorVat'

interface VendorInvoicePaidBatch {
  paymentDate: string
  paymentMethod: string
  bankRef: string
}

interface VendorInvoicePaidLink {
  batch: VendorInvoicePaidBatch
}

interface VendorInvoice {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  status: string
  notes: string
  paidInvoice?: VendorInvoicePaidLink | null
}

type InvoiceTab = 'pending' | 'paid'

interface VendorBatch {
  id: string
  paymentDate: string
  paymentMethod: string
  bankRef: string
  totalAmount: number
  clearedAt: string | null
}

interface Vendor {
  id: string
  name: string
  notificationEmail: string
  isVatRegistered: boolean
  cstoreName?: string | null
  notes: string
  invoices: VendorInvoice[]
  batches: VendorBatch[]
}

type BatchFilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'
type MonthFilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

function vendorInvoiceTotal(amount: number, vat: number | null) {
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

function invoiceMatchesMonth(
  invoiceDate: string,
  filter: MonthFilterType,
  customMonth: string
): boolean {
  const monthParam = monthParamForFilter(filter, customMonth)
  if (!monthParam) return true
  return invoiceDate.slice(0, 7) === monthParam
}

function VendorDetailPageInner() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const activeInvoiceTab: InvoiceTab =
    searchParams.get('tab') === 'paid' ? 'paid' : 'pending'
  const setActiveInvoiceTab = (tab: InvoiceTab) => {
    const next = new URLSearchParams(searchParams.toString())
    if (tab === 'pending') next.delete('tab')
    else next.set('tab', tab)
    const qs = next.toString()
    router.replace(`/vendor-payments/vendors/${id}${qs ? `?${qs}` : ''}`, {
      scroll: false
    })
  }
  const [paidSearchQuery, setPaidSearchQuery] = useState('')
  const [monthFilter, setMonthFilter] = useState<MonthFilterType>('all')
  const [customMonth, setCustomMonth] = useState('')

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE)
  const [loading, setLoading] = useState(true)
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false)
  const [batchSearch, setBatchSearch] = useState('')
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false)
  const [editInvoiceSaving, setEditInvoiceSaving] = useState(false)
  const [editInvoiceError, setEditInvoiceError] = useState<string | null>(null)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editInvoiceForm, setEditInvoiceForm] = useState({
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })
  const [activeBatchFilter, setActiveBatchFilter] = useState<BatchFilterType>('all')
  const [customBatchStartDate, setCustomBatchStartDate] = useState('')
  const [customBatchEndDate, setCustomBatchEndDate] = useState('')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    fetchVendor()
  }, [id])

  useEffect(() => {
    setSelectedInvoiceIds(new Set())
  }, [activeInvoiceTab, monthFilter, customMonth])

  const fetchVendor = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendor-payments/vendors/${id}`)
      if (!res.ok) throw new Error('Failed to fetch vendor')
      const data = await res.json()
      setVendor(data)
      if (typeof data.vatRate === 'number') setVatRate(data.vatRate)
    } catch (error) {
      console.error('Error fetching vendor:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d: string) => formatInvoiceDate(d)
  const formatAmount = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const pendingInvoices = useMemo(
    () => vendor?.invoices?.filter((i) => i.status === 'pending') ?? [],
    [vendor?.invoices]
  )
  const paidInvoices = useMemo(
    () => vendor?.invoices?.filter((i) => i.status === 'paid') ?? [],
    [vendor?.invoices]
  )
  const filteredPendingInvoices = useMemo(
    () =>
      pendingInvoices.filter((inv) =>
        invoiceMatchesMonth(inv.invoiceDate, monthFilter, customMonth)
      ),
    [pendingInvoices, monthFilter, customMonth]
  )
  const monthFilteredPaidInvoices = useMemo(
    () =>
      paidInvoices.filter((inv) =>
        invoiceMatchesMonth(inv.invoiceDate, monthFilter, customMonth)
      ),
    [paidInvoices, monthFilter, customMonth]
  )
  const pendingTotal = filteredPendingInvoices.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )
  const paidQuery = paidSearchQuery.trim().toLowerCase()
  const filteredPaidInvoices = useMemo(() => {
    if (!paidQuery) return monthFilteredPaidInvoices
    return monthFilteredPaidInvoices.filter((inv) => {
      const num = inv.invoiceNumber.toLowerCase()
      const ref = inv.paidInvoice?.batch.bankRef?.toLowerCase() ?? ''
      const method = inv.paidInvoice?.batch.paymentMethod?.toLowerCase() ?? ''
      return num.includes(paidQuery) || ref.includes(paidQuery) || method.includes(paidQuery)
    })
  }, [monthFilteredPaidInvoices, paidQuery])
  const filteredPaidTotal = filteredPaidInvoices.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )
  const activeMonthLabel = monthFilterLabel(monthFilter, customMonth)
  const allBatches = vendor?.batches ?? []
  const matchesBatchDateFilter = (paymentDate: string) => {
    const dt = new Date(paymentDate)
    if (Number.isNaN(dt.getTime())) return false
    if (activeBatchFilter === 'all') return true

    const now = new Date()
    const currYear = now.getFullYear()
    const currMonth = now.getMonth()
    const year = dt.getFullYear()
    const month = dt.getMonth()

    if (activeBatchFilter === 'thisMonth') {
      return year === currYear && month === currMonth
    }
    if (activeBatchFilter === 'lastMonth') {
      const last = new Date(currYear, currMonth - 1, 1)
      return year === last.getFullYear() && month === last.getMonth()
    }
    if (activeBatchFilter === 'custom') {
      if (!customBatchStartDate || !customBatchEndDate) return true
      return paymentDate >= customBatchStartDate && paymentDate <= customBatchEndDate
    }
    return true
  }

  const filteredBatches = allBatches.filter((batch) => {
    if (!matchesBatchDateFilter(batch.paymentDate)) return false
    const q = batchSearch.trim().toLowerCase()
    if (!q) return true

    const refMatch = (batch.bankRef || '').toLowerCase().includes(q)
    const methodMatch = (batch.paymentMethod || '').toLowerCase().includes(q)
    const amountMatch = formatAmount(batch.totalAmount).toLowerCase().includes(q)
    const status = batch.paymentMethod === 'check' && !batch.clearedAt ? 'uncashed' : 'cleared'
    const statusMatch = status.includes(q)

    return refMatch || methodMatch || amountMatch || statusMatch
  })
  const batchesTotal = filteredBatches.reduce((sum, batch) => sum + batch.totalAmount, 0)

  const openEditInvoiceModal = (invoice: VendorInvoice) => {
    setEditingInvoiceId(invoice.id)
    setEditInvoiceError(null)
    setEditInvoiceForm({
      invoiceNumber: invoice.invoiceNumber,
      amount: String(invoice.amount),
      invoiceDate: invoice.invoiceDate.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      vat: invoice.vat != null ? String(invoice.vat) : '',
      notes: invoice.notes || ''
    })
    setShowEditInvoiceModal(true)
  }

  const closeEditInvoiceModal = () => {
    setShowEditInvoiceModal(false)
    setEditInvoiceSaving(false)
    setEditInvoiceError(null)
    setEditingInvoiceId(null)
  }

  const handleToggleInvoice = (invoiceId: string) => {
    const next = new Set(selectedInvoiceIds)
    if (next.has(invoiceId)) next.delete(invoiceId)
    else next.add(invoiceId)
    setSelectedInvoiceIds(next)
  }

  const handleSelectAllPending = () => {
    const visibleIds = filteredPendingInvoices.map((inv) => inv.id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedInvoiceIds.has(id))
    const next = new Set(selectedInvoiceIds)
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
    else visibleIds.forEach((id) => next.add(id))
    setSelectedInvoiceIds(next)
  }

  const selectedPendingInvoices = filteredPendingInvoices.filter((inv) =>
    selectedInvoiceIds.has(inv.id)
  )
  const allVisiblePendingSelected =
    filteredPendingInvoices.length > 0 &&
    filteredPendingInvoices.every((inv) => selectedInvoiceIds.has(inv.id))

  const handleDeleteInvoice = async (invoiceId: string) => {
    const res = await fetch(`/api/vendor-payments/invoices/${invoiceId}`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to delete invoice')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedPendingInvoices.length === 0) return
    const count = selectedPendingInvoices.length
    const message =
      count === 1
        ? `Delete invoice "${selectedPendingInvoices[0].invoiceNumber}"?\n\nThis cannot be undone.`
        : `Delete ${count} selected invoice${count !== 1 ? 's' : ''}?\n\nThis cannot be undone.`
    if (!confirm(message)) return

    setBulkDeleting(true)
    let failed = 0
    for (const inv of selectedPendingInvoices) {
      try {
        await handleDeleteInvoice(inv.id)
      } catch {
        failed++
      }
    }
    setSelectedInvoiceIds(new Set())
    await fetchVendor()
    setBulkDeleting(false)
    if (failed > 0) {
      alert(
        `Deleted ${count - failed} invoice${count - failed !== 1 ? 's' : ''}. ${failed} failed.`
      )
    }
  }

  const handleEditInvoiceSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingInvoiceId) return
    setEditInvoiceSaving(true)
    setEditInvoiceError(null)
    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: editInvoiceForm.invoiceNumber,
        amount: parseFloat(editInvoiceForm.amount),
        invoiceDate: editInvoiceForm.invoiceDate,
        dueDate: editInvoiceForm.dueDate || null,
        notes: editInvoiceForm.notes
      }
      if (editInvoiceForm.vat !== '') payload.vat = parseFloat(editInvoiceForm.vat)

      const res = await fetch(`/api/vendor-payments/invoices/${editingInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to update invoice')
      }

      closeEditInvoiceModal()
      await fetchVendor()
    } catch (err) {
      setEditInvoiceError(err instanceof Error ? err.message : 'Failed to update invoice')
    } finally {
      setEditInvoiceSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-red-600">Vendor not found.</p>
        <button
          type="button"
          onClick={() => router.push('/vendor-payments/vendors')}
          className="mt-4 min-h-[44px] text-blue-600 sm:min-h-0"
        >
          Back to Vendors
        </button>
      </div>
    )
  }

  const monthChipClass = (active: boolean) =>
    `min-h-[44px] rounded px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs ${
      active
        ? 'bg-blue-600 text-white'
        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{vendor.name}</h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <button
              type="button"
              onClick={() => router.push(`/vendor-payments/vendors/${id}/edit`)}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              Back
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Details</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-gray-500">Notification Email</dt>
              <dd className="break-all text-sm font-medium text-gray-900">
                {vendor.notificationEmail}
              </dd>
            </div>
            {vendor.cstoreName && (
              <div>
                <dt className="text-sm text-gray-500">Cstore name</dt>
                <dd className="text-sm font-medium text-gray-900">{vendor.cstoreName}</dd>
              </div>
            )}
            {vendor.notes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-gray-500">Notes</dt>
                <dd className="text-sm text-gray-700">{vendor.notes}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-gray-500">VAT</dt>
              <dd className="text-sm font-medium text-gray-900">
                {vendor.isVatRegistered
                  ? `Registered (${(vatRate * 100).toFixed(2).replace(/\.?0+$/, '')}% global rate)`
                  : 'Not registered'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:gap-2">
              {activeInvoiceTab === 'pending' && pendingInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => router.push(`/vendor-payments/make-payment?vendorId=${id}`)}
                  className="min-h-[44px] rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0 sm:py-1.5"
                >
                  Make Payment
                </button>
              )}
              {activeInvoiceTab === 'paid' && paidInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRevertModal(true)}
                  className="min-h-[44px] rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 sm:min-h-0 sm:py-1.5"
                >
                  Revert Payment
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAddInvoiceModal(true)}
                className="min-h-[44px] rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0 sm:py-1.5"
              >
                Add Invoice
              </button>
            </div>
          </div>

          <div className="mb-4">
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
                className={monthChipClass(monthFilter === 'all')}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthFilter('thisMonth')
                  setCustomMonth('')
                }}
                className={monthChipClass(monthFilter === 'thisMonth')}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  setMonthFilter('lastMonth')
                  setCustomMonth('')
                }}
                className={monthChipClass(monthFilter === 'lastMonth')}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => setMonthFilter('custom')}
                className={monthChipClass(monthFilter === 'custom')}
              >
                Custom
              </button>
              {monthFilter === 'custom' && (
                <input
                  type="month"
                  value={customMonth}
                  onChange={(e) => setCustomMonth(e.target.value)}
                  className="col-span-2 min-h-[44px] w-full rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-auto sm:py-1.5 sm:text-xs"
                />
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-3 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-1 overflow-x-auto sm:gap-2">
              <button
                type="button"
                onClick={() => setActiveInvoiceTab('pending')}
                className={`min-h-[44px] shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  activeInvoiceTab === 'pending'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending ({pendingInvoices.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveInvoiceTab('paid')}
                className={`min-h-[44px] shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors sm:min-h-0 sm:px-4 ${
                  activeInvoiceTab === 'paid'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Paid ({paidInvoices.length})
              </button>
            </div>
            {activeInvoiceTab === 'paid' && paidInvoices.length > 0 && (
              <div className="w-full md:w-64">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Search paid
                </label>
                <input
                  type="text"
                  value={paidSearchQuery}
                  onChange={(e) => setPaidSearchQuery(e.target.value)}
                  placeholder="Invoice #, method, or ref"
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:py-1.5"
                />
              </div>
            )}
          </div>

          {activeInvoiceTab === 'pending' && selectedPendingInvoices.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-red-900">
                  {selectedPendingInvoices.length} invoice
                  {selectedPendingInvoices.length !== 1 ? 's' : ''} selected
                </p>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBulkDelete()}
                    disabled={bulkDeleting}
                    className="min-h-[44px] rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:min-h-0"
                  >
                    {bulkDeleting ? 'Deleting…' : 'Delete selected'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceIds(new Set())}
                    disabled={bulkDeleting}
                    className="min-h-[44px] rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-50 sm:min-h-0"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeInvoiceTab === 'pending' ? (
            pendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">No pending invoices.</p>
            ) : filteredPendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">
                No pending invoices
                {activeMonthLabel ? ` in ${activeMonthLabel}` : ''}.
              </p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allVisiblePendingSelected}
                      onChange={handleSelectAllPending}
                      className="rounded border-gray-300"
                    />
                    Select all
                  </label>
                  {filteredPendingInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.has(inv.id)}
                          onChange={() => handleToggleInvoice(inv.id)}
                          className="mt-1 rounded border-gray-300"
                          aria-label={`Select invoice ${inv.invoiceNumber}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 font-mono font-medium text-gray-900">
                              {inv.invoiceNumber}
                            </div>
                            <span className="shrink-0 font-mono font-semibold text-gray-900">
                              {formatAmount(vendorInvoiceTotal(inv.amount, inv.vat))}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            {formatDate(inv.invoiceDate)}
                            {inv.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-4 border-t border-gray-100 pt-3">
                        <button
                          type="button"
                          onClick={() => openEditInvoiceModal(inv)}
                          className="min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (
                              !confirm(
                                `Delete invoice "${inv.invoiceNumber}"?\n\nThis cannot be undone.`
                              )
                            ) {
                              return
                            }
                            try {
                              await handleDeleteInvoice(inv.id)
                              setSelectedInvoiceIds((prev) => {
                                const next = new Set(prev)
                                next.delete(inv.id)
                                return next
                              })
                              await fetchVendor()
                            } catch (err) {
                              alert(
                                err instanceof Error ? err.message : 'Failed to delete invoice'
                              )
                            }
                          }}
                          className="min-h-[44px] text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">
                        Total ({filteredPendingInvoices.length}
                        {activeMonthLabel &&
                        filteredPendingInvoices.length !== pendingInvoices.length
                          ? ` of ${pendingInvoices.length}`
                          : ''}
                        )
                      </span>
                      <span className="font-semibold text-blue-700">
                        {formatAmount(pendingTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="w-8 pb-1 pr-2">
                          <input
                            type="checkbox"
                            checked={allVisiblePendingSelected}
                            onChange={handleSelectAllPending}
                            className="rounded border-gray-300"
                            aria-label="Select all visible pending invoices"
                          />
                        </th>
                        <th className="pb-1">Invoice #</th>
                        <th className="pb-1">Date</th>
                        <th className="pb-1">Due</th>
                        <th className="pb-1 text-right">Amount</th>
                        <th className="pb-1 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-gray-100">
                          <td className="py-2 pr-2">
                            <input
                              type="checkbox"
                              checked={selectedInvoiceIds.has(inv.id)}
                              onChange={() => handleToggleInvoice(inv.id)}
                              className="rounded border-gray-300"
                              aria-label={`Select invoice ${inv.invoiceNumber}`}
                            />
                          </td>
                          <td className="py-2">{inv.invoiceNumber}</td>
                          <td>{formatDate(inv.invoiceDate)}</td>
                          <td>{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                          <td className="text-right font-medium">
                            {formatAmount(vendorInvoiceTotal(inv.amount, inv.vat))}
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => openEditInvoiceModal(inv)}
                              className="mr-3 text-sm text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Delete invoice "${inv.invoiceNumber}"?\n\nThis cannot be undone.`
                                  )
                                ) {
                                  return
                                }
                                try {
                                  await handleDeleteInvoice(inv.id)
                                  setSelectedInvoiceIds((prev) => {
                                    const next = new Set(prev)
                                    next.delete(inv.id)
                                    return next
                                  })
                                  await fetchVendor()
                                } catch (err) {
                                  alert(
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to delete invoice'
                                  )
                                }
                              }}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 bg-gray-50">
                        <td className="py-2 text-sm font-semibold text-gray-700" colSpan={4}>
                          Total ({filteredPendingInvoices.length} invoice
                          {filteredPendingInvoices.length !== 1 ? 's' : ''}
                          {activeMonthLabel &&
                          filteredPendingInvoices.length !== pendingInvoices.length
                            ? ` of ${pendingInvoices.length}`
                            : ''}
                          )
                        </td>
                        <td className="text-right text-sm font-semibold text-blue-700">
                          {formatAmount(pendingTotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )
          ) : paidInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">No paid invoices yet.</p>
          ) : filteredPaidInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">
              {paidQuery
                ? <>No paid invoices match &quot;{paidSearchQuery}&quot;.</>
                : `No paid invoices${activeMonthLabel ? ` in ${activeMonthLabel}` : ''}.`}
            </p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredPaidInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 font-mono font-medium text-gray-900">
                        {inv.invoiceNumber}
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-gray-900">
                        {formatAmount(vendorInvoiceTotal(inv.amount, inv.vat))}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      Invoice {formatDate(inv.invoiceDate)}
                    </div>
                    {inv.paidInvoice && (
                      <div className="mt-2 text-xs text-gray-600">
                        Paid {formatDate(inv.paidInvoice.batch.paymentDate)}
                        <div className="font-mono text-gray-500">
                          {inv.paidInvoice.batch.paymentMethod === 'check'
                            ? 'Check'
                            : 'EFT'}{' '}
                          · Ref {inv.paidInvoice.batch.bankRef}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-700">
                      Total ({filteredPaidInvoices.length}
                      {(paidQuery || activeMonthLabel) &&
                      filteredPaidInvoices.length !== paidInvoices.length
                        ? ` of ${paidInvoices.length}`
                        : ''}
                      )
                    </span>
                    <span className="font-semibold text-blue-700">
                      {formatAmount(filteredPaidTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-1">Invoice #</th>
                      <th className="pb-1">Date</th>
                      <th className="pb-1">Payment</th>
                      <th className="pb-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaidInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-gray-100">
                        <td className="py-2">{inv.invoiceNumber}</td>
                        <td>{formatDate(inv.invoiceDate)}</td>
                        <td className="text-sm text-gray-600">
                          {inv.paidInvoice ? (
                            <div className="flex flex-col">
                              <span>{formatDate(inv.paidInvoice.batch.paymentDate)}</span>
                              <span className="font-mono text-xs text-gray-500">
                                {inv.paidInvoice.batch.paymentMethod === 'check'
                                  ? 'Check'
                                  : 'EFT'}
                                {' · Ref '}
                                {inv.paidInvoice.batch.bankRef}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="text-right font-medium">
                          {formatAmount(vendorInvoiceTotal(inv.amount, inv.vat))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td className="py-2 text-sm font-semibold text-gray-700" colSpan={3}>
                        Total ({filteredPaidInvoices.length} invoice
                        {filteredPaidInvoices.length !== 1 ? 's' : ''}
                        {(paidQuery || activeMonthLabel) &&
                        filteredPaidInvoices.length !== paidInvoices.length
                          ? ` of ${paidInvoices.length}`
                          : ''}
                        )
                      </td>
                      <td className="text-right text-sm font-semibold text-blue-700">
                        {formatAmount(filteredPaidTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Payment Batches</h2>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setActiveBatchFilter('all')}
                className={monthChipClass(activeBatchFilter === 'all')}
              >
                All Batches
              </button>
              <button
                type="button"
                onClick={() => setActiveBatchFilter('thisMonth')}
                className={monthChipClass(activeBatchFilter === 'thisMonth')}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setActiveBatchFilter('lastMonth')}
                className={monthChipClass(activeBatchFilter === 'lastMonth')}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => setActiveBatchFilter('custom')}
                className={monthChipClass(activeBatchFilter === 'custom')}
              >
                Custom Range
              </button>
            </div>
            {activeBatchFilter === 'custom' && (
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <input
                  type="date"
                  value={customBatchStartDate}
                  onChange={(e) => setCustomBatchStartDate(e.target.value)}
                  className="min-h-[44px] rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:py-1.5 sm:text-xs"
                />
                <span className="hidden text-xs text-gray-500 sm:inline">to</span>
                <input
                  type="date"
                  value={customBatchEndDate}
                  onChange={(e) => setCustomBatchEndDate(e.target.value)}
                  className="min-h-[44px] rounded border border-gray-300 px-2 py-2 text-sm sm:min-h-0 sm:py-1.5 sm:text-xs"
                />
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="w-full sm:w-auto">
                <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                  Search (Ref, Method, Amount, Status)
                </label>
                <input
                  type="text"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:w-56 sm:py-1.5"
                  placeholder="e.g. 19397997 or check"
                />
              </div>
              <div className="text-xs text-gray-600">
                <div>
                  <span className="font-semibold">{filteredBatches.length}</span>{' '}
                  batch{filteredBatches.length !== 1 && 'es'}
                </div>
                <div>
                  Total:{' '}
                  <span className="font-semibold text-blue-700">{formatAmount(batchesTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          {allBatches.length === 0 ? (
            <p className="text-sm text-gray-500">No payment batches yet.</p>
          ) : filteredBatches.length === 0 ? (
            <p className="text-sm text-gray-500">No payment batches match your search.</p>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredBatches.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {formatDate(b.paymentDate)} ·{' '}
                          <span className="capitalize">{b.paymentMethod}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-xs text-gray-600">
                          {b.bankRef || '(No Ref)'}
                        </div>
                        <div className="mt-1 text-xs">
                          {b.paymentMethod === 'check' && !b.clearedAt ? (
                            <span className="text-amber-600">Uncashed</span>
                          ) : (
                            <span className="text-green-600">Cleared</span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-gray-900">
                        {formatAmount(b.totalAmount)}
                      </span>
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/vendor-payments/make-payment/share/${b.id}`)
                        }
                        className="min-h-[44px] text-sm font-medium text-green-600 hover:text-green-900"
                      >
                        Share
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-1 pr-4">Date</th>
                      <th className="pb-1 pr-4">Method</th>
                      <th className="pb-1 pr-4">Ref</th>
                      <th className="pb-1 pr-8 text-right">Amount</th>
                      <th className="pb-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBatches.map((b) => (
                      <tr key={b.id} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{formatDate(b.paymentDate)}</td>
                        <td className="pr-4 capitalize">{b.paymentMethod}</td>
                        <td className="pr-4">{b.bankRef}</td>
                        <td className="pr-8 text-right font-medium">
                          {formatAmount(b.totalAmount)}
                        </td>
                        <td>
                          {b.paymentMethod === 'check' && !b.clearedAt ? (
                            <span className="text-amber-600">Uncashed</span>
                          ) : (
                            <span className="text-green-600">Cleared</span>
                          )}
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

      <VendorAddInvoiceModal
        open={showAddInvoiceModal}
        onClose={() => setShowAddInvoiceModal(false)}
        vendors={[]}
        vatRate={vatRate}
        fixedVendorId={id}
        fixedVendorName={vendor.name}
        fixedVendorIsVatRegistered={vendor.isVatRegistered}
        onSuccess={() => void fetchVendor()}
        onEditInvoice={(invoice) => {
          setShowAddInvoiceModal(false)
          openEditInvoiceModal({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            vat: invoice.vat,
            status: 'pending',
            notes: invoice.notes ?? ''
          })
        }}
      />

      {showEditInvoiceModal && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          role="presentation"
          aria-hidden={!showEditInvoiceModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-vendor-invoice-title"
            className="my-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="edit-vendor-invoice-title" className="text-2xl font-bold text-gray-900 sm:text-3xl">
                  Edit invoice
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Update the invoice details for {vendor.name}.
                </p>
              </div>
              <VendorInvoiceVatCalculatorHeader
                isVatRegistered={vendor.isVatRegistered}
                vatRate={vatRate}
                amount={editInvoiceForm.amount}
                vat={editInvoiceForm.vat}
                onAmountVatChange={(amount, vat) =>
                  setEditInvoiceForm((prev) => ({ ...prev, amount, vat }))
                }
              />
            </div>

            <form onSubmit={handleEditInvoiceSubmit} className="space-y-4">
              {editInvoiceError && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {editInvoiceError}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Invoice number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editInvoiceForm.invoiceNumber}
                  onChange={(e) =>
                    setEditInvoiceForm({ ...editInvoiceForm, invoiceNumber: e.target.value })
                  }
                  className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                />
              </div>
              <VendorInvoiceAmountFields
                isVatRegistered={vendor.isVatRegistered}
                vatRate={vatRate}
                amount={editInvoiceForm.amount}
                vat={editInvoiceForm.vat}
                hideCalculator
                onAmountChange={(value) =>
                  setEditInvoiceForm((prev) => ({ ...prev, amount: value }))
                }
                onVatChange={(value) =>
                  setEditInvoiceForm((prev) => ({ ...prev, vat: value }))
                }
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Invoice date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editInvoiceForm.invoiceDate}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, invoiceDate: e.target.value })
                    }
                    className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Due date</label>
                  <input
                    type="date"
                    value={editInvoiceForm.dueDate}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, dueDate: e.target.value })
                    }
                    className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={editInvoiceForm.notes}
                  onChange={(e) =>
                    setEditInvoiceForm({ ...editInvoiceForm, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
                <button
                  type="submit"
                  disabled={editInvoiceSaving}
                  className="min-h-[44px] rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
                >
                  {editInvoiceSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={closeEditInvoiceModal}
                  disabled={editInvoiceSaving}
                  className="min-h-[44px] rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50 sm:min-h-0"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <VendorRevertPaymentModal
        open={showRevertModal}
        vendorId={id}
        onClose={() => setShowRevertModal(false)}
        onSuccess={() => {
          void fetchVendor()
        }}
      />
    </div>
  )
}

export default function VendorDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <VendorDetailPageInner />
    </Suspense>
  )
}
