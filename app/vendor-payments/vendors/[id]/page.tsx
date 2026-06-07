'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'
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
  notes: string
  invoices: VendorInvoice[]
  batches: VendorBatch[]
}

type BatchFilterType = 'all' | 'thisMonth' | 'lastMonth' | 'custom'

function todayYmd() {
  return new Date().toISOString().split('T')[0]
}

function vendorInvoiceTotal(amount: number, vat: number | null) {
  return amount + (vat ?? 0)
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

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE)
  const [loading, setLoading] = useState(true)
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false)
  const [addInvoiceSaving, setAddInvoiceSaving] = useState(false)
  const [addInvoiceForm, setAddInvoiceForm] = useState({
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })
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

  useEffect(() => {
    fetchVendor()
  }, [id])

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
  const pendingTotal = pendingInvoices.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )
  const paidQuery = paidSearchQuery.trim().toLowerCase()
  const filteredPaidInvoices = useMemo(() => {
    if (!paidQuery) return paidInvoices
    return paidInvoices.filter((inv) => {
      const num = inv.invoiceNumber.toLowerCase()
      const ref = inv.paidInvoice?.batch.bankRef?.toLowerCase() ?? ''
      const method = inv.paidInvoice?.batch.paymentMethod?.toLowerCase() ?? ''
      return num.includes(paidQuery) || ref.includes(paidQuery) || method.includes(paidQuery)
    })
  }, [paidInvoices, paidQuery])
  const filteredPaidTotal = filteredPaidInvoices.reduce(
    (sum, inv) => sum + vendorInvoiceTotal(inv.amount, inv.vat),
    0
  )
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

  const openAddInvoiceModal = () => {
    setAddInvoiceForm({
      invoiceNumber: '',
      amount: '',
      invoiceDate: todayYmd(),
      dueDate: '',
      vat: '',
      notes: ''
    })
    setShowAddInvoiceModal(true)
  }

  const closeAddInvoiceModal = () => {
    setShowAddInvoiceModal(false)
    setAddInvoiceSaving(false)
  }

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

  const handleAddInvoiceSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(addInvoiceForm.amount)
    if (Number.isNaN(amt)) {
      alert('Please enter a valid amount')
      return
    }
    setAddInvoiceSaving(true)
    try {
      const payload: Record<string, unknown> = {
        invoiceNumber: addInvoiceForm.invoiceNumber.trim(),
        amount: amt,
        invoiceDate: addInvoiceForm.invoiceDate,
        notes: addInvoiceForm.notes.trim()
      }
      if (addInvoiceForm.dueDate.trim()) {
        payload.dueDate = addInvoiceForm.dueDate
      }
      if (addInvoiceForm.vat.trim() !== '') {
        payload.vat = parseFloat(addInvoiceForm.vat)
      }

      const res = await fetch(`/api/vendor-payments/vendors/${id}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        closeAddInvoiceModal()
        await fetchVendor()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to create invoice')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to create invoice')
    } finally {
      setAddInvoiceSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">Vendor not found.</p>
        <button onClick={() => router.push('/vendor-payments/vendors')} className="mt-4 text-blue-600">
          Back to Vendors
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{vendor.name}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/vendor-payments/vendors/${id}/edit`)}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Edit
            </button>
            <button
              onClick={() => router.push('/vendor-payments/vendors')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Back
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">Notification Email</dt>
              <dd className="text-sm font-medium text-gray-900">{vendor.notificationEmail}</dd>
            </div>
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

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
            <div className="flex gap-2">
              {activeInvoiceTab === 'pending' && pendingInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => router.push(`/vendor-payments/make-payment?vendorId=${id}`)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                >
                  Make Payment
                </button>
              )}
              {activeInvoiceTab === 'paid' && paidInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowRevertModal(true)}
                  className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm font-semibold hover:bg-orange-700"
                >
                  Revert Payment
                </button>
              )}
              <button
                type="button"
                onClick={openAddInvoiceModal}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
              >
                Add Invoice
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveInvoiceTab('pending')}
                className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
                  activeInvoiceTab === 'pending'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending Invoices ({pendingInvoices.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveInvoiceTab('paid')}
                className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
                  activeInvoiceTab === 'paid'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Paid Invoices ({paidInvoices.length})
              </button>
            </div>
            {activeInvoiceTab === 'paid' && paidInvoices.length > 0 && (
              <div className="w-full md:w-64 pb-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Search paid
                </label>
                <input
                  type="text"
                  value={paidSearchQuery}
                  onChange={(e) => setPaidSearchQuery(e.target.value)}
                  placeholder="Invoice #, method, or ref"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {activeInvoiceTab === 'pending' ? (
            pendingInvoices.length === 0 ? (
              <p className="text-sm text-gray-500">No pending invoices.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-1">Invoice #</th>
                    <th className="pb-1">Date</th>
                    <th className="pb-1">Due</th>
                    <th className="pb-1 text-right">Amount</th>
                    <th className="pb-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-gray-100">
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
                          className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Delete invoice ${inv.invoiceNumber}?`)) return
                            try {
                              const res = await fetch(`/api/vendor-payments/invoices/${inv.id}`, {
                                method: 'DELETE'
                              })
                              if (res.ok) fetchVendor()
                              else {
                                const err = await res.json()
                                alert(err.error || 'Failed to delete')
                              }
                            } catch {
                              alert('Failed to delete invoice')
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td className="py-2 text-sm font-semibold text-gray-700" colSpan={3}>
                      Total ({pendingInvoices.length} invoice
                      {pendingInvoices.length !== 1 ? 's' : ''})
                    </td>
                    <td className="text-right text-sm font-semibold text-blue-700">
                      {formatAmount(pendingTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )
          ) : paidInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">No paid invoices yet.</p>
          ) : filteredPaidInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">
              No paid invoices match &quot;{paidSearchQuery}&quot;.
            </p>
          ) : (
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
                          <span className="text-xs text-gray-500 font-mono">
                            {inv.paidInvoice.batch.paymentMethod === 'check' ? 'Check' : 'EFT'}
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
                    {paidQuery && filteredPaidInvoices.length !== paidInvoices.length
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
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">Recent Payment Batches</h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveBatchFilter('all')}
                  className={`px-3 py-1.5 rounded font-semibold text-xs transition-colors ${
                    activeBatchFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  All Batches
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBatchFilter('thisMonth')}
                  className={`px-3 py-1.5 rounded font-semibold text-xs transition-colors ${
                    activeBatchFilter === 'thisMonth'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBatchFilter('lastMonth')}
                  className={`px-3 py-1.5 rounded font-semibold text-xs transition-colors ${
                    activeBatchFilter === 'lastMonth'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBatchFilter('custom')}
                  className={`px-3 py-1.5 rounded font-semibold text-xs transition-colors ${
                    activeBatchFilter === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Custom Range
                </button>
              </div>
              {activeBatchFilter === 'custom' && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={customBatchStartDate}
                    onChange={(e) => setCustomBatchStartDate(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                  />
                  <span className="text-xs text-gray-500">to</span>
                  <input
                    type="date"
                    value={customBatchEndDate}
                    onChange={(e) => setCustomBatchEndDate(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                  Search (Ref, Method, Amount, Status)
                </label>
                <input
                  type="text"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          )}
        </div>
      </div>

      {showAddInvoiceModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          aria-hidden={!showAddInvoiceModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-vendor-invoice-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="add-vendor-invoice-title" className="text-3xl font-bold text-gray-900">
                  Add invoice
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Add a new pending invoice for {vendor.name}. Due date is optional.
                </p>
              </div>
              <VendorInvoiceVatCalculatorHeader
                isVatRegistered={vendor.isVatRegistered}
                vatRate={vatRate}
                amount={addInvoiceForm.amount}
                vat={addInvoiceForm.vat}
                onAmountChange={(value) =>
                  setAddInvoiceForm({ ...addInvoiceForm, amount: value })
                }
                onVatChange={(value) => setAddInvoiceForm({ ...addInvoiceForm, vat: value })}
              />
            </div>

            <form onSubmit={handleAddInvoiceSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Invoice number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addInvoiceForm.invoiceNumber}
                  onChange={(e) =>
                    setAddInvoiceForm({
                      ...addInvoiceForm,
                      invoiceNumber: e.target.value
                    })
                  }
                  placeholder="e.g., INV-001"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <VendorInvoiceAmountFields
                isVatRegistered={vendor.isVatRegistered}
                vatRate={vatRate}
                amount={addInvoiceForm.amount}
                vat={addInvoiceForm.vat}
                onAmountChange={(value) =>
                  setAddInvoiceForm({ ...addInvoiceForm, amount: value })
                }
                onVatChange={(value) => setAddInvoiceForm({ ...addInvoiceForm, vat: value })}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Invoice date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={addInvoiceForm.invoiceDate}
                    onChange={(e) =>
                      setAddInvoiceForm({
                        ...addInvoiceForm,
                        invoiceDate: e.target.value
                      })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Due date <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={addInvoiceForm.dueDate}
                    onChange={(e) =>
                      setAddInvoiceForm({ ...addInvoiceForm, dueDate: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={addInvoiceForm.notes}
                  onChange={(e) =>
                    setAddInvoiceForm({ ...addInvoiceForm, notes: e.target.value })
                  }
                  rows={3}
                  placeholder="Optional notes..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-4">
                <button
                  type="submit"
                  disabled={addInvoiceSaving}
                  className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addInvoiceSaving ? 'Creating...' : 'Create invoice'}
                </button>
                <button
                  type="button"
                  onClick={closeAddInvoiceModal}
                  disabled={addInvoiceSaving}
                  className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditInvoiceModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          aria-hidden={!showEditInvoiceModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-vendor-invoice-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 id="edit-vendor-invoice-title" className="text-3xl font-bold text-gray-900">
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
                onAmountChange={(value) =>
                  setEditInvoiceForm({ ...editInvoiceForm, amount: value })
                }
                onVatChange={(value) => setEditInvoiceForm({ ...editInvoiceForm, vat: value })}
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <VendorInvoiceAmountFields
                isVatRegistered={vendor.isVatRegistered}
                vatRate={vatRate}
                amount={editInvoiceForm.amount}
                vat={editInvoiceForm.vat}
                onAmountChange={(value) =>
                  setEditInvoiceForm({ ...editInvoiceForm, amount: value })
                }
                onVatChange={(value) => setEditInvoiceForm({ ...editInvoiceForm, vat: value })}
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <div className="mt-6 flex flex-wrap gap-4">
                <button
                  type="submit"
                  disabled={editInvoiceSaving}
                  className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {editInvoiceSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={closeEditInvoiceModal}
                  disabled={editInvoiceSaving}
                  className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
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
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <VendorDetailPageInner />
    </Suspense>
  )
}
