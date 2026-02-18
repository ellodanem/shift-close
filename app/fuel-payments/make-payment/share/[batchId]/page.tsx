'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { formatInvoiceDate } from '@/lib/invoiceHelpers'

interface PaidBatchInvoice {
  invoiceNumber: string
  amount: string
  type: string
  invoiceDate: string
   dueDate: string
}

interface PaidBatch {
  datePaid: string
  referenceNumber: string
  totalPaid: string
  balanceBefore: string
  balanceAfter: string
  invoices: PaidBatchInvoice[]
}

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

export default function SharePaidPaymentPage() {
  const router = useRouter()
  const params = useParams<{ batchId: string }>()
  const [batch, setBatch] = useState<PaidBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const imageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchBatch = async () => {
      try {
        const res = await fetch(`/api/fuel-payments/batches/${params.batchId}`)
        if (!res.ok) {
          throw new Error('Failed to fetch payment batch')
        }
        const data = await res.json()
        // Prefer pre-formatted summary from API, but fall back gracefully
        if (data.summary) {
          setBatch(data.summary as PaidBatch)
        } else {
          setBatch({
            datePaid: data.paymentDate,
            referenceNumber: data.bankRef,
            totalPaid: String(data.totalAmount),
            balanceBefore: '-',
            balanceAfter: '-',
            invoices: (data.invoices || []).map((inv: any) => ({
              invoiceNumber: inv.invoiceNumber,
              amount: String(inv.amount),
              type: inv.type,
              invoiceDate: typeof inv.invoiceDate === 'string' && inv.invoiceDate.includes('T') ? formatInvoiceDate(inv.invoiceDate) : String(inv.invoiceDate ?? ''),
              dueDate: typeof inv.dueDate === 'string' && inv.dueDate.includes('T') ? formatInvoiceDate(inv.dueDate) : String(inv.dueDate ?? '')
            }))
          })
        }
      } catch (error) {
        console.error(error)
        alert('Failed to load payment details')
        router.push('/fuel-payments/invoices')
      } finally {
        setLoading(false)
      }
    }

    if (params.batchId) {
      fetchBatch()
    }
  }, [params.batchId, router])

  const generateImage = async (): Promise<string> => {
    if (!imageRef.current || !batch) {
      throw new Error('Nothing to render')
    }

    const canvas = await html2canvas(imageRef.current, {
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
      link.download = `fuel-payment-${batch!.referenceNumber}.png`
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
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      alert('Image copied to clipboard!')
    } catch (error) {
      console.error('Error copying PNG:', error)
      alert('Failed to copy PNG to clipboard')
    }
  }

  const handleWhatsApp = async () => {
    try {
      if (!batch) return

      // Generate PNG for this paid payment
      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'fuel-payment.png', { type: 'image/png' })

      // 1) Prefer Web Share API with attached image on mobile (WhatsApp app)
      if (isMobileDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Fuel Payment'
        })
        return
      }

      // 2) Fallback for WhatsApp Web: copy PNG to clipboard, then open WhatsApp Web tab
      if (navigator.clipboard && 'write' in navigator.clipboard && (window as any).ClipboardItem) {
        try {
          const clipboardItem = new (window as any).ClipboardItem({ 'image/png': blob })
          await (navigator.clipboard as any).write([clipboardItem])
          window.open('https://web.whatsapp.com/send', '_blank')
          alert('Image copied to clipboard. Paste into WhatsApp Web (Ctrl+V).')
          return
        } catch (clipboardError) {
          console.error('Error copying PNG for WhatsApp Web:', clipboardError)
        }
      }

      // 3) Final fallback
      alert('Your browser cannot share images directly to WhatsApp. Please download or copy the PNG manually.')
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error)
      alert('Failed to open WhatsApp Web')
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
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Share Paid Payment</h1>
            <p className="text-sm text-gray-600 mt-1">
              Download, copy, or share a summary of this paid fuel payment with your accountant.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/fuel-payments')}
              className="px-4 py-2 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => router.push('/fuel-payments/batches')}
              className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              ← Back to Batches
            </button>
            <button
              onClick={() => router.push('/fuel-payments/invoices')}
              className="px-4 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600"
            >
              ← Back to Invoices
            </button>
          </div>
        </div>

        {/* Visible summary card */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="mb-4 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Paid Payment Summary</h3>
              <p className="text-xs text-gray-500 mt-1">
                Batch reference <span className="font-mono">{batch.referenceNumber}</span>
              </p>
            </div>
            <div className="text-right text-xs">
              <div className="text-gray-600">Date Paid</div>
              <div className="text-gray-900 font-medium">{batch.datePaid}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            <div>
              <div className="font-medium text-gray-600 mb-1">Total Paid</div>
              <div className="text-gray-900 font-semibold">{batch.totalPaid}</div>
            </div>
            <div>
              <div className="font-medium text-gray-600 mb-1">Balance Before (Available)</div>
              <div className="text-gray-900 font-semibold">
                {batch.balanceBefore}
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-600 mb-1">
                Balance After (Available - Paid)
              </div>
              <div
                className={
                  batch.balanceAfter.startsWith('-')
                    ? 'text-red-600 font-semibold'
                    : 'text-green-600 font-semibold'
                }
              >
                {batch.balanceAfter}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">
              Invoices in this payment ({batch.invoices.length})
            </div>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded bg-gray-50">
              {batch.invoices.map((inv, idx) => (
                <div
                  key={`${inv.invoiceNumber}-${idx}`}
                  className="flex justify-between px-2 py-1 text-xs border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-gray-900">
                      {inv.invoiceNumber}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {inv.invoiceDate} · {inv.type}
                    </span>
                  </div>
                  <span className="text-gray-600">{inv.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
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
            <button
              onClick={handleWhatsApp}
              className="px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700"
            >
              WhatsApp Web
            </button>
          </div>
        </div>

        {/* Hidden div for clean PNG generation – styled similar to simulation 1.0.9 */}
        <div
          ref={imageRef}
          className="fixed -left-[9999px] top-0 w-[800px] bg-white p-8"
          style={{
            fontFamily: 'monospace, Courier, monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            color: '#000000'
          }}
        >
          {/* Fuel Payment Section */}
          <div style={{ marginBottom: '12px' }}>
            <div
              style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}
            >
              Fuel Payment - {batch.datePaid}
            </div>

            {batch.invoices.map((inv) => {
              return (
                <div key={inv.invoiceNumber} style={{ marginBottom: '4px' }}>
                  {/* Invoice # */}
                  <span
                    style={{
                      fontWeight: 'bold',
                      display: 'inline-block',
                      width: '70px'
                    }}
                  >
                    {inv.invoiceNumber}
                  </span>
                  {/* Amount */}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '100px',
                      textAlign: 'right'
                    }}
                  >
                    {inv.amount}
                  </span>
                  {/* Type */}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '80px',
                      marginLeft: '20px'
                    }}
                  >
                    {inv.type}
                  </span>
                </div>
              )
            })}

            {/* Total aligned under amount column */}
            <div style={{ marginTop: '4px', marginBottom: '4px' }}>
              {/* Blank invoice column */}
              <span
                style={{
                  display: 'inline-block',
                  width: '70px'
                }}
              >
                {/* intentionally blank */}
              </span>
              {/* Total amount column, matches invoice amount alignment */}
              <span
                style={{
                  display: 'inline-block',
                  width: '100px',
                  textAlign: 'right',
                  fontWeight: 'bold'
                }}
              >
                {batch.totalPaid}
              </span>
              {/* Preserve type column spacing (left blank) */}
              <span
                style={{
                  display: 'inline-block',
                  width: '80px',
                  marginLeft: '20px'
                }}
              >
                {/* blank */}
              </span>
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#666',
                marginTop: '4px',
                fontWeight: 'bold',
                marginLeft: '190px'
              }}
            >
              paid {batch.datePaid}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#666',
                fontWeight: 'bold',
                marginLeft: '190px'
              }}
            >
              Ref{' '}
              <span
                style={{
                  color: '#1d4ed8', // blue-700 style
                  fontWeight: 'bold'
                }}
              >
                {batch.referenceNumber}
              </span>
            </div>
          </div>

          {/* Balance Information Section - mirror simulation wording */}
          <div>
            <div
              style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}
            >
              Balance Information
            </div>
            <div>
              Balance Before (Available): {batch.balanceBefore}
            </div>
            <div>
              Balance After (Available - Paid): {batch.balanceAfter}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

