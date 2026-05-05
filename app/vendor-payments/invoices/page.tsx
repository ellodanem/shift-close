'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import { formatAmount } from '@/lib/fuelPayments'
import { VendorMakePaymentModal } from '../components/VendorMakePaymentModal'

interface VendorRef {
  id: string
  name: string
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

function VendorInvoicesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<VendorInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState<string>('')

  const [vendors, setVendors] = useState<VendorRef[]>([])
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
  const [addInvoiceSaving, setAddInvoiceSaving] = useState(false)
  const [addInvoiceForm, setAddInvoiceForm] = useState({
    vendorId: '',
    invoiceNumber: '',
    amount: '',
    invoiceDate: '',
    dueDate: '',
    vat: '',
    notes: ''
  })

  const openAddInvoiceModal = () => {
    setAddInvoiceForm({
      vendorId: vendorFilter,
      invoiceNumber: '',
      amount: '',
      invoiceDate: businessTodayYmd(),
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

  const handleAddInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addInvoiceForm.vendorId) {
      alert('Please select a vendor')
      return
    }
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

      const res = await fetch(
        `/api/vendor-payments/vendors/${addInvoiceForm.vendorId}/invoices`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      )
      if (res.ok) {
        closeAddInvoiceModal()
        void fetchInvoices()
        void refreshCounts()
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

  useEffect(() => {
    const loadVendors = async () => {
      try {
        const res = await fetch('/api/vendor-payments/vendors')
        if (res.ok) {
          const data: VendorRef[] = await res.json()
          setVendors(data)
        }
      } catch (e) {
        console.error('Error fetching vendors', e)
      }
    }
    void loadVendors()
  }, [])

  useEffect(() => {
    void fetchInvoices()
  }, [activeTab, vendorFilter])

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [pendingRes, paidRes] = await Promise.all([
          fetch('/api/vendor-payments/invoices?status=pending'),
          fetch('/api/vendor-payments/invoices?status=paid')
        ])
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json()
          setPendingCount(pendingData.length)
        }
        if (paidRes.ok) {
          const paidData = await paidRes.json()
          setPaidCount(paidData.length)
        }
      } catch (e) {
        console.error('Error fetching counts', e)
      }
    }
    void fetchCounts()
    void fetchBalance()
  }, [])

  useEffect(() => {
    if (!copyNotification) return
    const t = setTimeout(() => setCopyNotification(null), 2000)
    return () => clearTimeout(t)
  }, [copyNotification])

  useEffect(() => {
    setSelectedInvoiceIds(new Set())
  }, [activeTab, vendorFilter])

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
      const [pendingRes, paidRes] = await Promise.all([
        fetch('/api/vendor-payments/invoices?status=pending'),
        fetch('/api/vendor-payments/invoices?status=paid')
      ])
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json()
        setPendingCount(pendingData.length)
      }
      if (paidRes.ok) {
        const paidData = await paidRes.json()
        setPaidCount(paidData.length)
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
  const selectedTotal = selectedRows.reduce((sum, inv) => sum + inv.amount, 0)
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
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading invoices...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vendor invoices</h1>
            <p className="text-sm text-gray-600 mt-1">
              All vendors in one list — filter by vendor, then pay in batch
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowBalanceModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
              title="Shared balance with Fuel Payments"
            >
              Balance
            </button>
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/vendors')}
              className="px-4 py-2 bg-slate-600 text-white rounded font-semibold hover:bg-slate-700"
            >
              Vendors
            </button>
            <button
              type="button"
              onClick={() => openMakePaymentModal(vendorFilter, '')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Make payment
            </button>
            {activeTab === 'pending' && (
              <button
                type="button"
                onClick={openAddInvoiceModal}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                + Add invoice
              </button>
            )}
          </div>
        </div>

        {balance && (
          <div className="mb-4 inline-flex flex-wrap items-baseline gap-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
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
                  ? 'text-green-600 font-semibold'
                  : 'text-red-600 font-semibold'
              }
            >
              {formatAmount(balance.balanceAfter)}
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-xs text-gray-500">
              (shared with Fuel Payments)
            </span>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="w-full md:w-72">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Vendor
            </label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-3 md:flex-row md:items-end md:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('pending')
                setSearchQuery('')
              }}
              className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
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
              className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 ${
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
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Search paid
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Invoice #, vendor, or ref"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {activeTab === 'pending' && selectedInvoiceIds.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {selectedInvoiceIds.size} invoice
                  {selectedInvoiceIds.size !== 1 ? 's' : ''} selected
                  {selectedVendorIds.size > 1 && (
                    <span className="block text-xs text-red-700 mt-1">
                      Different vendors selected — pay one vendor at a time.
                    </span>
                  )}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Total: {formatAmount(selectedTotal)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleMakePaymentSelected}
                  className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 text-sm"
                >
                  Mark selected as paid
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceIds(new Set())}
                  className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600 text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">
              No {activeTab === 'paid' ? 'paid' : 'pending'} invoices
              {vendorFilter ? ' for this vendor' : ''}.
            </p>
            {activeTab === 'pending' && (
              <button
                type="button"
                onClick={openAddInvoiceModal}
                className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
              >
                Add invoice
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {activeTab === 'paid' && searchQuery.trim() && filteredInvoices.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">
                No paid invoices match &quot;{searchQuery}&quot;.
              </div>
            ) : (
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    {activeTab === 'pending' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Due
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    {activeTab === 'pending' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        VAT
                      </th>
                    )}
                    {activeTab === 'paid' && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {invoice.vendor?.name ?? '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                        </td>
                        {activeTab === 'pending' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {invoice.dueDate != null && dueStatus ? (
                              <span
                                className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {formatAmount(invoice.amount)}
                        </td>
                        {activeTab === 'pending' && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {invoice.vat != null ? formatAmount(invoice.vat) : '—'}
                          </td>
                        )}
                        {activeTab === 'paid' && invoice.paidInvoice && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            <div>
                              {formatInvoiceDate(invoice.paidInvoice.batch.paymentDate)}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              {invoice.paidInvoice.batch.paymentMethod === 'check'
                                ? 'Check'
                                : 'EFT'}{' '}
                              · Ref {invoice.paidInvoice.batch.bankRef}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
                                  className="text-indigo-600 hover:text-indigo-900 p-1 rounded transition-colors"
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
                                  className="text-red-600 hover:text-red-900 p-1 rounded transition-colors"
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
                                className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors"
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
            )}
          </div>
        )}

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
              <div className="mb-6">
                <h2
                  id="add-vendor-invoice-title"
                  className="text-3xl font-bold text-gray-900"
                >
                  Add invoice
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Add a new pending vendor invoice. Due date is optional.
                </p>
              </div>

              <form onSubmit={handleAddInvoiceSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={addInvoiceForm.vendorId}
                    onChange={(e) =>
                      setAddInvoiceForm({ ...addInvoiceForm, vendorId: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={addInvoiceForm.amount}
                      onChange={(e) =>
                        setAddInvoiceForm({ ...addInvoiceForm, amount: e.target.value })
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      VAT / prepaid tax
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addInvoiceForm.vat}
                      onChange={(e) =>
                        setAddInvoiceForm({ ...addInvoiceForm, vat: e.target.value })
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    value={addInvoiceForm.notes}
                    onChange={(e) =>
                      setAddInvoiceForm({ ...addInvoiceForm, notes: e.target.value })
                    }
                    rows={3}
                    placeholder="Optional notes…"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-4">
                  <button
                    type="submit"
                    disabled={addInvoiceSaving}
                    className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addInvoiceSaving ? 'Creating…' : 'Create invoice'}
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

        {showBalanceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Balance (shared)</h2>
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {balance && (
                  <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
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
              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => void handleSaveBalance()}
                  disabled={savingBalance}
                  className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingBalance ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {copyNotification && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded shadow-lg">
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
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <VendorInvoicesPageInner />
    </Suspense>
  )
}
