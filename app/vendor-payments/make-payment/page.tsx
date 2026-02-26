'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  dueDate: string
  vat: number | null
  status: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function VendorMakePaymentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [invoices, setInvoices] = useState<VendorInvoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState<'eft' | 'check'>('eft')
  const [bankRef, setBankRef] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(true)
  const [balance, setBalance] = useState<{
    availableFunds: number
    uncashedChecksTotal: number
    netBalance: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    fetchVendors()
    fetchBalance()
  }, [])

  useEffect(() => {
    const vendorParam = searchParams.get('vendorId')
    if (vendorParam) setSelectedVendorId(vendorParam)
  }, [searchParams])

  useEffect(() => {
    if (selectedVendorId) {
      fetchInvoices(selectedVendorId)
    } else {
      setInvoices([])
      setSelectedInvoiceIds(new Set())
    }
  }, [selectedVendorId])

  const fetchVendors = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendor-payments/vendors')
      if (res.ok) {
        const data = await res.json()
        setVendors(data)
      }
    } catch (error) {
      console.error('Error fetching vendors:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchInvoices = async (vendorId: string) => {
    try {
      const res = await fetch(`/api/vendor-payments/vendors/${vendorId}/invoices`)
      if (res.ok) {
        const data = await res.json()
        const pending = data.filter((i: VendorInvoice) => i.status === 'pending')
        setInvoices(pending)
        setSelectedInvoiceIds(new Set())
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    }
  }

  const fetchBalance = async () => {
    try {
      const res = await fetch('/api/vendor-payments/balance')
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    }
  }

  const handleToggleInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoiceIds)
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId)
    } else {
      newSelected.add(invoiceId)
    }
    setSelectedInvoiceIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedInvoiceIds.size === invoices.length) {
      setSelectedInvoiceIds(new Set())
    } else {
      setSelectedInvoiceIds(new Set(invoices.map((inv) => inv.id)))
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
        router.push(`/vendor-payments/make-payment/share/${data.batch.id}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to make payment')
        setProcessing(false)
      }
    } catch (error) {
      console.error('Error making payment:', error)
      alert('Failed to make payment')
      setProcessing(false)
    }
  }

  const selectedTotal = invoices
    .filter((inv) => selectedInvoiceIds.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0)

  const pendingInvoices = invoices.filter((i) => i.status === 'pending')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Make Vendor Payment</h1>
            <p className="text-sm text-gray-600 mt-1">
              Select vendor and invoices, then choose EFT or check
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/vendor-payments/vendors')}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              ← Vendors
            </button>
            <button
              onClick={() => router.push('/vendor-payments/uncashed-checks')}
              className="px-4 py-2 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700"
            >
              Uncashed Checks
            </button>
          </div>
        </div>

        {balance && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Balance</h3>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Available:</span>{' '}
                <span className="font-medium">{formatAmount(balance.availableFunds)}</span>
              </div>
              {balance.uncashedChecksTotal > 0 && (
                <div>
                  <span className="text-gray-500">Uncashed checks:</span>{' '}
                  <span className="font-medium text-amber-600">
                    {formatAmount(balance.uncashedChecksTotal)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-gray-500">Net:</span>{' '}
                <span className="font-medium">{formatAmount(balance.netBalance)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'eft' | 'check')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="eft">EFT</option>
                <option value="check">Check</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {paymentMethod === 'check' ? 'Check Number' : 'Bank Ref'}
              </label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                placeholder={paymentMethod === 'check' ? 'e.g. 1234' : 'e.g. 18921926'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            {paymentMethod === 'eft' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transfer Description (optional)
                </label>
                <input
                  type="text"
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                  placeholder="e.g. Total Auto INV001 INV002"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="addToCashbook"
                checked={addToCashbook}
                onChange={(e) => setAddToCashbook(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="addToCashbook" className="text-sm text-gray-700">
                Add to Cashbook (Rec. Gen)
              </label>
            </div>
          </div>
        </div>

        {selectedVendorId && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Pending Invoices</h2>
              {pendingInvoices.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {selectedInvoiceIds.size === pendingInvoices.length
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              )}
            </div>

            {pendingInvoices.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No pending invoices for this vendor. Add invoices from the vendor detail page.
              </p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 pr-2">
                        <input
                          type="checkbox"
                          checked={
                            selectedInvoiceIds.size === pendingInvoices.length &&
                            pendingInvoices.length > 0
                          }
                          onChange={handleSelectAll}
                          className="rounded"
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
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50">
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
                          {inv.vat != null ? formatAmount(inv.vat) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedInvoiceIds.size > 0 && (
                  <div className="mt-4 flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {selectedInvoiceIds.size} invoice(s) selected
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-semibold text-gray-900">
                        Total: {formatAmount(selectedTotal)}
                      </span>
                      <button
                        onClick={handleMakePayment}
                        disabled={processing}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {processing ? 'Processing...' : 'Make Payment'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function VendorMakePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <VendorMakePaymentPageInner />
    </Suspense>
  )
}
