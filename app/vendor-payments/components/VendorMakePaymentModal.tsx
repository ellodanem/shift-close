'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatAmount } from '@/lib/fuelPayments'

interface Vendor {
  id: string
  name: string
  notificationEmail: string
}

interface VendorInvoice {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string | null
  vat: number | null
  status: string
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function VendorMakePaymentModal({
  open,
  onClose,
  initialVendorId,
  initialSelectedCsv,
  onSuccess
}: {
  open: boolean
  onClose: () => void
  initialVendorId: string
  initialSelectedCsv: string
  onSuccess: (batchId: string) => void
}) {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(false)
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [invoices, setInvoices] = useState<VendorInvoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'eft' | 'check'>('eft')
  const [bankRef, setBankRef] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(true)
  const [balance, setBalance] = useState<{
    availableFunds: number
    uncashedChecksTotal: number
    netBalance: number
  } | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentMethod('eft')
    setBankRef('')
    setTransferDescription('')
    setAddToCashbook(true)
    setSelectedVendorId(initialVendorId)
    setProcessing(false)
  }, [open, initialVendorId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setVendorsLoading(true)
    void (async () => {
      try {
        const res = await fetch('/api/vendor-payments/vendors')
        if (res.ok && !cancelled) {
          const data: Vendor[] = await res.json()
          setVendors(data)
        }
      } catch (e) {
        console.error('Error fetching vendors', e)
      } finally {
        if (!cancelled) setVendorsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        const res = await fetch('/api/vendor-payments/balance')
        if (res.ok) {
          const data = await res.json()
          setBalance(data)
        }
      } catch (e) {
        console.error('Error fetching vendor balance', e)
      }
    })()
  }, [open])

  const fetchInvoices = async (vendorId: string, selectedFromUrl: string | null) => {
    try {
      const res = await fetch(`/api/vendor-payments/vendors/${vendorId}/invoices`)
      if (res.ok) {
        const data = await res.json()
        const pending = data.filter((i: VendorInvoice) => i.status === 'pending')
        setInvoices(pending)
        if (selectedFromUrl && selectedFromUrl.trim()) {
          const want = new Set(
            selectedFromUrl.split(',').map((s) => s.trim()).filter(Boolean)
          )
          const next = new Set<string>(
            pending
              .filter((i: VendorInvoice) => want.has(i.id))
              .map((i: VendorInvoice) => i.id)
          )
          setSelectedInvoiceIds(next)
        } else {
          setSelectedInvoiceIds(new Set())
        }
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    }
  }

  useEffect(() => {
    if (!open || !selectedVendorId) {
      setInvoices([])
      setSelectedInvoiceIds(new Set())
      return
    }
    const seed =
      selectedVendorId === initialVendorId && initialSelectedCsv.trim()
        ? initialSelectedCsv
        : null
    void fetchInvoices(selectedVendorId, seed)
  }, [open, selectedVendorId, initialVendorId, initialSelectedCsv])

  const handleToggleInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoiceIds)
    if (newSelected.has(invoiceId)) newSelected.delete(invoiceId)
    else newSelected.add(invoiceId)
    setSelectedInvoiceIds(newSelected)
  }

  const pendingInvoices = invoices.filter((i) => i.status === 'pending')

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === pendingInvoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(pendingInvoices.map((inv) => inv.id)))
    }
  }

  const handleMakePayment = async () => {
    if (!selectedVendorId) {
      alert('Please select a vendor')
      return
    }
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    if (!bankRef.trim()) {
      alert('Please enter a bank reference or check number')
      return
    }

    const vendor = vendors.find((v) => v.id === selectedVendorId)
    const confirmed = window.confirm(
      `Mark ${selectedInvoiceIds.size} invoice(s) as paid?\n\nVendor: ${vendor?.name}\nPayment: ${paymentMethod.toUpperCase()}\nDate: ${paymentDate}\nRef: ${bankRef.trim()}\n${addToCashbook ? '\nAdd to Cashbook: Yes' : ''}`
    )
    if (!confirmed) return

    setProcessing(true)
    try {
      const res = await fetch('/api/vendor-payments/make-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: selectedVendorId,
          paymentDate,
          paymentMethod,
          bankRef: bankRef.trim(),
          selectedInvoiceIds: Array.from(selectedInvoiceIds),
          transferDescription: transferDescription.trim() || undefined,
          addToCashbook
        })
      })

      if (res.ok) {
        const data = await res.json()
        onSuccess(data.batch.id)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to make payment')
      }
    } catch (error) {
      console.error('Error making payment:', error)
      alert('Failed to make payment')
    } finally {
      setProcessing(false)
    }
  }

  const selectedTotal = invoices
    .filter((inv) => selectedInvoiceIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-make-payment-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="vendor-make-payment-title"
              className="text-2xl font-bold text-gray-900"
            >
              Make vendor payment
            </h2>
            <p className="text-sm text-gray-600">
              Select vendor and invoices, then choose EFT or check.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/vendor-payments/uncashed-checks')}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Uncashed checks
            </button>
          </div>
        </div>

        {vendorsLoading ? (
          <p className="text-sm text-gray-600 py-8 text-center">Loading…</p>
        ) : (
          <>
            {balance && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <span className="text-gray-600">Available: </span>
                <span className="font-medium">{formatAmount(balance.availableFunds)}</span>
                {balance.uncashedChecksTotal > 0 && (
                  <>
                    <span className="mx-2 text-gray-400">|</span>
                    <span className="text-gray-600">Uncashed: </span>
                    <span className="font-medium text-amber-600">
                      {formatAmount(balance.uncashedChecksTotal)}
                    </span>
                  </>
                )}
                <span className="mx-2 text-gray-400">|</span>
                <span className="text-gray-600">Net: </span>
                <span className="font-medium">{formatAmount(balance.netBalance)}</span>
              </div>
            )}

            <div className="mb-4 rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Payment details</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Vendor
                  </label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
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
                    Payment date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Payment method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'eft' | 'check')
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="eft">EFT</option>
                    <option value="check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {paymentMethod === 'check' ? 'Check number' : 'Bank ref'}
                  </label>
                  <input
                    type="text"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    placeholder={paymentMethod === 'check' ? 'e.g. 1234' : 'e.g. 18921926'}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {paymentMethod === 'eft' && (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Transfer description (optional)
                    </label>
                    <input
                      type="text"
                      value={transferDescription}
                      onChange={(e) => setTransferDescription(e.target.value)}
                      placeholder="e.g. Total Auto INV001 INV002"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div className="md:col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="vendorPayAddCashbook"
                    checked={addToCashbook}
                    onChange={(e) => setAddToCashbook(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="vendorPayAddCashbook" className="text-sm text-gray-700">
                    Add to Cashbook (Rec. Gen)
                  </label>
                </div>
              </div>
            </div>

            {selectedVendorId && (
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Pending invoices</h3>
                  {pendingInvoices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {selectedInvoiceIds.size === pendingInvoices.length &&
                      pendingInvoices.length > 0
                        ? 'Deselect all'
                        : 'Select all'}
                    </button>
                  )}
                </div>

                {pendingInvoices.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No pending invoices for this vendor.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="pb-2 pr-2">
                              <input
                                type="checkbox"
                                checked={
                                  selectedInvoiceIds.size === pendingInvoices.length &&
                                  pendingInvoices.length > 0
                                }
                                onChange={handleSelectAll}
                                className="rounded"
                                aria-label="Select all"
                              />
                            </th>
                            <th className="pb-2">Invoice #</th>
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Due</th>
                            <th className="pb-2 text-right">Amount</th>
                            <th className="pb-2 text-right">VAT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingInvoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-2 pr-2">
                                <input
                                  type="checkbox"
                                  checked={selectedInvoiceIds.has(inv.id)}
                                  onChange={() => handleToggleInvoice(inv.id)}
                                  className="rounded"
                                />
                              </td>
                              <td className="py-2 font-mono">{inv.invoiceNumber}</td>
                              <td className="py-2">{formatDate(inv.invoiceDate)}</td>
                              <td className="py-2">{formatDate(inv.dueDate)}</td>
                              <td className="py-2 text-right font-medium">
                                {formatAmount(inv.amount)}
                              </td>
                              <td className="py-2 text-right">
                                {inv.vat != null ? formatAmount(inv.vat) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {selectedInvoiceIds.size > 0 && (
                      <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm text-gray-600">
                          {selectedInvoiceIds.size} invoice(s) selected · Total:{' '}
                          <span className="font-semibold text-gray-900">
                            {formatAmount(selectedTotal)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleMakePayment()}
                          disabled={processing}
                          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {processing ? 'Processing…' : 'Make payment'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
