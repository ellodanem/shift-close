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
        if (data.summary) {
          setBatch(data.summary as PaidBatch)
        } else {
          setBatch({
            datePaid: data.paymentDate,
            referenceNumber: data.bankRef,
            totalPaid: String(data.totalAmount),
            balanceBefore: '-',
            balanceAfter: '-',
            invoices: (data.invoices || []).map((inv: Record<string, unknown>) => ({
              invoiceNumber: String(inv.invoiceNumber ?? ''),
              amount: String(inv.amount ?? ''),
              type: String(inv.type ?? ''),
              invoiceDate:
                typeof inv.invoiceDate === 'string' && inv.invoiceDate.includes('T')
                  ? formatInvoiceDate(inv.invoiceDate)
                  : String(inv.invoiceDate ?? ''),
              dueDate:
                typeof inv.dueDate === 'string' && inv.dueDate.includes('T')
                  ? formatInvoiceDate(inv.dueDate)
                  : String(inv.dueDate ?? '')
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
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      alert('Image copied to clipboard!')
    } catch (error) {
      console.error('Error copying PNG:', error)
      alert('Failed to copy PNG to clipboard')
    }
  }

  const handleWhatsApp = async () => {
    try {
      if (!batch) return

      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'fuel-payment.png', { type: 'image/png' })

      if (isMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Fuel Payment'
        })
        return
      }

      if (navigator.clipboard && 'write' in navigator.clipboard && window.ClipboardItem) {
        try {
          const clipboardItem = new ClipboardItem({ 'image/png': blob })
          await navigator.clipboard.write([clipboardItem])
          window.open('https://web.whatsapp.com/send', '_blank')
          alert('Image copied to clipboard. Paste into WhatsApp Web (Ctrl+V).')
          return
        } catch (clipboardError) {
          console.error('Error copying PNG for WhatsApp Web:', clipboardError)
        }
      }

      alert(
        'Your browser cannot share images directly to WhatsApp. Please download or copy the PNG manually.'
      )
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error)
      alert('Failed to open WhatsApp Web')
    }
  }

  if (loading || !batch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-4 sm:p-8">
        <p className="text-gray-600">Loading payment details...</p>
      </div>
    )
  }

  const balanceAfterNegative = batch.balanceAfter.startsWith('-')

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 pb-10 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Share Paid Payment</h1>
            <p className="mt-1 text-sm text-gray-600">
              Download, copy, or share a summary of this paid fuel payment with your accountant.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4">
            <button
              type="button"
              onClick={() => router.push('/fuel-payments/batches')}
              className="min-h-[44px] rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 sm:min-h-0"
            >
              ← Batches
            </button>
            <button
              type="button"
              onClick={() => router.push('/fuel-payments/invoices')}
              className="min-h-[44px] rounded bg-gray-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 sm:min-h-0"
            >
              Invoices
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Paid Payment Summary</h3>
              <p className="mt-1 text-xs text-gray-500">
                Batch reference <span className="font-mono">{batch.referenceNumber}</span>
              </p>
            </div>
            <div className="text-left text-xs sm:text-right">
              <div className="text-gray-600">Date Paid</div>
              <div className="font-medium text-gray-900">{batch.datePaid}</div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-gray-600">Total Paid</div>
              <div className="font-semibold text-gray-900">{batch.totalPaid}</div>
            </div>
            <div>
              <div className="mb-1 font-medium text-gray-600">Balance Before (Available)</div>
              <div className="font-semibold text-gray-900">{batch.balanceBefore}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 font-medium text-gray-600">
                Balance After (Available - Paid)
              </div>
              <div
                className={
                  balanceAfterNegative
                    ? 'font-semibold text-red-600'
                    : 'font-semibold text-green-600'
                }
              >
                {batch.balanceAfter}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-gray-600">
              Invoices in this payment ({batch.invoices.length})
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-gray-100 bg-gray-50 sm:max-h-40">
              {batch.invoices.map((inv, idx) => (
                <div
                  key={`${inv.invoiceNumber}-${idx}`}
                  className="flex justify-between border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0"
                >
                  <div className="min-w-0 flex-col">
                    <span className="font-mono text-gray-900">{inv.invoiceNumber}</span>
                    <span className="block text-[10px] text-gray-500">
                      {inv.invoiceDate} · {inv.type}
                    </span>
                  </div>
                  <span className="shrink-0 text-gray-600">{inv.amount}</span>
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
            <button
              type="button"
              onClick={() => void handleWhatsApp()}
              className="min-h-[44px] rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 sm:min-h-0"
            >
              WhatsApp
            </button>
          </div>
        </div>

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
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
              Fuel Payment - {batch.datePaid}
            </div>

            {batch.invoices.map((inv) => (
              <div key={inv.invoiceNumber} style={{ marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', display: 'inline-block', width: '70px' }}>
                  {inv.invoiceNumber}
                </span>
                <span style={{ display: 'inline-block', width: '100px', textAlign: 'right' }}>
                  {inv.amount}
                </span>
                <span style={{ display: 'inline-block', width: '80px', marginLeft: '20px' }}>
                  {inv.type}
                </span>
              </div>
            ))}

            <div style={{ marginTop: '4px', marginBottom: '4px' }}>
              <span style={{ display: 'inline-block', width: '70px' }} />
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
              <span style={{ display: 'inline-block', width: '80px', marginLeft: '20px' }} />
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
              <span style={{ color: '#1d4ed8', fontWeight: 'bold' }}>
                {batch.referenceNumber}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
              Balance Information
            </div>
            <div>Balance Before (Available): {batch.balanceBefore}</div>
            <div>Balance After (Available - Paid): {batch.balanceAfter}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
