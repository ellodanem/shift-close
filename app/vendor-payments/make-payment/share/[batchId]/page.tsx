'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

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
  return formatInvoiceDate(d)
}

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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading payment details...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Share Vendor Payment
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {batch.vendor.name} – {batch.paymentMethod.toUpperCase()} – Ref{' '}
              {batch.bankRef}
            </p>
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

        <div
          id="vendor-payment-summary"
          className="mb-6 rounded-lg bg-white p-4 shadow sm:p-6"
          ref={summaryRef}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Vendor Payment – {batch.vendor.name}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                {batch.paymentMethod.toUpperCase()} · Ref{' '}
                <span className="font-mono">{batch.bankRef}</span>
              </p>
            </div>
            <div className="text-left text-xs sm:text-right">
              <div className="text-gray-600">Date Paid</div>
              <div className="font-medium text-gray-900">{formatDate(batch.paymentDate)}</div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div>
              <div className="mb-1 font-medium text-gray-600">Total Paid</div>
              <div className="font-semibold text-gray-900">
                {formatAmount(batch.totalAmount)}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium text-gray-600">Balance Before</div>
              <div className="font-semibold text-gray-900">
                {batch.balanceBeforeFormatted}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium text-gray-600">Balance After</div>
              <div className="font-semibold text-gray-900">
                {batch.balanceAfterFormatted}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">
              Invoices ({batch.invoices.length})
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-gray-50 sm:max-h-40">
              {batch.invoices.map((inv, idx) => (
                <div
                  key={`${inv.invoiceNumber}-${idx}`}
                  className="flex justify-between border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-gray-900">{inv.invoiceNumber}</span>
                    <span className="ml-2 text-gray-500">{formatDate(inv.invoiceDate)}</span>
                  </div>
                  <span className="shrink-0 text-gray-600">{formatAmount(inv.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Actions</h3>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:gap-4">
            <button
              type="button"
              onClick={() => void handleDownloadPNG()}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => void handleCopyPNG()}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              Copy PNG
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Email Notification</h3>
          <p className="mb-2 break-all text-sm text-gray-500">
            Send payment summary to {batch.vendor.notificationEmail}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            <div className="min-w-0 flex-1 sm:min-w-[200px]">
              <label className="mb-1 block text-xs text-gray-500">CC (optional)</label>
              <input
                type="email"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="accountant@example.com"
                className="min-h-[44px] w-full rounded border border-gray-300 px-3 py-2 text-sm sm:min-h-0"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendNotification()}
              disabled={sending}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:min-h-0"
            >
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
