'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface VendorInvoice {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string
  dueDate: string
  vat: number | null
  status: string
  notes: string
}

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
  notes: string
  invoices: VendorInvoice[]
  batches: VendorBatch[]
}

export default function VendorDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)

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
    } catch (error) {
      console.error('Error fetching vendor:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const formatAmount = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const pendingInvoices = vendor?.invoices?.filter((i) => i.status === 'pending') ?? []
  const paidInvoices = vendor?.invoices?.filter((i) => i.status === 'paid') ?? []

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
          </dl>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
            <div className="flex gap-2">
              {pendingInvoices.length > 0 && (
                <button
                  onClick={() => router.push(`/vendor-payments/make-payment?vendorId=${id}`)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                >
                  Make Payment
                </button>
              )}
              <button
                onClick={() => router.push(`/vendor-payments/vendors/${id}/invoices/new`)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700"
              >
                Add Invoice
              </button>
            </div>
          </div>
          {vendor.invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No invoices yet.</p>
          ) : (
            <div className="space-y-4">
              {pendingInvoices.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Pending</h3>
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
                          <td>{formatDate(inv.dueDate)}</td>
                          <td className="text-right font-medium">{formatAmount(inv.amount)}</td>
                          <td className="text-right">
                            <button
                              onClick={() => router.push(`/vendor-payments/invoices/${inv.id}/edit`)}
                              className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                            >
                              Edit
                            </button>
                            <button
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
                  </table>
                </div>
              )}
              {paidInvoices.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Paid</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="pb-1">Invoice #</th>
                        <th className="pb-1">Date</th>
                        <th className="pb-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidInvoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-gray-100">
                          <td className="py-2">{inv.invoiceNumber}</td>
                          <td>{formatDate(inv.invoiceDate)}</td>
                          <td className="text-right font-medium">{formatAmount(inv.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Payment Batches</h2>
          {vendor.batches.length === 0 ? (
            <p className="text-sm text-gray-500">No payment batches yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1">Date</th>
                  <th className="pb-1">Method</th>
                  <th className="pb-1">Ref</th>
                  <th className="pb-1 text-right">Amount</th>
                  <th className="pb-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {vendor.batches.map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="py-2">{formatDate(b.paymentDate)}</td>
                    <td className="capitalize">{b.paymentMethod}</td>
                    <td>{b.bankRef}</td>
                    <td className="text-right font-medium">{formatAmount(b.totalAmount)}</td>
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
    </div>
  )
}
