'use client'

import { useEffect, useRef, useState } from 'react'
import { businessTodayYmd } from '@/lib/datetime-policy'
import { formatAmount } from '@/lib/fuelPayments'
import { formatInvoiceDate, getDueDateStatus } from '@/lib/invoiceHelpers'
import html2canvas from 'html2canvas'

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  type: string
  invoiceDate: string
  dueDate: string
  status: string
}

interface Simulation {
  id: string
  simulationDate: string
  transferDescription: string
  invoices: Invoice[]
  totalAmount: number
}

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')

export function FuelMakePaymentModal({
  open,
  initialSelectedCsv,
  onClose,
  onSuccess
}: {
  open: boolean
  initialSelectedCsv: string
  onClose: () => void
  onSuccess: (batchId: string) => void
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState('')
  const [bankRef, setBankRef] = useState('')
  const [transferDescription, setTransferDescription] = useState('')
  const [addToCashbook, setAddToCashbook] = useState(true)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [simulatedKey, setSimulatedKey] = useState('')
  const imageRef = useRef<HTMLDivElement>(null)

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fuel-payments/invoices?status=pending')
      if (res.ok) {
        const data: Invoice[] = await res.json()
        setInvoices(data)
        if (initialSelectedCsv.trim()) {
          const wanted = new Set(
            initialSelectedCsv
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          )
          const next = new Set<string>(
            data.filter((inv) => wanted.has(inv.id)).map((inv) => inv.id)
          )
          setSelectedInvoiceIds(next)
        } else {
          setSelectedInvoiceIds(new Set())
        }
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setPaymentDate(businessTodayYmd())
    setBankRef('')
    setTransferDescription('')
    setAddToCashbook(true)
    setProcessing(false)
    setSimulation(null)
    setSimulatedKey('')
    void fetchInvoices()
  }, [open, initialSelectedCsv])

  useEffect(() => {
    const selectedInvoices = invoices
      .filter((inv) => selectedInvoiceIds.has(inv.id))
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber))

    if (selectedInvoices.length === 0) {
      setTransferDescription('')
      return
    }

    setTransferDescription(`Total Auto ${selectedInvoices.map((inv) => inv.invoiceNumber).join(' ')}`)
  }, [invoices, selectedInvoiceIds])

  useEffect(() => {
    const selectionKey = `${paymentDate}|${Array.from(selectedInvoiceIds).sort().join(',')}`
    if (!selectionKey || selectedInvoiceIds.size === 0) {
      if (simulation) setSimulation(null)
      if (simulatedKey) setSimulatedKey('')
      return
    }
    if (simulation && selectionKey !== simulatedKey) {
      setSimulation(null)
    }
  }, [paymentDate, selectedInvoiceIds, simulatedKey, simulation])

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

  const handleMakePayment = async () => {
    if (selectedInvoiceIds.size === 0) {
      alert('Please select at least one invoice')
      return
    }
    if (!bankRef.trim()) {
      alert('Please enter a bank reference number')
      return
    }

    const confirmed = window.confirm(
      `Mark ${selectedInvoiceIds.size} invoice${selectedInvoiceIds.size !== 1 ? 's' : ''} as paid?\n\nPayment Date: ${formatInvoiceDate(paymentDate)}\nBank Ref: ${bankRef.trim()}${addToCashbook ? '\n\nAdd to Cashbook as expense: Yes' : ''}`
    )
    if (!confirmed) return

    setProcessing(true)
    try {
      const res = await fetch('/api/fuel-payments/make-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate,
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

  const handleCopyDescription = async () => {
    if (!transferDescription.trim()) return
    try {
      await navigator.clipboard.writeText(transferDescription)
    } catch (error) {
      console.error('Failed to copy transfer description:', error)
      alert('Failed to copy transfer description')
    }
  }

  const ensureSimulation = async (selectedIds: string[], date: string) => {
    if (selectedIds.length === 0 || !date) return
    setSimulating(true)
    try {
      const res = await fetch('/api/fuel-payments/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationDate: date,
          selectedInvoiceIds: selectedIds
        })
      })

      if (!res.ok) {
        console.error('Failed to generate simulation data')
        return
      }

      const data: Simulation = await res.json()
      setSimulation(data)
      setSimulatedKey(`${date}|${selectedIds.sort().join(',')}`)
    } catch (error) {
      console.error('Error simulating payment:', error)
    } finally {
      setSimulating(false)
    }
  }

  useEffect(() => {
    const selectedIds = Array.from(selectedInvoiceIds)
    if (selectedIds.length === 0 || !paymentDate) return

    const selectionKey = `${paymentDate}|${selectedIds.slice().sort().join(',')}`
    if (selectionKey === simulatedKey || simulating) return

    void ensureSimulation(selectedIds, paymentDate)
  }, [paymentDate, selectedInvoiceIds, simulatedKey, simulating])

  const generateImage = async (): Promise<string> => {
    if (!imageRef.current || !simulation) throw new Error('Cannot generate image')
    const canvas = await html2canvas(imageRef.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false
    })
    return canvas.toDataURL('image/png')
  }

  const handleCopyPNG = async () => {
    try {
      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch (error) {
      console.error('Error copying PNG:', error)
      alert('Failed to copy PNG')
    }
  }

  const handleWhatsApp = async () => {
    try {
      const dataUrl = await generateImage()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'proposed-payment.png', { type: 'image/png' })

      if (isMobileDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Proposed Payment' })
        return
      }

      if (navigator.clipboard && 'write' in navigator.clipboard && (window as any).ClipboardItem) {
        const clipboardItem = new (window as any).ClipboardItem({ 'image/png': blob })
        await (navigator.clipboard as any).write([clipboardItem])
        window.open('https://web.whatsapp.com/send', '_blank')
        alert('PNG copied. Paste in WhatsApp Web with Ctrl+V.')
        return
      }

      alert('Your browser cannot share images directly to WhatsApp Web.')
    } catch (error) {
      console.error('Error sharing via WhatsApp:', error)
      alert('Failed to share via WhatsApp Web')
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
        aria-labelledby="fuel-make-payment-title"
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="fuel-make-payment-title" className="text-2xl font-bold text-gray-900">
              Mark selected as paid
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Confirm payment details and mark pending invoices as paid.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {simulating && selectedInvoiceIds.size > 0 && (
              <span className="text-sm text-gray-500">Preparing simulation...</span>
            )}
            {simulation && selectedInvoiceIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handleCopyPNG()}
                  className="rounded bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700"
                >
                  Copy PNG
                </button>
                <button
                  type="button"
                  onClick={() => void handleWhatsApp()}
                  className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                >
                  WhatsApp Web
                </button>
                <a
                  href={`/api/fuel-payments/simulate/${simulation.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-gray-600 px-4 py-2 font-semibold text-white hover:bg-gray-700"
                >
                  PDF
                </a>
              </>
            )}
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Payment details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                Bank ref (numbers only)
              </label>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g., 18921926"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Transfer description (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                  placeholder="e.g., Total Auto INV001 INV002"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyDescription()}
                  disabled={!transferDescription.trim()}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="fuelAddToCashbook"
                checked={addToCashbook}
                onChange={(e) => setAddToCashbook(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="fuelAddToCashbook" className="text-sm text-gray-700">
                Add to Cashbook as expense
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Pending invoices ({invoices.length})
            </h3>
            {invoices.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedInvoiceIds.size === invoices.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray-600 py-8 text-center">Loading invoices...</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No pending invoices available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === invoices.length && invoices.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => {
                    const dueStatus = getDueDateStatus(invoice.dueDate)
                    return (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(invoice.id)}
                            onChange={() => handleToggleInvoice(invoice.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatInvoiceDate(invoice.invoiceDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold border ${dueStatus.className}`}
                          >
                            {formatInvoiceDate(invoice.dueDate)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {formatAmount(invoice.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {invoice.type}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <span className="text-sm text-gray-700">
            {selectedInvoiceIds.size} selected · Total:{' '}
            <span className="font-semibold text-gray-900">{formatAmount(selectedTotal)}</span>
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="rounded bg-gray-500 px-4 py-2 font-semibold text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleMakePayment()}
              disabled={processing || selectedInvoiceIds.size === 0 || !bankRef.trim()}
              className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Make payment'}
            </button>
          </div>
        </div>
        {simulation && (
          <div
            ref={imageRef}
            className="fixed -left-[9999px] top-0 w-[800px] bg-white p-8"
            style={{ fontFamily: 'monospace, Courier, monospace', fontSize: '14px', lineHeight: '1.5', color: '#000000' }}
          >
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '16px' }}>
                Proposed Payment - {formatInvoiceDate(simulation.simulationDate)}
              </div>
              {simulation.invoices.map((inv) => (
                <div key={inv.id} style={{ marginBottom: '4px' }}>
                  <span style={{ fontWeight: 'bold', display: 'inline-block', width: '70px' }}>{inv.invoiceNumber}</span>
                  <span style={{ display: 'inline-block', width: '100px', textAlign: 'right' }}>{formatAmount(inv.amount)}</span>
                  <span style={{ display: 'inline-block', width: '140px', marginLeft: '20px' }}>{`Due ${formatInvoiceDate(inv.dueDate)}`}</span>
                  <span style={{ display: 'inline-block', width: '80px', marginLeft: '20px' }}>{inv.type}</span>
                </div>
              ))}
              <div style={{ marginTop: '8px', fontWeight: 'bold', marginLeft: '90px' }}>
                Total: {formatAmount(simulation.totalAmount)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
