'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { formatAmount } from '@/lib/fuelPayments'

interface PaidVendorInvoice {
  invoiceNumber: string
  amount: number
  invoiceDate: string
  vat: number | null
}

interface VendorBatch {
  id: string
  paymentDate: string
  paymentMethod: string
  bankRef: string
  totalAmount: number
  transferDescription: string | null
  balanceBeforeFormatted: string
  balanceAfterFormatted: string
  vendor: { name: string; notificationEmail: string }
  invoices: PaidVendorInvoice[]
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

export default function VendorSharePaymentPage() {
  const router = useRouter()
  const params = useParams<{ batchId: string }>()
  const [batch, setBatch] = useState<VendorBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [ccEmail, setCcEmail] = useState('')
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchBatch = async () => {
      try {
        const res = await fetch(`/api/vendor-payments/batches/${params.batchId}`)
        if (!res.ok) throw new Error('Failed to fetch payment batch')
        const data = await res.json()
        setBatch(data)
      } catch (error) {
        console.error(error)
        alert('Failed to load payment details')
        router.push('/vendor-payments/vendors')
      } finally {
        setLoading(false)
      }
    }

    if (params.batchId) fetchBatch()
  }, [params.batchId, router])

  const generateImage = async (): Promise<string> => {
    const el = summaryRef.current
    if (!el || !batch) throw new Error('Nothing to render')
    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    })
    return canvas.toDataURL('image/png')
  }

  const handleDownloadPNG = async () => {
    try {
      const dataUrl = await generateImage()
      const link = document.createElement('a')
      link.download = `vendor-payment-${batch!.bankRef}.png`
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error('Error generating PNG:', error)
      alert('Failed to generate PNG')
    }
  }

  const handleCopyPNG = async () => {
    try {
      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      alert('Image copied to clipboard!')
    } catch (error) {
      console.error('Error copying PNG:', error)
      alert('Failed to copy PNG to clipboard')
    }
  }

  const handleSendNotification = async () => {
    if (!batch) return
    setSending(true)
    try {
      const res = await fetch('/api/vendor-payments/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          ccEmail: ccEmail.trim() || undefined
        })
      })
      if (res.ok) {
        alert('Notification sent to vendor email.')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Failed to send notification')
      }
    } catch (error) {
      console.error('Error sending notification:', error)
      alert('Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  if (loading || !batch) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading payment details...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Share Vendor Payment</h1>
            <p className="text-sm text-gray-600 mt-1">
              {batch.vendor.name} – {batch.paymentMethod.toUpperCase()} – Ref {batch.bankRef}
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
              onClick={() => router.push('/vendor-payments/make-payment')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Make Payment
            </button>
          </div>
        </div>

        <div
          id="vendor-payment-summary"
          className="bg-white rounded-lg shadow p-6 mb-6"
          ref={summaryRef}
        >
          <div className="mb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Vendor Payment – {batch.vendor.name}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {batch.paymentMethod.toUpperCase()} · Ref <span className="font-mono">{batch.bankRef}</span>
              </p>
            </div>
            <div className="text-right text-xs">
              <div className="text-gray-600">Date Paid</div>
              <div className="text-gray-900 font-medium">{formatDate(batch.paymentDate)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            <div>
              <div className="font-medium text-gray-600 mb-1">Total Paid</div>
              <div className="text-gray-900 font-semibold">{formatAmount(batch.totalAmount)}</div>
            </div>
            <div>
              <div className="font-medium text-gray-600 mb-1">Balance Before</div>
              <div className="text-gray-900 font-semibold">{batch.balanceBeforeFormatted}</div>
            </div>
            <div>
              <div className="font-medium text-gray-600 mb-1">Balance After</div>
              <div className="text-gray-900 font-semibold">{batch.balanceAfterFormatted}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">
              Invoices ({batch.invoices.length})
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded bg-gray-50">
              {batch.invoices.map((inv, idx) => (
                <div
                  key={`${inv.invoiceNumber}-${idx}`}
                  className="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0"
                >
                  <div>
                    <span className="font-mono text-gray-900">{inv.invoiceNumber}</span>
                    <span className="text-gray-500 ml-2">{formatDate(inv.invoiceDate)}</span>
                  </div>
                  <span className="text-gray-600">{formatAmount(inv.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Actions</h3>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleDownloadPNG}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Download PNG
            </button>
            <button
              onClick={handleCopyPNG}
              className="px-4 py-2 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700"
            >
              Copy PNG
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Email Notification</h3>
          <p className="text-sm text-gray-500 mb-2">
            Send payment summary to {batch.vendor.notificationEmail}
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">CC (optional)</label>
              <input
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="accountant@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <button
              onClick={handleSendNotification}
              disabled={sending}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
